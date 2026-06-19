import { normalizeSiteHref } from './siteLinks';
import { readAsset } from '../admin/assets';
import { waMeDigits, waMeUrl } from './whatsapp';

/**
 * Footer linkleri.
 * - `kind: 'url'`: `href` (dahili # veya /… veya https://…)
 * - `kind: 'contract'`: sözleşme sayfası `/legal/{legalSlug}` — metinler `legal.{slug}.title` / `legal.{slug}.body`
 * Eski kayıtlar: `kind: 'legal'` → `contract` ile aynı kabul edilir.
 */

export type FooterLinkKind = 'url' | 'contract';

/** Depoda `legal` kalan eski değerler için */
export type FooterLinkKindStored = FooterLinkKind | 'legal';

export type FooterLinkItem = {
  id: string;
  /** Menüde görünen metin (örn. "Sözleşme") */
  label: string;
  enabled?: boolean;
  kind?: FooterLinkKindStored;
  /** Sözleşme sayfası adresi: yalnızca küçük harf, rakam, tire */
  legalSlug?: string;
  /** Dış / iç URL; sözleşme tipinde yok sayılır */
  href?: string;
};

export type FooterLinkColumn = {
  id: string;
  items: FooterLinkItem[];
};

export type FooterLinksConfig = {
  columns: FooterLinkColumn[];
  /** Footer altı ince şerit (isteğe bağlı) */
  legalStrip?: FooterLinkItem[];
};

const LEGAL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const RESERVED_LEGAL_SLUGS = new Set([
  'account',
  'calendar',
  'inbox',
  'isbirliklerimiz',
  'legal',
  'packages',
  'paketler',
  'payment',
  'person',
  'portfolio',
  'reset-password',
  'whatsapp',
]);

export function isValidLegalSlug(slug: string): boolean {
  const clean = String(slug || '').trim();
  return LEGAL_SLUG_RE.test(clean) && !RESERVED_LEGAL_SLUGS.has(clean);
}

/** Dahili: `legal` → contract */
export function footerLinkKind(item: FooterLinkItem): FooterLinkKind {
  const k = item.kind;
  if (k === 'contract' || k === 'legal') return 'contract';
  return 'url';
}

export function resolveFooterLinkHref(item: FooterLinkItem): string {
  if (footerLinkKind(item) === 'contract') {
    const s = String(item.legalSlug || '').trim();
    if (!isValidLegalSlug(s)) return '#';
    return `/legal/${s}`;
  }
  const href = normalizeSiteHref(String(item.href || '').trim());
  if (href === 'whatsapp') {
    const digits = waMeDigits(readAsset('whatsapp.phone') || '905XXXXXXXXX');
    return digits.length >= 8 ? waMeUrl(digits, readAsset('whatsapp.defaultMessage') || 'Merhaba, bilgi almak istiyorum.') : '#';
  }
  return href;
}

/** Sözleşme: yeni sekme; http(s): yeni sekme */
export function footerLinkOpensNewTab(item: FooterLinkItem): boolean {
  if (footerLinkKind(item) === 'contract') return true;
  const h = normalizeSiteHref(String(item.href || '').trim());
  return h === 'whatsapp' || Boolean(h && h !== '#' && /^https?:\/\//i.test(h));
}

const TR_ASCII: [string, string][] = [
  ['ğ', 'g'],
  ['ü', 'u'],
  ['ş', 's'],
  ['ı', 'i'],
  ['ö', 'o'],
  ['ç', 'c'],
  ['Ğ', 'g'],
  ['Ü', 'u'],
  ['Ş', 's'],
  ['İ', 'i'],
  ['Ö', 'o'],
  ['Ç', 'c'],
];

const FOOTER_SOCIAL_URLS: [string, string][] = [
  ['instagram', 'https://instagram.com/'],
  ['linkedin', 'https://linkedin.com/'],
  ['facebook', 'https://facebook.com/'],
  ['youtube', 'https://youtube.com/'],
  ['tiktok', 'https://tiktok.com/'],
  ['twitter', 'https://x.com/'],
  ['x.com', 'https://x.com/'],
  ['whatsapp', 'whatsapp'],
];

/** Özel URL tipinde etiketten adres önerisi (sosyal ağlar veya https://) */
export function suggestFooterHref(label: string, currentHref?: string): string {
  const cur = String(currentHref || '').trim();
  if (/^https?:\/\//i.test(cur) && cur !== 'https://') return cur;

  const l = String(label || '').trim().toLocaleLowerCase('tr-TR');
  for (const [key, url] of FOOTER_SOCIAL_URLS) {
    if (l.includes(key)) return url;
  }
  return 'https://';
}

/** Admin’de sözleşme tipine geçerken boş slug için öneri */
export function suggestLegalSlug(label: string, fallbackId: string): string {
  let s = String(label || '').trim().toLowerCase();
  for (const [a, b] of TR_ASCII) s = s.split(a).join(b);
  s = s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 62);
  if (isValidLegalSlug(s)) return s;

  let fb = String(fallbackId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 62);
  if (fb && !/^[a-z0-9]/.test(fb)) fb = `x-${fb}`;
  if (!fb) fb = `belge-${Date.now().toString(36)}`;
  if (isValidLegalSlug(fb)) return fb;

  const tail = fallbackId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10) || 'x';
  const cand = `sozlesme-${tail}`;
  return isValidLegalSlug(cand) ? cand : `sozlesme-${Date.now().toString(36)}`;
}
