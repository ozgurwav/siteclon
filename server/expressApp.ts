// Express API used locally (`server/local.ts`) and on Vercel via `api/index.ts`.
// Kept under `server/` so Vercel routes all `/api/*` to a single function (`api/index.ts`).
import type { IncomingMessage, ServerResponse } from 'node:http';
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

app.get('/api/health', (_req, res) => {
  return res.json({
    ok: true,
  });
});

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
  return res.json({ ok: true, id: bookingId });
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
