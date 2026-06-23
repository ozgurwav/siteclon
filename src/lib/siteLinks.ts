import { resolveToolbarButtonHref, toolbarSubItemHref } from './siteRoutes';

export const SITE_LINK_TARGETS = [
  { value: '#', label: 'Kapali / yonlendirme yok' },
  { value: '/', label: 'Ana sayfa' },
  { value: '/calendar', label: 'Sipariş / teslimat' },
  { value: '/inbox', label: 'Gelen kutusu' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: '__custom__', label: 'Ozel link yaz' },
] as const;

export type SiteLinkTarget = { value: string; label: string };

export const SAFE_SITE_LINK_TARGETS = SITE_LINK_TARGETS.filter(
  (x) => x.value !== '#' && x.value !== '__custom__',
);

const CORE_NAV_TARGETS: SiteLinkTarget[] = [
  { value: '/', label: 'Ana sayfa' },
  { value: '/calendar', label: 'Sipariş / teslimat' },
  { value: '/inbox', label: 'Gelen kutusu' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

function routeAlias(raw: string) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const withoutHash = t.replace(/^#+/, '').replace(/^\/+/, '').trim();
  if (!withoutHash) return '';

  const [pathPart, suffixRaw = ''] = withoutHash.split(/([?#].*)/, 2);
  const key = pathPart
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
  const suffix = suffixRaw || '';

  const routes: Record<string, string> = {
    portfolio: '/portfolio',
    portfolyo: '/portfolio',
    galeri: '/portfolio',
    gallery: '/portfolio',
    packages: '/packages',
    paketler: '/packages',
    paketlerimiz: '/packages',
    paket: '/packages',
    banner: '/packages?kind=banner',
    afis: '/packages?kind=poster',
    afiş: '/packages?kind=poster',
    poster: '/packages?kind=poster',
    calendar: '/calendar',
    takvim: '/calendar',
    randevu: '/calendar',
    inbox: '/inbox',
    'gelen-kutusu': '/inbox',
    gelenkutusu: '/inbox',
    whatsapp: 'whatsapp',
    'whats-app': 'whatsapp',
    wp: 'whatsapp',
    account: '/account',
    hesap: '/account',
  };

  const route = routes[key];
  if (!route) return '';
  if (!suffix) return route;
  return route.includes('?') && suffix.startsWith('?') ? `${route}&${suffix.slice(1)}` : `${route}${suffix}`;
}

export function normalizeSiteHref(raw: string) {
  const t = String(raw || '').trim();
  if (!t || t === '#' || /^javascript:/i.test(t)) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith('#/')) return t.slice(1) || '#';

  const alias = routeAlias(t);
  if (alias) return alias;
  if (t.startsWith('#')) return `/${t.replace(/^#+/, '').replace(/^\/+/, '')}`;
  if (t.startsWith('/') || t.startsWith('?')) return t;
  return `/${t.replace(/^\/+/, '')}`;
}

export function siteTargetSelectValue(href: string) {
  const normalized = normalizeSiteHref(href);
  return SITE_LINK_TARGETS.some((x) => x.value === normalized) ? normalized : '__custom__';
}

function toolbarItemHref(item: any) {
  return toolbarSubItemHref(item);
}

export function collectNavigableSiteTargets(toolbarRaw: unknown, extraTargets: SiteLinkTarget[] = []) {
  const out: SiteLinkTarget[] = [];
  const seen = new Set<string>();
  const add = (value: string, label: string) => {
    const normalized = normalizeSiteHref(value);
    if (!normalized || normalized === '#' || seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ value: normalized, label: label || normalized });
  };

  for (const target of [...CORE_NAV_TARGETS, ...extraTargets]) add(target.value, target.label);

  if (!Array.isArray(toolbarRaw)) return out;

  for (const button of toolbarRaw as any[]) {
    if (!button || button.enabled === false) continue;
    const items = Array.isArray(button.items) ? button.items.filter((x: any) => x && x.enabled !== false) : [];
    if (items.length) {
      for (const item of items) add(toolbarItemHref(item), String(item.label || '').trim() || 'Alt oge');
      continue;
    }
    if (button.type === 'link') add(resolveToolbarButtonHref(button), String(button.label || '').trim() || 'Buton');
  }

  return out;
}
