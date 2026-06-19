import { readJsonAsset } from '../admin/assets';

/** Eski iş birlikleri yolları → toolbar’daki güncel adrese yönlendirilir. */
export const PARTNERS_LEGACY_PATHS = new Set([
  '/isbirliklerimiz',
  '/is-birliklerimiz',
  '/işbirliklerimiz',
  '/iş-birliklerimiz',
  '/partners',
  '/partner',
]);

export function normalizePathname(p: string): string {
  const raw = String(p || '/').trim() || '/';
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '') || '/';
}

export function slugifyToolbarScope(raw: string): string {
  return String(raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function toolbarSlugFromLabel(label: string): string {
  const s = String(label || 'Yeni buton')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 50);
  return s || 'yenibuton';
}

export function packagesHref(kind: 'all' | 'banner' | 'poster', scope?: string): string {
  const params = new URLSearchParams();
  const cleanScope = slugifyToolbarScope(scope || '');
  if (kind !== 'all') params.set('kind', kind);
  if (cleanScope) params.set('scope', cleanScope);
  const q = params.toString();
  return q ? `/packages?${q}` : '/packages';
}

/** Dahili yol + sorgu; içerik sayfalarını sabit adrese çevirmez. */
export function parseNavHref(href: string): { pathname: string; search: string } {
  const t = String(href || '').trim();
  if (!t || t === '#' || /^javascript:/i.test(t)) return { pathname: '', search: '' };
  if (/^(https?:|mailto:|tel:)/i.test(t)) return { pathname: '', search: '' };

  let raw = t;
  if (raw.startsWith('#/')) raw = raw.slice(1);
  else if (raw.startsWith('#')) raw = `/${raw.replace(/^#+/, '')}`;
  else if (!raw.startsWith('/') && !raw.startsWith('?')) raw = `/${raw.replace(/^\/+/, '')}`;

  const hashless = raw.split('#')[0] || '';
  const qIdx = hashless.indexOf('?');
  const pathPart = qIdx >= 0 ? hashless.slice(0, qIdx) : hashless;
  const queryPart = qIdx >= 0 ? hashless.slice(qIdx) : '';
  return {
    pathname: normalizePathname(pathPart || '/'),
    search: queryPart,
  };
}

/** Yalnızca sistem kısayolları; özel toolbar yollarına dokunmaz. */
export function normalizeNavHref(raw: string): string {
  const t = String(raw || '').trim();
  if (!t || t === '#' || /^javascript:/i.test(t)) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith('#/')) return t.slice(1) || '#';

  const { pathname, search } = parseNavHref(t);
  if (!pathname) return '#';

  const key = pathname
    .replace(/^\/+/, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');

  const system: Record<string, string> = {
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
    portfolio: '/portfolio',
    portfolyo: '/portfolio',
    galeri: '/portfolio',
    gallery: '/portfolio',
    packages: '/packages',
    paketler: '/packages',
    paketlerimiz: '/packages',
    paket: '/packages',
  };

  const mapped = system[key];
  if (mapped) return mapped === 'whatsapp' ? 'whatsapp' : `${mapped}${search}`;

  return `${pathname}${search}`;
}

export function toolbarSubItemHref(item: unknown): string {
  if (!item || typeof item !== 'object' || (item as any).enabled === false) return '';
  const row = item as any;
  const subType = String(row.type || 'link').toLowerCase();

  if (subType === 'gallery') {
    const id = String(row.id || '').trim();
    return id ? `/portfolio?g=${encodeURIComponent(id)}` : '/portfolio';
  }

  if (subType === 'packages') {
    const k = String(row.packagesKind || 'banner').toLowerCase();
    const kind = k === 'all' ? 'all' : k === 'poster' ? 'poster' : 'banner';
    const scope = slugifyToolbarScope(row.packagesScope || row.scope || row.label || '');
    return packagesHref(kind, scope || undefined);
  }

  return normalizeNavHref(String(row.href || ''));
}

export function resolveToolbarItemsToHref(items: unknown[]): string {
  const visible = (items || []).filter((x) => x && typeof x === 'object' && (x as any).enabled !== false) as any[];

  const pkgs = visible.filter((x) => x?.type === 'packages');
  if (pkgs.length) {
    const kinds = new Set<string>(pkgs.map((p) => String(p.packagesKind || 'banner').toLowerCase()));
    const firstScope = slugifyToolbarScope(pkgs[0]?.packagesScope || pkgs[0]?.scope || pkgs[0]?.label || '');
    if (kinds.has('all')) return packagesHref('all', firstScope || undefined);
    if (kinds.has('banner') && kinds.has('poster')) return packagesHref('all', firstScope || undefined);
    const only = [...kinds][0] || 'banner';
    return packagesHref(only === 'poster' ? 'poster' : only === 'all' ? 'all' : 'banner', firstScope || undefined);
  }

  const first = visible[0];
  if (!first) return '#';
  return toolbarSubItemHref(first);
}

export function resolveToolbarButtonHref(button: unknown): string {
  if (!button || typeof button !== 'object' || (button as any).enabled === false) return '#';
  const b = button as any;
  const items = Array.isArray(b.items) ? b.items.filter((x: any) => x && x.enabled !== false) : [];
  if (items.length) return resolveToolbarItemsToHref(items);
  if (b.type === 'link' || !b.type) return normalizeNavHref(String(b.href || '#'));
  return '#';
}

export type SiteRoute =
  | { type: 'gallery'; galleryId: string; title: string }
  | {
      type: 'packages';
      title: string;
      subtitle: string;
      listKey: string;
      assetPrefix: string;
      defaultKind?: 'all' | 'banner' | 'poster';
    }
  | { type: 'static'; page: 'portfolio' | 'calendar' | 'inbox' | 'account' | 'person' | 'packages' | 'legal'; legalSlug?: string }
  | null;

type ToolbarRouteEntry = {
  pathname: string;
  search: string;
  route: SiteRoute;
};

function partnersRoute(label: string): SiteRoute {
  return {
    type: 'packages',
    title: label.trim() || 'İş birliklerimiz',
    subtitle: 'Birlikte çalışılan firmaları banner ve afiş şablonlarıyla buradan yönet.',
    listKey: 'partners.items.v1',
    assetPrefix: 'partners',
    defaultKind: 'all',
  };
}

function packagesRouteFromItem(item: any, label: string): SiteRoute {
  const k = String(item.packagesKind || 'all').toLowerCase();
  const defaultKind = k === 'poster' ? 'poster' : k === 'banner' ? 'banner' : 'all';
  const scope = slugifyToolbarScope(item.packagesScope || item.scope || item.label || '');
  if (scope) {
    return {
      type: 'packages',
      title: String(item.label || label || 'Paketlerimiz').trim() || 'Paketlerimiz',
      subtitle: 'Bu sayfanın içeriklerini seçilen şablonla buradan yönet.',
      listKey: 'packages.items.v1',
      assetPrefix: 'packages',
      defaultKind,
    };
  }
  return {
    type: 'packages',
    title: String(item.label || label || 'Paketlerimiz').trim() || 'Paketlerimiz',
    subtitle: 'Banner ve afişleri buradan yönet.',
    listKey: 'packages.items.v1',
    assetPrefix: 'packages',
    defaultKind,
  };
}

function routeFromToolbarItem(item: any, button: any): SiteRoute | null {
  if (!item || item.enabled === false) return null;
  const subType = String(item.type || 'link').toLowerCase();
  const buttonLabel = String(button?.label || '').trim();
  const isPartners = button?.id === 'partners';

  if (subType === 'gallery') {
    const id = String(item.id || '').trim();
    if (!id) return null;
    return {
      type: 'gallery',
      galleryId: id,
      title: String(item.label || buttonLabel || 'Portfolyo').trim() || 'Portfolyo',
    };
  }

  if (subType === 'packages') {
    if (isPartners) return partnersRoute(String(item.label || buttonLabel));
    return packagesRouteFromItem(item, buttonLabel);
  }

  const href = normalizeNavHref(String(item.href || ''));
  const { pathname } = parseNavHref(href);
  if (isPartners || PARTNERS_LEGACY_PATHS.has(pathname)) return partnersRoute(String(item.label || buttonLabel));

  const staticPage = staticRouteForPath(pathname);
  if (staticPage) return staticPage;

  return null;
}

function staticRouteForPath(pathname: string): SiteRoute | null {
  const p = normalizePathname(pathname);
  if (p === '/portfolio') return { type: 'static', page: 'portfolio' };
  if (p === '/calendar') return { type: 'static', page: 'calendar' };
  if (p === '/inbox') return { type: 'static', page: 'inbox' };
  if (p === '/account') return { type: 'static', page: 'account' };
  if (p === '/person') return { type: 'static', page: 'person' };
  if (p === '/packages' || p === '/paketler') return { type: 'static', page: 'packages' };
  if (p.startsWith('/legal')) {
    const rest = p === '/legal' ? '' : p.slice('/legal/'.length);
    const slug = rest.split('/').filter(Boolean)[0] || '';
    return { type: 'static', page: 'legal', legalSlug: slug };
  }
  return null;
}

function hrefMatchesPath(pathname: string, search: string, href: string): boolean {
  const target = parseNavHref(href);
  if (!target.pathname || target.pathname !== pathname) return false;
  if (!target.search) return true;
  return (search || '') === target.search;
}

function collectToolbarRouteEntries(): ToolbarRouteEntry[] {
  const raw = readJsonAsset<unknown>('admin.toolbar.buttons');
  if (!Array.isArray(raw)) return [];

  const out: ToolbarRouteEntry[] = [];
  for (const button of raw as any[]) {
    if (!button || typeof button !== 'object' || button.enabled === false) continue;
    const items = Array.isArray(button.items) ? button.items : [];

    if (items.length) {
      for (const item of items) {
        const route = routeFromToolbarItem(item, button);
        const href = toolbarSubItemHref(item);
        const { pathname, search } = parseNavHref(href);
        if (!route || !pathname) continue;
        out.push({ pathname, search, route });
      }
      continue;
    }

    if (button.type === 'link' || !button.type) {
      const href = normalizeNavHref(String(button.href || ''));
      const { pathname, search } = parseNavHref(href);
      if (!pathname) continue;

      let route: SiteRoute | null = null;
      if (button.id === 'partners' || PARTNERS_LEGACY_PATHS.has(pathname)) {
        route = partnersRoute(String(button.label || ''));
      } else {
        route = staticRouteForPath(pathname);
      }
      if (route) out.push({ pathname, search, route });
    }
  }
  return out;
}

/** Eski iş birlikleri URL’lerini toolbar’daki güncel adrese yönlendir. */
export function resolveLegacyRedirect(pathname: string): string | null {
  const p = normalizePathname(pathname);
  if (!PARTNERS_LEGACY_PATHS.has(p)) return null;

  const raw = readJsonAsset<unknown>('admin.toolbar.buttons');
  if (!Array.isArray(raw)) return null;

  for (const button of raw as any[]) {
    if (!button || button.enabled === false) continue;
    if (button.id !== 'partners') continue;
    const href = resolveToolbarButtonHref(button);
    const { pathname: canonical } = parseNavHref(href);
    if (!canonical || canonical === p) return null;
    return `${canonical}${parseNavHref(href).search}`;
  }

  return null;
}

export function resolveSiteRoute(pathname: string, search = ''): SiteRoute {
  const p = normalizePathname(pathname);
  const s = search || '';

  if (p === '/portfolio' && s.includes('g=')) {
    const params = new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
    const galleryId = String(params.get('g') || '').trim();
    if (galleryId) {
      const entries = collectToolbarRouteEntries();
      const hit = entries.find((e) => e.pathname === p && e.search === s && e.route?.type === 'gallery');
      return hit?.route ?? { type: 'gallery', galleryId, title: 'Portfolyo' };
    }
  }

  const staticHit = staticRouteForPath(p);
  if (staticHit && (p !== '/packages' && p !== '/paketler' || !s)) {
    if (p !== '/portfolio' || !s) return staticHit;
  }

  for (const entry of collectToolbarRouteEntries()) {
    if (entry.pathname !== p) continue;
    if (entry.search && entry.search !== s) continue;
    if (!entry.search || !s || entry.search === s) return entry.route;
  }

  for (const entry of collectToolbarRouteEntries()) {
    if (hrefMatchesPath(p, s, `${entry.pathname}${entry.search}`)) return entry.route;
  }

  if (PARTNERS_LEGACY_PATHS.has(p)) return partnersRoute('İş birliklerimiz');

  if (p === '/packages' || p === '/paketler') return { type: 'static', page: 'packages' };
  if (p === '/portfolio') return { type: 'static', page: 'portfolio' };

  return null;
}
