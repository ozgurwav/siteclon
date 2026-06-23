// Express API used locally (`server/local.ts`) and on Vercel via `api/index.ts`.
// Kept under `server/` so Vercel routes all `/api/*` to a single function (`api/index.ts`).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

function stripUtf8Bom(s: string) {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function loadDotenvFromRepoRoot() {
  const fromFile = (() => {
    try {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    } catch {
      return '';
    }
  })();
  const candidates = [fromFile, process.cwd()].filter(Boolean);
  const seen = new Set<string>();
  let loadedFrom: string | null = null;
  for (const root of candidates) {
    const n = path.normalize(root);
    if (seen.has(n)) continue;
    seen.add(n);
    const envPath = path.join(n, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loadedFrom = envPath;
      const loc = path.join(n, '.env.local');
      if (fs.existsSync(loc)) dotenv.config({ path: loc, override: true });
      break;
    }
  }
  if (!loadedFrom) {
    dotenv.config();
    // eslint-disable-next-line no-console
    console.warn('[aiag] .env not found under repo root or cwd; using default dotenv search');
  } else {
    // eslint-disable-next-line no-console
    console.log('[aiag] loaded .env from', loadedFrom);
  }
}
loadDotenvFromRepoRoot();

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadIyzipay(): any {
  return require('iyzipay');
}

let _prisma: PrismaClient | null = null;
function prisma() {
  if (_prisma) return _prisma;
  _prisma = new PrismaClient();
  return _prisma;
}

async function query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
  const rows = (await prisma().$queryRawUnsafe(text, ...params)) as T[];
  return { rows };
}
async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const r = await query<T>(text, params);
  return r.rows[0] ?? null;
}
async function many<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await query<T>(text, params);
  return r.rows;
}

export const app = express();
app.use(cookieParser());

void prisma().$queryRaw`SELECT 1`.catch((e) => console.error('[aiag] DB connectivity check failed', e));

function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, value) => (typeof value === 'bigint' ? Number(value) : value))) as T;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRole(raw: unknown): 'admin' | 'customer' {
  const v = String(raw || '').toLowerCase();
  if (v === 'admin') return 'admin';
  return 'customer';
}

type AuthedUser = { id: number; email: string; name: string; role: 'admin' | 'customer' };

function sha256Hex(v: string) {
  return crypto.createHash('sha256').update(v).digest('hex');
}

async function issueSession(res: express.Response, user: AuthedUser) {
  const token = crypto.randomBytes(32).toString('hex');
  const token_hash = sha256Hex(token);
  const now = Date.now();
  const created_at = new Date(now).toISOString();
  const expires_at = new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString(); // 14d
  await query(
    `INSERT INTO sessions (user_id, token_hash, role, created_at, expires_at)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
    [user.id, token_hash, user.role, created_at, expires_at],
  );
  res.cookie('aiag_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const raw = String((req as any).cookies?.aiag_session || '').trim();
  if (!raw) return res.status(401).json({ error: 'unauthorized' });
  const token_hash = sha256Hex(raw);
  const row = await one<{ user_id: unknown; user_role: string; email: string; name: string; expires_at: string }>(
    `SELECT s.user_id, u.role as user_role, u.email, u.name, s.expires_at::text as expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
     ORDER BY s.id DESC LIMIT 1`,
    [token_hash],
  );
  if (!row) return res.status(401).json({ error: 'unauthorized' });
  if (Date.parse(row.expires_at) < Date.now()) return res.status(401).json({ error: 'unauthorized' });
  const role = normalizeRole(row.user_role);
  const idRaw = row.user_id as any;
  const userId =
    typeof idRaw === 'bigint'
      ? Number(idRaw)
      : typeof idRaw === 'number'
        ? idRaw
        : Number(String(idRaw || ''));
  if (!Number.isFinite(userId)) return res.status(401).json({ error: 'unauthorized' });
  (req as any).user = { id: userId, email: row.email, name: row.name, role } satisfies AuthedUser;
  return next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const u = (req as any).user as AuthedUser | undefined;
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  if (u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  return next();
}

const SITE_EDITABLE_ASSETS_KEY = 'site_editable_assets_v1';

async function getSetting(key: string): Promise<string | null> {
  const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [key]);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, value],
  );
}

function parseEditableAssetsBlob(raw: string | null): Record<string, string> {
  if (!raw || !String(raw).trim()) return {};
  try {
    const p = JSON.parse(String(raw)) as unknown;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof k !== 'string' || k.length > 512) continue;
      if (typeof v !== 'string') continue;
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const siteAssetsJsonParser = express.json({ limit: '35mb' });

app.get('/api/site/assets', async (_req, res) => {
  try {
    const raw = await getSetting(SITE_EDITABLE_ASSETS_KEY);
    const assets = parseEditableAssetsBlob(raw);
    return res.json({ ok: true, assets });
  } catch (e) {
    console.error('[aiag] GET /api/site/assets', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.patch('/api/admin/site-assets', siteAssetsJsonParser, requireAuth, requireAdmin, async (req, res) => {
  try {
    const current = parseEditableAssetsBlob(await getSetting(SITE_EDITABLE_ASSETS_KEY));
    const set = (req as any).body?.set as Record<string, unknown> | undefined;
    const remove = (req as any).body?.remove as unknown;
    const MAX_V = 24 * 1024 * 1024;
    if (set && typeof set === 'object' && !Array.isArray(set)) {
      for (const [k, v] of Object.entries(set)) {
        if (typeof k !== 'string' || k.length > 512) continue;
        if (typeof v !== 'string') continue;
        if (v.length > MAX_V) continue;
        current[k] = v;
      }
    }
    if (Array.isArray(remove)) {
      for (const k of remove) {
        if (typeof k === 'string' && k.length <= 512) delete current[k];
      }
    }
    const nextJson = JSON.stringify(current);
    if (nextJson.length > 40 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'payload_too_large' });
    }
    await setSetting(SITE_EDITABLE_ASSETS_KEY, nextJson);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[aiag] PATCH /api/admin/site-assets', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'yonetici@mail.com').trim().toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '1234';
const DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    iyzipay: {
      configured: iyzipayEnvConfigured(),
      hasApiKey: Boolean(iyzipayApiKey()),
      hasSecretKey: Boolean(iyzipaySecretKey()),
      hasUri: Boolean(iyzipayUri()),
    },
  }),
);

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('aiag_session', { path: '/' });
  return res.json({ ok: true });
});

app.post('/api/auth/signup', async (req, res) => {
  const name = String((req as any).body?.name || '').trim();
  const email = String((req as any).body?.email || '').trim().toLowerCase();
  const password = String((req as any).body?.password || '');
  if (!name || name.length < 3) return res.status(400).json({ ok: false, error: 'invalid_name' });
  if (!email || !isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'weak_password' });
  const exists = await one<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (exists) return res.status(409).json({ ok: false, error: 'email_exists' });
  const hasAdmin = await one<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users WHERE role='admin'`, []);
  const role = hasAdmin && Number(hasAdmin.c) > 0 ? 'customer' : 'admin';
  const password_hash = await bcrypt.hash(password, 10);
  const created_at = new Date().toISOString();
  await query(
    `INSERT INTO users (email, name, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz)`,
    [email, name, password_hash, role, created_at],
  );
  return res.json({ ok: true, role });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String((req as any).body?.email || '').trim().toLowerCase();
  const password = String((req as any).body?.password || '');
  if (!email || !isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  if (!password) return res.status(400).json({ ok: false, error: 'missing_password' });

  if (DEMO_ENABLED && email === DEMO_EMAIL && password === DEMO_PASSWORD) {
    const existing = await one<{ id: number; role: string }>(`SELECT id, role FROM users WHERE email = $1`, [email]);
    let userId = existing?.id;
    if (!userId) {
      const created_at = new Date().toISOString();
      const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
      const r = await one<{ id: number }>(
        `INSERT INTO users (email, name, password_hash, role, created_at)
         VALUES ($1, $2, $3, 'admin', $4::timestamptz)
         RETURNING id`,
        [email, 'Yönetici', password_hash, created_at],
      );
      userId = r?.id as number;
    } else if (normalizeRole(existing.role) !== 'admin') {
      await query(`UPDATE users SET role='admin' WHERE id=$1`, [userId]);
    }
    await issueSession(res, { id: userId, email, name: 'Yönetici', role: 'admin' });
    return res.json({ ok: true, role: 'admin', user: { id: userId, email, name: 'Yönetici' } });
  }

  const row = await one<{ id: number; email: string; name: string; password_hash: string; role: string }>(
    `SELECT id, email, name, password_hash, role FROM users WHERE email = $1`,
    [email],
  );
  if (!row) return res.status(401).json({ ok: false });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ ok: false });
  await issueSession(res, { id: row.id, email: row.email, name: row.name, role: normalizeRole(row.role) });
  return res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = (req as any).user as AuthedUser;
  return res.json({ ok: true, role: u.role, user: { id: u.id, email: u.email, name: u.name } });
});

async function tryGetUserIdFromCookie(req: express.Request): Promise<number | null> {
  const raw = String((req as any).cookies?.aiag_session || '').trim();
  if (!raw) return null;
  const token_hash = sha256Hex(raw);
  const row = await one<{ user_id: number; expires_at: string }>(
    `SELECT user_id, expires_at::text as expires_at FROM sessions WHERE token_hash=$1 ORDER BY id DESC LIMIT 1`,
    [token_hash],
  );
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return row.user_id;
}

/** 09:00 … 16:30 in 30-minute steps (slot ends before 17:00). */
function isAllowedBookingSlotStart(start: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(start);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return false;
  if (min !== 0 && min !== 30) return false;
  const t = h * 60 + min;
  return t >= 9 * 60 && t < 17 * 60;
}

function bookingSlotEnd(start: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(start);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  let t = h * 60 + min + 30;
  if (t > 17 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function normalizeSecretEnv(raw: string): string {
  const value = stripUtf8Bom(raw).trim();
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value;
  return unquoted.replace(/\s+/g, '');
}

function iyzipayApiKey(): string {
  return normalizeSecretEnv(String(process.env.IYZIPAY_API_KEY || process.env.SANDBOX_API_KEY || ''));
}

function iyzipaySecretKey(): string {
  return normalizeSecretEnv(
    String(
      process.env.IYZIPAY_SECRET_KEY ||
        process.env.SANDBOX_SECRET_KEY ||
        process.env.SANDBOX_SECURITY_KEY ||
        process.env.IYZICO_SECRET_KEY ||
        '',
    ),
  ).trim();
}

function normalizeIyzipayUri(raw: string): string {
  const value = stripUtf8Bom(raw).trim().replace(/\/+$/, '');
  if (!value) return '';
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `https://${value}`;
}

function iyzipayUri(): string {
  const explicit = normalizeIyzipayUri(String(process.env.IYZIPAY_URI || process.env.IYZICO_URI || ''));
  if (explicit) return explicit;
  const k = iyzipayApiKey();
  if (k.startsWith('sandbox-')) return 'https://sandbox-api.iyzipay.com';
  return '';
}

function iyzipayEnvConfigured(): boolean {
  return Boolean(iyzipayApiKey() && iyzipaySecretKey() && iyzipayUri());
}

function iyzipayMissingConfigUserMessage(): string {
  const lines = [
    'Sunucu IYZIPAY_API_KEY, IYZIPAY_SECRET_KEY ve IYZIPAY_URI görmüyor (.env yüklenmedi veya anahtar boş).',
    'Kontrol: tarayıcıda /api/health → iyzipay.hasApiKey / hasSecretKey / hasUri hepsi true olmalı.',
  ];
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    lines.push(
      'Bu ortam Vercel: .env dosyası burada okunmaz. Vercel Dashboard → Project → Settings → Environment Variables bölümüne IYZIPAY_API_KEY, IYZIPAY_SECRET_KEY, IYZIPAY_URI (sandbox için https://sandbox-api.iyzipay.com) ekle; gerekirse APP_URL ve API_PUBLIC_URL (örn. https://senin-projen.vercel.app) tanımla. Kaydettikten sonra yeni bir deploy tetikle.',
    );
  } else {
    lines.push(
      'Yerelde: .env.local içinde VITE_DEV_API_PORT, PORT ile aynı olmalı (örn. 3003). Ardından API sürecini durdurup tekrar npm run server çalıştır.',
    );
  }
  return lines.join('\n');
}

function publicApiBase(req: express.Request): string {
  const fromEnv = String(
    process.env.API_PUBLIC_URL ||
      process.env.IYZIPAY_CALLBACK_BASE ||
      process.env.PUBLIC_API_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').trim();
  const proto = String(req.get('x-forwarded-proto') || 'http')
    .split(',')[0]
    .trim();
  if (host) return `${proto}://${host}`;
  const p = String(process.env.PORT || '3001').trim() || '3001';
  return `http://127.0.0.1:${p}`;
}

function publicFrontendBase(): string {
  const u = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (u) return u;
  return 'http://127.0.0.1:3000';
}

function clientIp(req: express.Request): string {
  const x = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (x) return x.slice(0, 45);
  const raw = (req.socket as any)?.remoteAddress as string | undefined;
  return String(raw || '127.0.0.1')
    .replace('::ffff:', '')
    .slice(0, 45);
}

function splitPersonName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: 'Misafir', last: 'Musteri' };
  const i = t.indexOf(' ');
  if (i === -1) return { first: t.slice(0, 40), last: 'Musteri' };
  const last = t.slice(i + 1).trim().slice(0, 40);
  return { first: t.slice(0, i).slice(0, 40), last: last || 'Musteri' };
}

function formatGsmTr(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.startsWith('90')) d = d.slice(2);
  if (d.length >= 10) return `+90${d.slice(-10)}`;
  return '+905000000000';
}

function newIyzipayClient(): { Iyzipay: any; client: any } {
  const Iyzipay = loadIyzipay();
  const client = new Iyzipay({
    apiKey: iyzipayApiKey(),
    secretKey: iyzipaySecretKey(),
    uri: iyzipayUri(),
  });
  return { Iyzipay, client };
}

function iyzipayCheckoutFormInitialize(client: any, payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    client.checkoutFormInitialize.create(payload, (err: unknown, result: any) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function iyzipayCheckoutFormRetrieve(client: any, payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    client.checkoutForm.retrieve(payload, (err: unknown, result: any) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function toIyzicoPrice(value: unknown): number {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function priceString(value: number): string {
  return value.toFixed(2);
}

async function startIyzipayCheckoutForCart(req: express.Request): Promise<IyzipayCheckoutStart> {
  if (!iyzipayEnvConfigured()) {
    return { ok: false, reason: 'env', iyzico: { errorMessage: 'IYZIPAY_API_KEY / IYZIPAY_SECRET_KEY / IYZIPAY_URI eksik' } };
  }

  const body = (req as any).body || {};
  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  const items = itemsRaw
    .map((item: any, idx: number) => {
      const quantity = Math.max(1, Math.min(99, Number(item?.quantity || 1) || 1));
      const unitPrice = toIyzicoPrice(item?.price);
      const total = unitPrice * quantity;
      return {
        id: String(item?.id || `item-${idx + 1}`).slice(0, 64),
        name: String(item?.name || `Urun ${idx + 1}`).slice(0, 128),
        quantity,
        unitPrice,
        total,
      };
    })
    .filter((item: any) => item.unitPrice > 0 && item.total > 0);

  const total = items.reduce((sum: number, item: any) => sum + item.total, 0);
  if (!items.length || total <= 0) return { ok: false, reason: 'amount', iyzico: { errorMessage: 'Sepet tutarı 0' } };

  const buyerInput = body.buyer || {};
  const name = String(buyerInput.name || 'Ezgi').trim();
  const surname = String(buyerInput.surname || 'Musteri').trim();
  const email = String(buyerInput.email || 'sandbox@example.com').trim().toLowerCase();
  const phone = String(buyerInput.phone || '+905000000000').trim();
  const address = String(buyerInput.address || process.env.IYZIPAY_DEFAULT_ADDRESS || 'Turkiye').trim();

  const { Iyzipay, client } = newIyzipayClient();
  const conversationId = `cart-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const callbackUrl = `${publicApiBase(req)}/api/payments/iyzipay/cart/return`;
  const identityNumber = String(process.env.IYZIPAY_DEFAULT_IDENTITY || '74300864791').trim();

  const buyer = {
    id: `buyer-${crypto.randomBytes(4).toString('hex')}`,
    name: name || 'Ezgi',
    surname: surname || 'Musteri',
    gsmNumber: formatGsmTr(phone),
    email: isValidEmail(email) ? email : 'sandbox@example.com',
    identityNumber,
    registrationAddress: address,
    city: 'Istanbul',
    country: 'Turkey',
    zipCode: '34000',
    ip: clientIp(req),
  };

  const addr = {
    contactName: `${buyer.name} ${buyer.surname}`.trim(),
    city: 'Istanbul',
    country: 'Turkey',
    address,
    zipCode: '34000',
  };

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price: priceString(total),
    paidPrice: priceString(total),
    currency: Iyzipay.CURRENCY.TRY,
    basketId: conversationId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl,
    enabledInstallments: [1, 2, 3, 6, 9],
    buyer,
    shippingAddress: addr,
    billingAddress: addr,
    basketItems: items.map((item: any) => ({
      id: item.id,
      name: item.name,
      category1: 'Ev Tekstili',
      itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
      price: priceString(item.total),
    })),
  };

  let result: any;
  try {
    result = await iyzipayCheckoutFormInitialize(client, request);
  } catch (e) {
    console.error('[aiag] iyzipay cart checkoutFormInitialize', e);
    return { ok: false, reason: 'iyzipay_network', iyzico: { errorMessage: String((e as any)?.message || e || 'Ağ hatası') } };
  }

  if (!result || String(result.status).toLowerCase() !== 'success') {
    return {
      ok: false,
      reason: 'iyzipay_declined',
      iyzico: {
        errorMessage: result?.errorMessage || 'iyzico başarısız yanıt',
        errorCode: result?.errorCode,
        status: result?.status,
      },
    };
  }

  const token = String(result.token || '').trim();
  const checkoutHtml = String(result.checkoutFormContent || '').trim();
  if (!token || !checkoutHtml) {
    return { ok: false, reason: 'iyzipay_declined', iyzico: { errorMessage: 'iyzico checkout form eksik döndü', status: result?.status } };
  }
  return { ok: true, checkoutFormContent: checkoutHtml, token };
}

type IyzipayCheckoutStart =
  | { ok: true; checkoutFormContent: string; token: string }
  | {
      ok: false;
      reason: 'env' | 'db' | 'state' | 'amount' | 'iyzipay_network' | 'iyzipay_declined';
      iyzico?: { errorMessage?: string; errorCode?: string; status?: string };
    };

async function startIyzipayCheckoutForBooking(
  bookingId: number,
  req: express.Request,
): Promise<IyzipayCheckoutStart> {
  if (!iyzipayEnvConfigured()) {
    return { ok: false, reason: 'env', iyzico: { errorMessage: 'IYZIPAY_API_KEY / IYZIPAY_SECRET_KEY / IYZIPAY_URI eksik' } };
  }

  const row = await one<{
    booking_email: string;
    name: string;
    phone: string | null;
    status: string;
    deposit_minor: string | null;
    currency: string | null;
    category_name: string | null;
  }>(
    `SELECT b.email as booking_email, b.name, b.phone, b.status,
            c.deposit_amount_minor::text as deposit_minor, c.currency, c.name as category_name
     FROM calendar_bookings b
     LEFT JOIN booking_categories c ON c.id = b.category_id
     WHERE b.id = $1`,
    [bookingId],
  );
  if (!row) return { ok: false, reason: 'db', iyzico: { errorMessage: 'Rezervasyon bulunamadı' } };
  if (String(row.status) !== 'pending') {
    return { ok: false, reason: 'state', iyzico: { errorMessage: 'Rezervasyon bu ödeme için uygun durumda değil' } };
  }

  const minor = BigInt(row.deposit_minor || '0');
  if (minor <= 0n) return { ok: false, reason: 'amount', iyzico: { errorMessage: 'Kapora tutarı 0' } };

  const { Iyzipay, client } = newIyzipayClient();
  const priceStr = (Number(minor) / 100).toFixed(2);
  const callbackUrl = `${publicApiBase(req)}/api/payments/iyzipay/return`;
  const conversationId = `bk-${bookingId}-${crypto.randomBytes(6).toString('hex')}`;

  const { first, last } = splitPersonName(row.name);
  const identityNumber = String(process.env.IYZIPAY_DEFAULT_IDENTITY || '74300864791').trim();
  const registryAddr = String(process.env.IYZIPAY_DEFAULT_ADDRESS || 'Turkiye').trim();
  const gsm = formatGsmTr(row.phone || '');

  const buyer = {
    id: `booking-${bookingId}`,
    name: first,
    surname: last,
    gsmNumber: gsm,
    email: row.booking_email,
    identityNumber,
    registrationAddress: registryAddr,
    city: 'Istanbul',
    country: 'Turkey',
    zipCode: '34000',
    ip: clientIp(req),
    registrationDate: '2013-04-21 15:12:09',
    lastLoginDate: '2015-10-05 12:43:35',
  };

  const addr = {
    contactName: `${first} ${last}`.trim(),
    city: 'Istanbul',
    country: 'Turkey',
    address: registryAddr,
    zipCode: '34000',
  };

  const basketItem = {
    id: `deposit-${bookingId}`,
    name: `Kapora — ${row.category_name || 'Randevu'}`,
    category1: 'Hizmet',
    category2: 'Fotograf',
    itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
    price: priceStr,
  };

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price: priceStr,
    paidPrice: priceStr,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: `basket-${bookingId}`,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
    callbackUrl,
    enabledInstallments: [1, 2, 3, 6, 9],
    buyer,
    shippingAddress: addr,
    billingAddress: addr,
    basketItems: [basketItem],
  };

  let result: any;
  try {
    result = await iyzipayCheckoutFormInitialize(client, request);
  } catch (e) {
    console.error('[aiag] iyzipay checkoutFormInitialize', e);
    return {
      ok: false,
      reason: 'iyzipay_network',
      iyzico: { errorMessage: String((e as any)?.message || e || 'Ağ hatası') },
    };
  }

  if (!result || String(result.status) !== 'success') {
    console.error('[aiag] iyzipay checkoutFormInitialize declined', JSON.stringify(result));
    return {
      ok: false,
      reason: 'iyzipay_declined',
      iyzico: {
        status: result?.status,
        errorCode: result?.errorCode,
        errorMessage: result?.errorMessage || 'iyzico başarısız yanıt',
      },
    };
  }

  const formToken = String(result.token || '');
  if (!formToken) {
    return {
      ok: false,
      reason: 'iyzipay_declined',
      iyzico: { errorMessage: 'iyzico token dönmedi', status: result?.status },
    };
  }
  const checkoutHtml = String(result.checkoutFormContent || '').trim();
  if (!checkoutHtml) {
    return {
      ok: false,
      reason: 'iyzipay_declined',
      iyzico: { errorMessage: 'iyzico ödeme formu HTML dönmedi (checkoutFormContent boş).', status: result?.status },
    };
  }
  const convReturned = String(result.conversationId || conversationId);

  await query(`DELETE FROM payment_requests WHERE booking_id=$1 AND status <> 'paid'`, [bookingId]);
  await query(
    `INSERT INTO payment_requests (booking_id, provider, kind, amount_minor, currency, status, provider_ref, pay_url)
     VALUES ($1, 'iyzipay', 'checkout_form', $2, $3, 'awaiting_payment', $4, $5)`,
    [bookingId, minor, (row.currency || 'try').toLowerCase(), formToken, convReturned],
  );

  return { ok: true, checkoutFormContent: checkoutHtml, token: formToken };
}

async function getMaxBookingsPerDay(): Promise<number> {
  const raw = await getSetting('calendar.max_bookings_per_day');
  let n = Number(raw ?? '');
  if (!Number.isFinite(n) || n < 1) n = 16;
  return Math.min(100, Math.floor(n));
}

app.get('/api/calendar/public-settings', async (_req, res) => {
  return res.json({ ok: true, maxBookingsPerDay: await getMaxBookingsPerDay() });
});

app.patch('/api/admin/calendar-rules', requireAuth, requireAdmin, async (req, res) => {
  const n = Number((req as any).body?.maxBookingsPerDay);
  if (!Number.isFinite(n) || n < 1 || n > 100) return res.status(400).json({ ok: false, error: 'bad_max' });
  await setSetting('calendar.max_bookings_per_day', String(Math.floor(n)));
  return res.json({ ok: true, maxBookingsPerDay: await getMaxBookingsPerDay() });
});

app.get('/api/bookings/booked', async (req, res) => {
  const from = String((req as any).query?.from || '').trim();
  const to = String((req as any).query?.to || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ ok: false, error: 'bad_range' });
  }
  const rows = await many<{ date: string; slotStart: string }>(
    `SELECT booking_date::text AS date, slot_start AS "slotStart"
     FROM calendar_bookings
     WHERE booking_date >= $1::date AND booking_date <= $2::date
       AND status IN ('pending','confirmed')`,
    [from, to],
  );
  return res.json({ ok: true, slots: rows });
});

app.post('/api/bookings', async (req, res) => {
  const name = String((req as any).body?.name || '').trim();
  const email = String((req as any).body?.email || '').trim().toLowerCase();
  const phone = (req as any).body?.phone != null ? String((req as any).body.phone).trim() : '';
  const booking_date = String((req as any).body?.date || '').trim();
  const slotStart = String((req as any).body?.slotStart || '').trim();
  const note = (req as any).body?.note != null ? String((req as any).body.note).trim() : '';
  const category_id = (req as any).body?.categoryId != null ? Number((req as any).body.categoryId) : null;

  if (!name || name.length < 2) return res.status(400).json({ ok: false, error: 'invalid_name' });
  if (!email || !isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) return res.status(400).json({ ok: false, error: 'invalid_date' });
  if (!isAllowedBookingSlotStart(slotStart)) return res.status(400).json({ ok: false, error: 'invalid_slot' });
  const slot_end = bookingSlotEnd(slotStart);
  if (!slot_end) return res.status(400).json({ ok: false, error: 'invalid_slot' });

  const user_id = await tryGetUserIdFromCookie(req);

  if (category_id != null) {
    const cat = await one<{ id: number }>(`SELECT id FROM booking_categories WHERE id=$1 AND active=TRUE`, [category_id]);
    if (!cat) return res.status(400).json({ ok: false, error: 'invalid_category' });
  }

  const taken = await one<{ id: number }>(
    `SELECT id FROM calendar_bookings
     WHERE booking_date=$1::date AND slot_start=$2 AND status IN ('pending','confirmed')`,
    [booking_date, slotStart],
  );
  if (taken) return res.status(409).json({ ok: false, error: 'slot_taken' });

  const maxPer = await getMaxBookingsPerDay();
  const cnt = await one<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM calendar_bookings
     WHERE booking_date=$1::date AND status IN ('pending','confirmed')`,
    [booking_date],
  );
  if (cnt && Number(cnt.c) >= maxPer) return res.status(409).json({ ok: false, error: 'day_full' });

  const created_at = new Date().toISOString();
  const r = await one<{ id: number }>(
    `INSERT INTO calendar_bookings
      (user_id, category_id, name, email, phone, booking_date, slot_start, slot_end, note, status, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, 'pending', $10::timestamptz)
     RETURNING id`,
    [user_id, category_id, name, email, phone || null, booking_date, slotStart, slot_end, note || null, created_at],
  );
  const bookingId = Number(r?.id || 0);
  let iyzicoCheckout: { checkoutFormContent: string } | undefined;
  let iyzicoError:
    | {
        reason: string;
        message: string;
        code?: string;
        callbackUrl?: string;
      }
    | undefined;

  if (bookingId > 0 && category_id != null) {
    const dep = await one<{ deposit: string }>(
      `SELECT deposit_amount_minor::text as deposit FROM booking_categories WHERE id=$1`,
      [category_id],
    );
    const depMinor = BigInt(dep?.deposit || '0');
    if (depMinor > 0n) {
      if (!iyzipayEnvConfigured()) {
        iyzicoError = {
          reason: 'iyzipay_not_configured',
          message: iyzipayMissingConfigUserMessage(),
          callbackUrl: `${publicApiBase(req)}/api/payments/iyzipay/return`,
        };
      } else {
        const started = await startIyzipayCheckoutForBooking(bookingId, req);
        if (started.ok === true) {
          iyzicoCheckout = { checkoutFormContent: started.checkoutFormContent };
        } else {
          iyzicoError = {
            reason: started.reason,
            message: started.iyzico?.errorMessage || started.reason,
            code: started.iyzico?.errorCode,
            callbackUrl: `${publicApiBase(req)}/api/payments/iyzipay/return`,
          };
        }
      }
    }
  }
  return res.json({ ok: true, id: bookingId, iyzicoCheckout, iyzicoError });
});

async function handleIyzipayReturn(req: express.Request, res: express.Response) {
  const token = String((req.body as any)?.token || (req.query as any)?.token || '').trim();
  const fe = publicFrontendBase();
  // 303: iyzico bu uç noktaya POST atar; 302 bazı istemcilerde Location'a POST tekrarlar → /payment/* için 405.
  if (!token) return res.redirect(303, `${fe}/payment/cancel?reason=missing_token`);
  if (!iyzipayEnvConfigured()) return res.redirect(303, `${fe}/payment/cancel?reason=config`);

  const prRow = await one<{ id: number; pay_url: string | null }>(
    `SELECT id::int as id, pay_url FROM payment_requests WHERE provider_ref=$1 ORDER BY id DESC LIMIT 1`,
    [token],
  );
  if (!prRow) return res.redirect(303, `${fe}/payment/cancel?reason=unknown_token`);

  const { Iyzipay, client } = newIyzipayClient();
  let retrieved: any;
  try {
    retrieved = await iyzipayCheckoutFormRetrieve(client, {
      locale: Iyzipay.LOCALE.TR,
      conversationId: String(prRow.pay_url || ''),
      token,
    });
  } catch (e) {
    console.error('[aiag] iyzipay retrieve', e);
    return res.redirect(303, `${fe}/payment/cancel?reason=retrieve_failed`);
  }

  if (!retrieved || String(retrieved.status) !== 'success') {
    return res.redirect(303, `${fe}/payment/cancel?reason=bad_response`);
  }

  const payStatus = String(retrieved.paymentStatus || '').toUpperCase();
  if (payStatus === 'SUCCESS') {
    await query(
      `UPDATE payment_requests SET status='paid', paid_at=now()::timestamptz WHERE id=$1 AND status <> 'paid'`,
      [prRow.id],
    );
    await query(
      `UPDATE calendar_bookings SET status='confirmed' WHERE id = (SELECT booking_id FROM payment_requests WHERE id=$1)`,
      [prRow.id],
    );
    return res.redirect(303, `${fe}/payment/success?payment_request_id=${prRow.id}`);
  }

  return res.redirect(303, `${fe}/payment/cancel?reason=${encodeURIComponent(payStatus || 'unpaid')}`);
}

app.all('/api/payments/iyzipay/return', async (req, res) => {
  const m = String(req.method || '').toUpperCase();
  if (m === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }
  if (m !== 'GET' && m !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).type('text/plain').send('Method Not Allowed');
  }
  await handleIyzipayReturn(req, res);
});

app.all('/api/payments/iyzipay/cart/return', async (req, res) => {
  const fe = publicFrontendBase();
  const token = String((req as any).body?.token || (req as any).query?.token || '').trim();
  if (!token || !iyzipayEnvConfigured()) return res.redirect(303, `${fe}/#odeme-iptal`);
  try {
    const { client } = newIyzipayClient();
    const retrieved = await iyzipayCheckoutFormRetrieve(client, {
      locale: 'tr',
      conversationId: `cart-return-${Date.now()}`,
      token,
    });
    const status = String(retrieved?.paymentStatus || retrieved?.status || '').toLowerCase();
    const ok = status === 'success' || status === 'paid';
    return res.redirect(303, `${fe}/${ok ? '#odeme-basarili' : '#odeme-iptal'}`);
  } catch (e) {
    console.error('[aiag] iyzipay cart retrieve', e);
    return res.redirect(303, `${fe}/#odeme-iptal`);
  }
});

app.post('/api/payments/iyzipay/cart', async (req, res) => {
  try {
    const started = await startIyzipayCheckoutForCart(req);
    if (started.ok === false) {
      return res.status(started.reason === 'env' ? 503 : 400).json({
        ok: false,
        error: started.reason,
        message: started.iyzico?.errorMessage || started.reason,
        code: started.iyzico?.errorCode,
        callbackUrl: `${publicApiBase(req)}/api/payments/iyzipay/cart/return`,
      });
    }
    return res.json({ ok: true, iyzicoCheckout: { checkoutFormContent: started.checkoutFormContent } });
  } catch (e: any) {
    console.error('[aiag] /api/payments/iyzipay/cart', e);
    return res.status(500).json({ ok: false, error: 'server_error', message: String(e?.message || 'Sunucu hatası') });
  }
});

app.post('/api/payments/iyzipay/initialize', async (req, res) => {
  try {
    if (!iyzipayEnvConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'iyzipay_not_configured',
        message: iyzipayMissingConfigUserMessage(),
        callbackUrl: `${publicApiBase(req)}/api/payments/iyzipay/return`,
      });
    }
    const bookingId = Number((req as any).body?.bookingId);
    const email = String((req as any).body?.email || '').trim().toLowerCase();
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !email || !isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'bad_request',
        message: 'bookingId ve geçerli email gerekli.',
      });
    }
    const row = await one<{ booking_email: string }>(
      `SELECT email as booking_email FROM calendar_bookings WHERE id=$1`,
      [bookingId],
    );
    if (!row) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Bu numaralı rezervasyon bulunamadı (yanlış id veya silinmiş).',
      });
    }
    if (String(row.booking_email).toLowerCase() !== email) {
      return res.status(403).json({
        ok: false,
        error: 'email_mismatch',
        message:
          'E-posta rezervasyonla eşleşmiyor. Rezervasyonu oluştururken yazdığın adresle aynı olmalı (büyük/küçük harf fark etmez).',
      });
    }
    const started = await startIyzipayCheckoutForBooking(bookingId, req);
    if (started.ok === false) {
      return res.status(400).json({
        ok: false,
        error: 'payment_unavailable',
        reason: started.reason,
        message: started.iyzico?.errorMessage || started.reason,
        code: started.iyzico?.errorCode,
        callbackUrl: `${publicApiBase(req)}/api/payments/iyzipay/return`,
      });
    }
    if (!String(started.checkoutFormContent || '').trim()) {
      return res.status(502).json({
        ok: false,
        error: 'empty_checkout_html',
        message: 'iyzico başarılı yanıt verdi ancak ödeme formu HTML boş.',
      });
    }
    return res.json({ ok: true, iyzicoCheckout: { checkoutFormContent: started.checkoutFormContent } });
  } catch (e: any) {
    console.error('[aiag] /api/payments/iyzipay/initialize', e);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: String(e?.message || 'Sunucu hatası (veritabanı veya iyzico çağrısı). Vercel’de DATABASE_URL ve IYZIPAY_* değişkenlerini kontrol et.'),
    });
  }
});

app.get('/api/payments/receipt', async (req, res) => {
  const id = Number((req as any).query?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  const row = await one<{
    id: number;
    status: string;
    booking_id: number;
    amount_minor: string;
    currency: string;
  }>(
    `SELECT pr.id::int as id, pr.status, pr.booking_id::int as booking_id, pr.amount_minor::text as amount_minor, pr.currency
     FROM payment_requests pr WHERE pr.id=$1`,
    [id],
  );
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  return res.json({
    ok: true,
    paid: String(row.status) === 'paid',
    status: row.status,
    booking_id: row.booking_id,
    amount_minor: row.amount_minor,
    currency: row.currency,
  });
});

app.get('/api/bookings', requireAuth, requireAdmin, async (_req, res) => {
  const bookings = await many(
    `SELECT id, user_id, category_id, name, email, phone,
            booking_date::text as booking_date, slot_start, slot_end, note, status, created_at::text as created_at
     FROM calendar_bookings
     WHERE status <> 'hidden'
     ORDER BY booking_date ASC, slot_start ASC, id ASC`,
  );
  return res.json({ ok: true, bookings: jsonSafe(bookings) });
});

// Inbox (minimal: threads + messages; no uploads for now)
app.get('/api/inbox/threads', requireAuth, async (req, res) => {
  const u = (req as any).user as AuthedUser;
  const includeSolved = String((req as any).query?.all || '').trim() === '1';
  const statusWhere = includeSolved ? '' : "AND t.status != 'solved'";
  const threads =
    u.role === 'admin'
      ? await many(
          `SELECT t.id, t.owner_user_id, u.email as owner_email, u.name as owner_name, t.subject, t.status,
                  t.created_at::text as created_at, t.updated_at::text as updated_at
           FROM inbox_threads t JOIN users u ON u.id = t.owner_user_id
           WHERE 1=1 ${statusWhere}
           ORDER BY t.updated_at DESC LIMIT 200`,
        )
      : await many(
          `SELECT t.id, t.owner_user_id, t.subject, t.status,
                  t.created_at::text as created_at, t.updated_at::text as updated_at
           FROM inbox_threads t
           WHERE t.owner_user_id = $1 ${statusWhere}
           ORDER BY t.updated_at DESC LIMIT 200`,
          [u.id],
        );
  return res.json({ ok: true, threads: jsonSafe(threads) });
});

app.post('/api/inbox/threads', requireAuth, async (req, res) => {
  const u = (req as any).user as AuthedUser;
  const subject = String((req as any).body?.subject || '').trim() || 'Talep';
  const body = String((req as any).body?.body || '').trim();
  if (!body) return res.status(400).json({ ok: false, error: 'missing_body' });
  const now = new Date().toISOString();
  const t = await one<{ id: number }>(
    `INSERT INTO inbox_threads (owner_user_id, subject, status, created_at, updated_at)
     VALUES ($1, $2, 'awaiting', $3::timestamptz, $3::timestamptz)
     RETURNING id`,
    [u.id, subject.slice(0, 140), now],
  );
  const threadId = Number(t?.id || 0);
  await query(
    `INSERT INTO inbox_messages (thread_id, sender_user_id, sender_role, body, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz)`,
    [threadId, u.id, u.role, body.slice(0, 5000), now],
  );
  return res.json({ ok: true, thread: { id: threadId, subject } });
});

app.get('/api/inbox/threads/:id', requireAuth, async (req, res) => {
  const u = (req as any).user as AuthedUser;
  const id = Number((req as any).params.id);
  const thread = await one<any>(`SELECT * FROM inbox_threads WHERE id=$1`, [id]);
  if (!thread) return res.status(404).json({ ok: false, error: 'not_found' });
  if (u.role !== 'admin' && u.id !== Number(thread.owner_user_id)) return res.status(403).json({ ok: false, error: 'forbidden' });
  const messages = await many(
    `SELECT id, thread_id, sender_user_id, sender_role, body, created_at::text as created_at
     FROM inbox_messages WHERE thread_id=$1 ORDER BY id ASC LIMIT 500`,
    [id],
  );
  // Attachments are disabled for now (no persistent storage in serverless).
  return res.json({ ok: true, thread: jsonSafe(thread), messages: jsonSafe(messages), attachments: [] });
});

app.post('/api/inbox/threads/:id/messages', requireAuth, async (req, res) => {
  const u = (req as any).user as AuthedUser;
  const id = Number((req as any).params.id);
  const body = String((req as any).body?.body || '').trim();
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  if (!body) return res.status(400).json({ ok: false, error: 'missing_body' });
  const thread = await one<{ owner_user_id: unknown }>(`SELECT owner_user_id FROM inbox_threads WHERE id=$1`, [id]);
  if (!thread) return res.status(404).json({ ok: false, error: 'not_found' });
  const ownerIdRaw = (thread as any).owner_user_id;
  const ownerId =
    typeof ownerIdRaw === 'bigint' ? Number(ownerIdRaw) : typeof ownerIdRaw === 'number' ? ownerIdRaw : Number(String(ownerIdRaw || ''));
  if (u.role !== 'admin' && u.id !== ownerId) return res.status(403).json({ ok: false, error: 'forbidden' });

  const now = new Date().toISOString();
  const row = await one<{ id: number }>(
    `INSERT INTO inbox_messages (thread_id, sender_user_id, sender_role, body, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz)
     RETURNING id`,
    [id, u.id, u.role, body.slice(0, 5000), now],
  );
  const nextStatus = u.role === 'admin' ? 'solved' : 'awaiting';
  await query(`UPDATE inbox_threads SET updated_at=$1::timestamptz, status=$2 WHERE id=$3`, [now, nextStatus, id]);
  return res.json({ ok: true, id: Number(row?.id || 0) });
});

app.delete('/api/inbox/threads/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  await query(`DELETE FROM inbox_messages WHERE thread_id=$1`, [id]);
  await query(`DELETE FROM inbox_threads WHERE id=$1`, [id]);
  return res.json({ ok: true });
});

app.patch('/api/inbox/threads/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  const v = String((req as any).body?.status || '').trim();
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  const next = v === 'answered' ? 'solved' : 'awaiting';
  const now = new Date().toISOString();
  await query(`UPDATE inbox_threads SET status=$1, updated_at=$2::timestamptz WHERE id=$3`, [next, now, id]);
  return res.json({ ok: true });
});


app.get('/api/booking-categories', async (_req, res) => {
  const rows = await many(
    `SELECT id, name, deposit_amount_minor, currency
     FROM booking_categories WHERE active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return res.json({ ok: true, categories: jsonSafe(rows) });
});

app.get('/api/admin/booking-categories', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await many(
    `SELECT id, name, deposit_amount_minor, currency, active, sort_order, created_at::text as created_at
     FROM booking_categories
     ORDER BY sort_order ASC, id ASC`,
  );
  return res.json({ ok: true, categories: jsonSafe(rows) });
});

app.post('/api/admin/booking-categories', requireAuth, requireAdmin, async (req, res) => {
  const name = String((req as any).body?.name || '').trim();
  const deposit_amount_minor = BigInt(Math.max(0, Number((req as any).body?.deposit_amount_minor || 0) || 0));
  const currency = String((req as any).body?.currency || 'try').trim().toLowerCase() || 'try';
  const active = Boolean(Number((req as any).body?.active ?? 1));
  const sort_order = Math.floor(Number((req as any).body?.sort_order || 0) || 0);
  if (!name) return res.status(400).json({ ok: false, error: 'invalid_name' });
  const created_at = new Date().toISOString();
  try {
    const row = await one<{ id: number }>(
      `INSERT INTO booking_categories (name, deposit_amount_minor, currency, active, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
       RETURNING id`,
      [name, deposit_amount_minor, currency, active, sort_order, created_at],
    );
    return res.json({ ok: true, id: Number(row?.id || 0) });
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.toLowerCase().includes('unique')) return res.status(409).json({ ok: false, error: 'name_exists' });
    throw e;
  }
});

app.patch('/api/admin/booking-categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  const patch: Record<string, any> = {};
  if ((req as any).body?.name != null) patch.name = String((req as any).body.name || '').trim();
  if ((req as any).body?.deposit_amount_minor != null) patch.deposit_amount_minor = BigInt(Math.max(0, Number((req as any).body.deposit_amount_minor) || 0));
  if ((req as any).body?.currency != null) patch.currency = String((req as any).body.currency || 'try').trim().toLowerCase();
  if ((req as any).body?.active != null) patch.active = Boolean(Number((req as any).body.active));
  if ((req as any).body?.sort_order != null) patch.sort_order = Math.floor(Number((req as any).body.sort_order) || 0);
  if (Object.keys(patch).length === 0) return res.json({ ok: true });
  if ('name' in patch && !patch.name) return res.status(400).json({ ok: false, error: 'invalid_name' });

  const sets: string[] = [];
  const params: any[] = [];
  let p = 1;
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k}=$${p++}`);
    params.push(v);
  }
  params.push(id);
  await query(`UPDATE booking_categories SET ${sets.join(', ')} WHERE id=$${p}`, params);
  return res.json({ ok: true });
});

app.delete('/api/admin/booking-categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  await query(`DELETE FROM booking_categories WHERE id=$1`, [id]);
  return res.json({ ok: true });
});

app.patch('/api/bookings/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  const status = String((req as any).body?.status || '').trim().toLowerCase();
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  if (status !== 'confirmed' && status !== 'cancelled' && status !== 'hidden') return res.status(400).json({ ok: false, error: 'bad_status' });
  await query(`UPDATE calendar_bookings SET status=$1 WHERE id=$2`, [status, id]);
  return res.json({ ok: true });
});

app.delete('/api/bookings/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  await query(`DELETE FROM calendar_bookings WHERE id=$1`, [id]);
  return res.json({ ok: true });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  const users = await many(
    `SELECT id, email, name, role, company, created_at::text as created_at
     FROM users
     ORDER BY id DESC
     LIMIT 200`,
  );
  return res.json({ ok: true, users: jsonSafe(users) });
});

app.post('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  const role = normalizeRole((req as any).body?.role);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  await query(`UPDATE users SET role=$1 WHERE id=$2`, [role, id]);
  return res.json({ ok: true });
});

app.post('/api/admin/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  const password = String((req as any).body?.password || '');
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'weak_password' });
  const password_hash = await bcrypt.hash(password, 10);
  await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [password_hash, id]);
  return res.json({ ok: true });
});

// One-time bootstrap: promote a user to admin using an env token.
// Set ADMIN_BOOTSTRAP_TOKEN on Vercel, then call:
// POST /api/admin/bootstrap-promote { token, email }
app.post('/api/admin/bootstrap-promote', async (req, res) => {
  const expected = String(process.env.ADMIN_BOOTSTRAP_TOKEN || '').trim();
  if (!expected) return res.status(404).json({ ok: false, error: 'not_enabled' });
  const token = String((req as any).body?.token || '').trim();
  const email = String((req as any).body?.email || '').trim().toLowerCase();
  if (!token || token !== expected) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (!email || !isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  const u = await one<{ id: number }>(`SELECT id FROM users WHERE email=$1`, [email]);
  if (!u) return res.status(404).json({ ok: false, error: 'user_not_found' });
  await query(`UPDATE users SET role='admin' WHERE id=$1`, [u.id]);
  return res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number((req as any).params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
  await query(`DELETE FROM users WHERE id=$1`, [id]);
  return res.json({ ok: true });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[aiag] unhandled error', err);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'server_error' });
});

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app as any)(req, res);
}
