/**
 * Site-wide editable content (metinler, görseller, layout JSON vb.).
 * Sunucudaki `settings.site_editable_assets_v1` ile senkron; tüm ziyaretçiler aynı veriyi görür.
 * AdminContext bu modüle abone olur (yeniden çizim); React döngüsüne girmez.
 */

const PREFIX = 'aiag:asset:';

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Bellekteki içerik (init + sunucu birleşimi). */
let memory: Record<string, string> = {};

/** İlk `hydrateSiteAssets` denemesi bitti (başarılı veya hatalı); UI kapısı bunu bekler. */
let siteAssetsHydrateSettled = false;

export function hasSiteAssetsHydrateSettled(): boolean {
  return siteAssetsHydrateSettled;
}

/** Ağ takılırsa sonsuz boş ekranı önlemek için (ör. API yok). */
export function forceSiteAssetsHydrateGateIfPending(): void {
  if (siteAssetsHydrateSettled) return;
  siteAssetsHydrateSettled = true;
  emit();
}

let serverWritesEnabled = false;
const dirtySet = new Map<string, string>();
const dirtyDelete = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 450;

export function subscribeSiteAssets(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function mirrorToLocalStorage(key: string, value: string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* quota / private mode */
  }
}

/** İlk yüklemede tarayıcıdaki `aiag:asset:*` değerlerini belleğe alır (sunucu gelene kadar). */
export function initSiteAssetsFromLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const v = localStorage.getItem(k);
      if (v != null) memory[k.slice(PREFIX.length)] = v;
    }
  } catch {
    /* ignore */
  }
  emit();
}

export function setServerAssetWritesEnabled(on: boolean) {
  serverWritesEnabled = Boolean(on);
  if (serverWritesEnabled) void flushSiteAssetsPending();
}

function scheduleFlush() {
  if (!serverWritesEnabled) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSiteAssetsPending();
  }, FLUSH_MS);
}

export async function flushSiteAssetsPending(): Promise<void> {
  if (dirtySet.size === 0 && dirtyDelete.size === 0) return;
  const set = Object.fromEntries(dirtySet);
  const remove = [...dirtyDelete];
  dirtySet.clear();
  dirtyDelete.clear();
  try {
    const res = await fetch('/api/admin/site-assets', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set, remove }),
    });
    if (res.status === 401 || res.status === 403) {
      return;
    }
    if (!res.ok) {
      for (const [k, v] of Object.entries(set)) dirtySet.set(k, v);
      for (const k of remove) dirtyDelete.add(k);
      emit();
    }
  } catch {
    for (const [k, v] of Object.entries(set)) dirtySet.set(k, v);
    for (const k of remove) dirtyDelete.add(k);
    emit();
  }
}

/** Sunucudaki içeriği çeker; mevcut bellekle birleştirir (sunucu aynı anahtarda kazanır). */
export async function hydrateSiteAssets(): Promise<void> {
  try {
    const res = await fetch('/api/site/assets', { credentials: 'omit' });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; assets?: Record<string, string> };
    if (res.ok && data?.ok && data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets)) {
      memory = { ...memory, ...data.assets };
    }
  } catch {
    /* ağ / DB yoksa mevcut bellek (çoğunlukla sadece local) kalsın */
  } finally {
    siteAssetsHydrateSettled = true;
    emit();
  }
}

export function readAsset(assetKey: string): string | null {
  if (Object.prototype.hasOwnProperty.call(memory, assetKey)) return memory[assetKey];
  return null;
}

export function writeAsset(assetKey: string, value: string) {
  memory[assetKey] = value;
  mirrorToLocalStorage(assetKey, value);
  if (serverWritesEnabled) {
    dirtySet.set(assetKey, value);
    dirtyDelete.delete(assetKey);
    scheduleFlush();
  }
  emit();
}

export function clearAsset(assetKey: string) {
  delete memory[assetKey];
  mirrorToLocalStorage(assetKey, null);
  if (serverWritesEnabled) {
    dirtyDelete.add(assetKey);
    dirtySet.delete(assetKey);
    scheduleFlush();
  }
  emit();
}

export function readJsonAsset<T>(assetKey: string): T | null {
  const raw = readAsset(assetKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonAsset(assetKey: string, value: unknown) {
  writeAsset(assetKey, JSON.stringify(value));
}
