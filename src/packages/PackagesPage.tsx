import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAdmin } from '../admin/AdminContext';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { readAsset, readJsonAsset, writeAsset, writeJsonAsset } from '../admin/assets';
import { SAFE_SITE_LINK_TARGETS, normalizeSiteHref, siteTargetSelectValue } from '../lib/siteLinks';
import { waMeDigits, waMeUrl } from '../lib/whatsapp';

type PackageKind = 'banner' | 'poster';
type BannerWidth = 'full' | 'contained';
type PackageItem = {
  id: string;
  kind: PackageKind;
  bannerWidth?: BannerWidth;
  imageKey: string;
  titleKey: string;
  detailKey: string;
};

function makeBannerKey(assetPrefix: string, id: string, k: string) {
  return `${assetPrefix}.${id}.banner.${k}`;
}

type OverlayExtra = {
  id: string;
  textKey: string;
  dx: number;
  dy: number;
};

function makeExtrasKey(assetPrefix: string, bannerId: string) {
  return makeBannerKey(assetPrefix, bannerId, 'overlay.extras.v1');
}

function clampInt(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, Math.floor(n)));
}

function isVideoUrl(url: string) {
  const u = String(url || '').toLowerCase();
  if (u.startsWith('data:video/')) return true;
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(u);
}

function normalizePackageHref(raw: string) {
  const normalized = normalizeSiteHref(raw);
  if (normalized === 'whatsapp') {
    const digits = waMeDigits(readAsset('whatsapp.phone') || '905XXXXXXXXX');
    return digits.length >= 8 ? waMeUrl(digits, readAsset('whatsapp.defaultMessage') || 'Merhaba, bilgi almak istiyorum.') : '/';
  }
  if (normalized === '#' || /^(https?:|mailto:|tel:)/i.test(normalized)) return '/calendar';
  return normalized;
}

function safeSiteTargetValue(href: string) {
  const selected = siteTargetSelectValue(href);
  return SAFE_SITE_LINK_TARGETS.some((x) => x.value === selected) ? selected : '/calendar';
}

const PLACEHOLDER =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1526170375885-4d8ecf77b99f%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1400%26q%3D80&w=1400&q=85';

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalize(raw: unknown, assetPrefix = 'packages'): PackageItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const id = String((x as any).id || '').trim() || newId();
      const kindRaw = String((x as any).kind || 'banner').toLowerCase();
      const kind: PackageKind = kindRaw === 'poster' || kindRaw === 'afis' ? 'poster' : 'banner';
      const bwRaw = String((x as any).bannerWidth || (x as any).width || '').toLowerCase();
      const bannerWidth: BannerWidth | undefined = bwRaw === 'full' || bwRaw === 'contained' ? (bwRaw as any) : undefined;
      const base = String((x as any).base || id).trim() || id;
      return {
        id,
        kind,
        bannerWidth,
        imageKey: String((x as any).imageKey || `${assetPrefix}.${base}.image`).trim() || `${assetPrefix}.${base}.image`,
        titleKey: String((x as any).titleKey || `${assetPrefix}.${base}.title`).trim() || `${assetPrefix}.${base}.title`,
        detailKey: String((x as any).detailKey || `${assetPrefix}.${base}.detail`).trim() || `${assetPrefix}.${base}.detail`,
      } satisfies PackageItem;
    });
}

export function PackagesPage({
  defaultKind = 'all',
  title = 'Paketlerimiz',
  subtitle = 'Banner ve afişleri buradan yönet.',
  listKey = 'packages.items.v1',
  assetPrefix = 'packages',
}: {
  defaultKind?: 'all' | PackageKind;
  title?: string;
  subtitle?: string;
  listKey?: string;
  assetPrefix?: string;
} = {}) {
  const { isAdmin, bumpAssetsVersion, assetsVersion } = useAdmin();
  const [items, setItems] = useState<PackageItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const scope = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    return String(u.searchParams.get('scope') || '')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .replace(/[ıİ]/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }, []);
  const effectiveListKey = scope && listKey === 'packages.items.v1' ? `packages.scopes.${scope}.items.v1` : listKey;
  const effectiveAssetPrefix = scope && assetPrefix === 'packages' ? `packages.scopes.${scope}` : assetPrefix;
  const bannerKey = (id: string, k: string) => makeBannerKey(effectiveAssetPrefix, id, k);
  const extrasKey = (bannerId: string) => makeExtrasKey(effectiveAssetPrefix, bannerId);
  const filter = useMemo<'all' | PackageKind>(() => {
    if (typeof window === 'undefined') return 'all';
    const u = new URL(window.location.href);
    const k = String(u.searchParams.get('kind') || '').toLowerCase();
    if (k === 'banner') return 'banner';
    if (k === 'poster' || k === 'afis') return 'poster';
    return defaultKind;
  }, [defaultKind]);

  useEffect(() => {
    const stored = readJsonAsset<unknown>(effectiveListKey);
    const next = normalize(stored, effectiveAssetPrefix);
    setItems(next);
  }, [effectiveAssetPrefix, effectiveListKey]);

  const updateItems = (fn: (prev: PackageItem[]) => PackageItem[]) => {
    setItems((prev) => {
      const next = fn(prev);
      writeJsonAsset(
        effectiveListKey,
        next.map((x) => ({
          id: x.id,
          kind: x.kind,
          bannerWidth: x.bannerWidth,
          imageKey: x.imageKey,
          titleKey: x.titleKey,
          detailKey: x.detailKey,
        })),
      );
      bumpAssetsVersion();
      return next;
    });
  };

  const banners = useMemo(() => items.filter((x) => x.kind === 'banner'), [items]);
  const posters = useMemo(() => items.filter((x) => x.kind === 'poster'), [items]);
  const openItem = useMemo(() => (openId ? items.find((x) => x.id === openId) || null : null), [items, openId]);

  const deleteItem = (id: string) => {
    if (!confirm('Bu öğe silinsin mi?')) return;
    updateItems((prev) => prev.filter((x) => x.id !== id));
    if (openId === id) setOpenId(null);
  };

  function BannerCard({ it }: { it: PackageItem }) {
    void assetsVersion; // react to localStorage asset changes
    const width: BannerWidth = it.bannerWidth || 'full';
    const rawH = Number((readAsset(bannerKey(it.id, 'heightPx')) || '').trim());
    const heightPx = Number.isFinite(rawH) ? clampInt(rawH, 180, 900) : 420;
    const corners = (readAsset(bannerKey(it.id, 'corners')) || 'sharp').trim().toLowerCase();
    const radiusClass = corners === 'soft' ? 'rounded-3xl' : 'rounded-none';
    const overlayPos = (readAsset(bannerKey(it.id, 'overlay.position')) || 'center-left').trim().toLowerCase();
    const overlayColor = (readAsset(bannerKey(it.id, 'overlay.color')) || 'light').trim().toLowerCase();
    const ctaEnabled = (readAsset(bannerKey(it.id, 'cta.enabled')) || '0').trim() === '1';
    const ctaHrefStored = (readAsset(bannerKey(it.id, 'cta.href')) || '#').trim() || '#';
    const [ctaHrefDraft, setCtaHrefDraft] = useState(ctaHrefStored);
    useEffect(() => setCtaHrefDraft(ctaHrefStored), [ctaHrefStored]);
    const ctaResolvedHref = normalizePackageHref(ctaHrefDraft);
    const DRAG_MAX = 1400;
    const dxRaw = Number((readAsset(bannerKey(it.id, 'overlay.dx')) || '0').trim());
    const dyRaw = Number((readAsset(bannerKey(it.id, 'overlay.dy')) || '0').trim());
    const dx = Number.isFinite(dxRaw) ? clampInt(dxRaw, -DRAG_MAX, DRAG_MAX) : 0;
    const dy = Number.isFinite(dyRaw) ? clampInt(dyRaw, -DRAG_MAX, DRAG_MAX) : 0;
    const [dragPos, setDragPos] = useState<{ dx: number; dy: number }>({ dx, dy });
    useEffect(() => setDragPos({ dx, dy }), [dx, dy]);
    const dragRef = useRef<null | { startX: number; startY: number; baseDx: number; baseDy: number }>(null);
    const ctaDxRaw = Number((readAsset(bannerKey(it.id, 'cta.dx')) || '0').trim());
    const ctaDyRaw = Number((readAsset(bannerKey(it.id, 'cta.dy')) || '0').trim());
    const ctaDx = Number.isFinite(ctaDxRaw) ? clampInt(ctaDxRaw, -DRAG_MAX, DRAG_MAX) : 0;
    const ctaDy = Number.isFinite(ctaDyRaw) ? clampInt(ctaDyRaw, -DRAG_MAX, DRAG_MAX) : 0;
    const [ctaPos, setCtaPos] = useState<{ dx: number; dy: number }>({ dx: ctaDx, dy: ctaDy });
    useEffect(() => setCtaPos({ dx: ctaDx, dy: ctaDy }), [ctaDx, ctaDy]);
    const ctaDragRef = useRef<null | { startX: number; startY: number; baseDx: number; baseDy: number }>(null);
    const setBannerAsset = (k: string, v: string) => {
      writeAsset(bannerKey(it.id, k), v);
      bumpAssetsVersion();
    };

    const extras = useMemo<OverlayExtra[]>(() => {
      const raw = readJsonAsset<unknown>(extrasKey(it.id));
      if (!Array.isArray(raw)) return [];
      return (raw as any[])
        .filter((x) => x && typeof x === 'object')
        .map((x) => {
          const id = String((x as any).id || '').trim() || newId();
          const textKey =
            String((x as any).textKey || '').trim() || bannerKey(it.id, `overlay.extra.${id}.text`);
          const dx = Number((x as any).dx || 0);
          const dy = Number((x as any).dy || 0);
          return {
            id,
            textKey,
            dx: Number.isFinite(dx) ? clampInt(dx, -DRAG_MAX, DRAG_MAX) : 0,
            dy: Number.isFinite(dy) ? clampInt(dy, -DRAG_MAX, DRAG_MAX) : 0,
          };
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [it.id, assetsVersion]);

    const persistExtras = (next: OverlayExtra[]) => {
      writeJsonAsset(extrasKey(it.id), next);
      bumpAssetsVersion();
    };

    function OverlayExtraItem({ ex }: { ex: OverlayExtra }) {
      const [pos, setPos] = useState<{ dx: number; dy: number }>({ dx: ex.dx, dy: ex.dy });
      useEffect(() => setPos({ dx: ex.dx, dy: ex.dy }), [ex.dx, ex.dy]);
      const ref = useRef<null | { startX: number; startY: number; baseDx: number; baseDy: number }>(null);
      return (
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pos.dx}px, ${pos.dy}px)` }}>
          <div className={isAdmin ? 'pointer-events-auto' : 'pointer-events-none'}>
            {isAdmin ? (
              <div className="mb-1 flex items-center gap-2">
                <span
                  role="button"
                  tabIndex={0}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium border ${
                    overlayColor === 'dark'
                      ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                      : 'bg-black/45 text-white border-white/20 hover:bg-black/55'
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                    ref.current = { startX: e.clientX, startY: e.clientY, baseDx: pos.dx, baseDy: pos.dy };
                  }}
                  onPointerMove={(e) => {
                    const st = ref.current;
                    if (!st) return;
                    const nextDx = clampInt(st.baseDx + (e.clientX - st.startX), -DRAG_MAX, DRAG_MAX);
                    const nextDy = clampInt(st.baseDy + (e.clientY - st.startY), -DRAG_MAX, DRAG_MAX);
                    setPos({ dx: nextDx, dy: nextDy });
                  }}
                  onPointerUp={() => {
                    if (!ref.current) return;
                    ref.current = null;
                    persistExtras(extras.map((x) => (x.id === ex.id ? { ...x, dx: pos.dx, dy: pos.dy } : x)));
                  }}
                  onPointerCancel={() => {
                    ref.current = null;
                  }}
                  title="Bu metni taşı"
                >
                  Taşı
                </span>
                <button
                  type="button"
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium border ${
                    overlayColor === 'dark'
                      ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                      : 'bg-black/45 text-white border-white/20 hover:bg-black/55'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    persistExtras(extras.filter((x) => x.id !== ex.id));
                  }}
                  title="Metni sil"
                >
                  Sil
                </button>
              </div>
            ) : null}

            <div className="text-sm sm:text-base leading-relaxed max-w-[520px]">
              <EditableText assetKey={ex.textKey} defaultValue="Yeni metin" as="span" multiline allowFontPick />
            </div>
          </div>
        </div>
      );
    }

    const overlayPosClass =
      overlayPos === 'top-left'
        ? 'items-start justify-start text-left pt-10 sm:pt-12'
        : overlayPos === 'top-center'
          ? 'items-start justify-center text-center pt-10 sm:pt-12'
          : overlayPos === 'top-right'
            ? 'items-start justify-end text-right pt-10 sm:pt-12'
            : overlayPos === 'center'
              ? 'items-center justify-center text-center'
              : overlayPos === 'center-right'
                ? 'items-center justify-end text-right'
                : overlayPos === 'bottom-left'
                  ? 'items-end justify-start text-left pb-10 sm:pb-12'
                  : overlayPos === 'bottom-center'
                    ? 'items-end justify-center text-center pb-10 sm:pb-12'
                    : overlayPos === 'bottom-right'
                      ? 'items-end justify-end text-right pb-10 sm:pb-12'
                      : 'items-center justify-start text-left';

    const overlayTextClass = overlayColor === 'dark' ? 'text-[#051A24]' : 'text-white';
    const overlayShadowClass = overlayColor === 'dark' ? '' : 'drop-shadow-[0_2px_14px_rgba(0,0,0,0.35)]';
    const title2Live = (readAsset(bannerKey(it.id, 'overlay.title2')) || '').trim();
    const title3Live = (readAsset(bannerKey(it.id, 'overlay.title3')) || '').trim();
    // When nested under a max-width container, force full-bleed with a viewport-width wrapper.
    const outer =
      width === 'full' ? 'relative left-1/2 -translate-x-1/2 w-screen' : 'max-w-6xl mx-auto';
    return (
      <div className={outer}>
        <div
          className={`${radiusClass} bg-white overflow-hidden`}
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.08)' }}
        >
          <div className="relative">
            <button type="button" className="block w-full text-left" onClick={() => setOpenId(it.id)}>
              <div className="w-full bg-black/[0.04]" style={{ height: `${heightPx}px` }}>
                <EditableAsset
                  assetKey={it.imageKey}
                  defaultValue={PLACEHOLDER}
                  alt="Banner medya"
                  className="w-full h-full object-cover"
                  kind={isVideoUrl(readAsset(it.imageKey) || '') ? 'video' : 'image'}
                />
              </div>
            </button>

            {/* On public view, keep overlay non-blocking (click opens detail).
                On admin view, allow editing overlay texts. */}
            <div
              className={`absolute inset-0 flex px-6 sm:px-10 ${overlayPosClass} ${overlayTextClass} ${
                isAdmin ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {overlayColor !== 'dark' ? (
                <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/10 to-black/0 pointer-events-none" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-r from-white/55 via-white/20 to-white/0 pointer-events-none" />
              )}
              <div
                className={`relative z-10 max-w-[720px] py-10 ${overlayShadowClass}`}
                style={{ transform: `translate(${dragPos.dx}px, ${dragPos.dy}px)` }}
              >
                {isAdmin ? (
                  <div className="absolute right-4 top-4 z-20 pointer-events-auto">
                    <span
                      role="button"
                      tabIndex={0}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium border ${
                        overlayColor === 'dark'
                          ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                          : 'bg-black/45 text-white border-white/20 hover:bg-black/55'
                      }`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                        dragRef.current = { startX: e.clientX, startY: e.clientY, baseDx: dragPos.dx, baseDy: dragPos.dy };
                      }}
                      onPointerMove={(e) => {
                        const st = dragRef.current;
                        if (!st) return;
                        const nextDx = clampInt(st.baseDx + (e.clientX - st.startX), -DRAG_MAX, DRAG_MAX);
                        const nextDy = clampInt(st.baseDy + (e.clientY - st.startY), -DRAG_MAX, DRAG_MAX);
                        setDragPos({ dx: nextDx, dy: nextDy });
                      }}
                      onPointerUp={() => {
                        if (!dragRef.current) return;
                        dragRef.current = null;
                        setBannerAsset('overlay.dx', String(dragPos.dx));
                        setBannerAsset('overlay.dy', String(dragPos.dy));
                      }}
                      onPointerCancel={() => {
                        dragRef.current = null;
                      }}
                      title="Sürükleyip konumlandır"
                    >
                      Taşı <span className="opacity-70 tabular-nums">({dragPos.dx},{dragPos.dy})</span>
                    </span>
                    <button
                      type="button"
                      className={`ml-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium border ${
                        overlayColor === 'dark'
                          ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                          : 'bg-black/45 text-white border-white/20 hover:bg-black/55'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragPos({ dx: 0, dy: 0 });
                        setBannerAsset('overlay.dx', '0');
                        setBannerAsset('overlay.dy', '0');
                      }}
                    >
                      Reset konum
                    </button>
                  </div>
                ) : null}

                <div className="text-[28px] sm:text-[40px] lg:text-[52px] leading-[1.05] font-serif font-semibold tracking-tight">
                  <EditableText assetKey={bannerKey(it.id, 'overlay.title')} defaultValue="Paket başlığı" as="span" />
                </div>
                {title2Live ? (
                  <div className="mt-1 text-[22px] sm:text-[30px] lg:text-[38px] leading-[1.08] font-serif font-semibold tracking-tight opacity-95">
                    <EditableText assetKey={bannerKey(it.id, 'overlay.title2')} defaultValue="" as="span" />
                  </div>
                ) : null}
                {title3Live ? (
                  <div className="mt-1 text-[18px] sm:text-[24px] lg:text-[30px] leading-[1.1] font-serif font-semibold tracking-tight opacity-90">
                    <EditableText assetKey={bannerKey(it.id, 'overlay.title3')} defaultValue="" as="span" />
                  </div>
                ) : null}
                <div className="mt-2 text-[11px] sm:text-xs uppercase tracking-[0.18em] opacity-85 font-mono">
                  <EditableText assetKey={bannerKey(it.id, 'overlay.subtitle')} defaultValue="Alt başlık" as="span" />
                </div>
                <div className="mt-4 text-sm sm:text-base leading-relaxed max-w-[640px]">
                  <EditableText
                    assetKey={bannerKey(it.id, 'overlay.body')}
                    defaultValue=""
                    as="span"
                    multiline
                  />
                </div>

                {extras.map((ex) => (
                  <OverlayExtraItem key={ex.id} ex={ex} />
                ))}

                {ctaEnabled ? (
                  <div className="mt-5 pointer-events-auto inline-flex flex-col items-start" style={{ transform: `translate(${ctaPos.dx}px, ${ctaPos.dy}px)` }}>
                    {isAdmin ? (
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          role="button"
                          tabIndex={0}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium border ${
                            overlayColor === 'dark'
                              ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                              : 'bg-black/45 text-white border-white/20 hover:bg-black/55'
                          }`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                            ctaDragRef.current = { startX: e.clientX, startY: e.clientY, baseDx: ctaPos.dx, baseDy: ctaPos.dy };
                          }}
                          onPointerMove={(e) => {
                            const st = ctaDragRef.current;
                            if (!st) return;
                            const nextDx = clampInt(st.baseDx + (e.clientX - st.startX), -DRAG_MAX, DRAG_MAX);
                            const nextDy = clampInt(st.baseDy + (e.clientY - st.startY), -DRAG_MAX, DRAG_MAX);
                            setCtaPos({ dx: nextDx, dy: nextDy });
                          }}
                          onPointerUp={() => {
                            if (!ctaDragRef.current) return;
                            ctaDragRef.current = null;
                            setBannerAsset('cta.dx', String(ctaPos.dx));
                            setBannerAsset('cta.dy', String(ctaPos.dy));
                          }}
                          onPointerCancel={() => {
                            ctaDragRef.current = null;
                          }}
                          title="CTA butonunu taşı"
                        >
                          CTA taşı <span className="opacity-70 tabular-nums">({ctaPos.dx},{ctaPos.dy})</span>
                        </span>
                        <button
                          type="button"
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium border ${
                            overlayColor === 'dark'
                              ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                              : 'bg-black/45 text-white border-white/20 hover:bg-black/55'
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCtaPos({ dx: 0, dy: 0 });
                            setBannerAsset('cta.dx', '0');
                            setBannerAsset('cta.dy', '0');
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    ) : null}
                    <a
                      href={ctaResolvedHref}
                      className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium border transition ${
                        overlayColor === 'dark'
                          ? 'bg-[#051A24] text-white border-[#051A24] hover:opacity-95'
                          : 'bg-white/90 text-[#051A24] border-white/60 hover:bg-white'
                      }`}
                    >
                      <EditableText assetKey={bannerKey(it.id, 'cta.label')} defaultValue="Detaylar" as="span" />
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-5 py-4 md:px-6 md:py-5 border-t border-black/10 bg-white/90 backdrop-blur sticky top-0 z-[5]">
            <div className="flex items-start justify-end gap-3">
              {isAdmin ? (
                <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                  <select
                    value={width}
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    onChange={(e) => {
                      const w = (e.target.value as BannerWidth) || 'full';
                      updateItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, bannerWidth: w } : x)));
                    }}
                    title="Banner genişliği"
                  >
                    <option value="full">Tam genişlik</option>
                    <option value="contained">İçeride (contained)</option>
                  </select>
                  <input
                    type="number"
                    min={180}
                    max={900}
                    value={heightPx}
                    onChange={(e) => setBannerAsset('heightPx', String(e.target.value))}
                    className="w-[110px] rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    title="Yükseklik (px)"
                  />
                  <select
                    value={corners === 'soft' ? 'soft' : 'sharp'}
                    onChange={(e) => setBannerAsset('corners', String(e.target.value))}
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    title="Köşeler"
                  >
                    <option value="sharp">Keskin</option>
                    <option value="soft">Yumuşak</option>
                  </select>
                  <select
                    value={overlayPos}
                    onChange={(e) => setBannerAsset('overlay.position', String(e.target.value))}
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    title="Yazı pozisyonu"
                  >
                    <option value="top-left">Üst sol</option>
                    <option value="top-center">Üst orta</option>
                    <option value="top-right">Üst sağ</option>
                    <option value="center-left">Orta sol</option>
                    <option value="center">Orta</option>
                    <option value="center-right">Orta sağ</option>
                    <option value="bottom-left">Alt sol</option>
                    <option value="bottom-center">Alt orta</option>
                    <option value="bottom-right">Alt sağ</option>
                  </select>
                  <select
                    value={overlayColor}
                    onChange={(e) => setBannerAsset('overlay.color', String(e.target.value))}
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    title="Yazı rengi"
                  >
                    <option value="light">Açık (beyaz yazı)</option>
                    <option value="dark">Koyu (siyah yazı)</option>
                  </select>
                  <select
                    value={ctaEnabled ? '1' : '0'}
                    onChange={(e) => setBannerAsset('cta.enabled', String(e.target.value))}
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    title="CTA"
                  >
                    <option value="0">CTA kapalı</option>
                    <option value="1">CTA açık</option>
                  </select>
                  <select
                    value={safeSiteTargetValue(ctaHrefDraft)}
                    onChange={(e) => {
                      setCtaHrefDraft(e.target.value);
                      setBannerAsset('cta.href', e.target.value);
                    }}
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    title="CTA link"
                  >
                    {SAFE_SITE_LINK_TARGETS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                    onClick={() => {
                      const id = newId();
                      const textKey = bannerKey(it.id, `overlay.extra.${id}.text`);
                      writeAsset(textKey, 'Yeni metin');
                      persistExtras([{ id, textKey, dx: 0, dy: 0 }, ...extras]);
                    }}
                    title="Ek metin ekle"
                  >
                    <Plus className="h-4 w-4" />
                    Metin ekle
                  </button>

                  <button
                    type="button"
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                    onClick={() => setOpenId(it.id)}
                  >
                    <Pencil className="h-4 w-4" />
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 hover:bg-red-100 active:scale-95 transition inline-flex items-center gap-2"
                    onClick={() => deleteItem(it.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Sil
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function PosterCard(it: PackageItem) {
    void assetsVersion;
    const ctaEnabled = (readAsset(bannerKey(it.id, 'cta.enabled')) || '0').trim() === '1';
    const ctaHrefStored = (readAsset(bannerKey(it.id, 'cta.href')) || '#').trim() || '#';
    const [ctaHrefDraft, setCtaHrefDraft] = useState(ctaHrefStored);
    useEffect(() => setCtaHrefDraft(ctaHrefStored), [ctaHrefStored]);
    const setPosterAsset = (k: string, v: string) => {
      writeAsset(bannerKey(it.id, k), v);
      bumpAssetsVersion();
    };

    return (
    <div className="group block w-full text-left rounded-none overflow-hidden bg-transparent">
      <button type="button" onClick={() => setOpenId(it.id)} className="block w-full text-left">
      <div className="rounded-none overflow-hidden bg-black/[0.04]" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.10)' }}>
        <EditableAsset
          assetKey={it.imageKey}
          defaultValue={PLACEHOLDER}
          alt="Afiş görseli"
          className="w-full h-auto block"
          kind="image"
        />
      </div>
      </button>

      {ctaEnabled ? (
        <div className="mt-3">
          <a
            href={normalizePackageHref(ctaHrefDraft)}
            className="inline-flex items-center justify-center rounded-full bg-[#051A24] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95 active:scale-95 transition"
          >
            <EditableText assetKey={bannerKey(it.id, 'cta.label')} defaultValue="WhatsApp'tan bilgi al" as="span" />
          </a>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <select
            value={ctaEnabled ? '1' : '0'}
            onChange={(e) => setPosterAsset('cta.enabled', String(e.target.value))}
            className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
            title="CTA"
          >
            <option value="0">CTA kapalı</option>
            <option value="1">CTA açık</option>
          </select>
          <select
            value={safeSiteTargetValue(ctaHrefDraft)}
            onChange={(e) => {
              setCtaHrefDraft(e.target.value);
              setPosterAsset('cta.href', e.target.value);
            }}
            className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
            title="CTA link"
          >
            {SAFE_SITE_LINK_TARGETS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpenId(it.id);
            }}
          >
            <Pencil className="h-4 w-4" />
            Düzenle
          </button>
          <button
            type="button"
            className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 hover:bg-red-100 active:scale-95 transition inline-flex items-center gap-2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteItem(it.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Sil
          </button>
        </div>
      ) : null}
    </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F7F8]">
      <div className="px-6 py-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-sm text-[#051A24]/70 hover:text-[#051A24]">
              <ChevronLeft className="h-4 w-4" />
              Anasayfa
            </a>
            <div className="mt-3 text-[28px] md:text-[34px] font-semibold text-[#0D212C] tracking-tight">{title}</div>
            <div className="text-sm text-[#0D212C]/70 mt-1">{subtitle}</div>
          </div>

          {isAdmin ? (
            <div className="flex gap-2 flex-wrap items-center">
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition inline-flex items-center gap-2"
                onClick={() => {
                  const id = newId();
                  const next: PackageItem = {
                    id,
                    kind: 'banner',
                    bannerWidth: 'full',
                    imageKey: `${effectiveAssetPrefix}.${id}.image`,
                    titleKey: `${effectiveAssetPrefix}.${id}.title`,
                    detailKey: `${effectiveAssetPrefix}.${id}.detail`,
                  };
                  updateItems((prev) => [next, ...prev]);
                }}
              >
                <Plus className="h-4 w-4" />
                Banner ekle
              </button>
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                onClick={() => {
                  const id = newId();
                  const next: PackageItem = {
                    id,
                    kind: 'poster',
                    imageKey: `${effectiveAssetPrefix}.${id}.image`,
                    titleKey: `${effectiveAssetPrefix}.${id}.title`,
                    detailKey: `${effectiveAssetPrefix}.${id}.detail`,
                  };
                  updateItems((prev) => [next, ...prev]);
                }}
              >
                <Plus className="h-4 w-4" />
                Afiş ekle
              </button>
            </div>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="mt-6 rounded-none border border-black/10 bg-white shadow-sm p-4">
            <div className="text-sm font-semibold text-[#051A24]">Sıralama & Yer Değiştirme</div>
            <div className="text-xs text-[#051A24]/60 mt-1">
              Yukarı/aşağı ile sırayı değiştir. “Tür” ile banner ↔ afiş taşı.
            </div>

            <div className="mt-3 space-y-2">
              {items.length ? (
                items.map((it, idx) => (
                  <div key={it.id} className="flex items-center gap-2 rounded-none border border-black/10 p-2">
                    <div className="text-xs text-[#051A24]/55 w-10">#{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#051A24] truncate">
                        <EditableText assetKey={it.titleKey} defaultValue={it.kind === 'banner' ? 'Banner' : 'Afiş'} as="span" />
                      </div>
                      <div className="text-[11px] text-[#051A24]/55">id: {it.id}</div>
                    </div>

                    <select
                      value={it.kind}
                      className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                      onChange={(e) => {
                        const kind = (e.target.value as PackageKind) || 'banner';
                        updateItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, kind } : x)));
                      }}
                    >
                      <option value="banner">Banner</option>
                      <option value="poster">Afiş</option>
                    </select>
                    <button
                      type="button"
                      className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition"
                      onClick={() => setOpenId(it.id)}
                      title="Düzenle"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 hover:bg-red-100 active:scale-95 transition"
                      onClick={() => {
                        if (!confirm('Bu öğe silinsin mi?')) return;
                        updateItems((prev) => prev.filter((x) => x.id !== it.id));
                        if (openId === it.id) setOpenId(null);
                      }}
                      title="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition"
                      disabled={idx === 0}
                      onClick={() => {
                        updateItems((prev) => {
                          const at = prev.findIndex((x) => x.id === it.id);
                          if (at <= 0) return prev;
                          const next = [...prev];
                          const tmp = next[at - 1];
                          next[at - 1] = next[at];
                          next[at] = tmp;
                          return next;
                        });
                      }}
                      title="Yukarı"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition"
                      disabled={idx === items.length - 1}
                      onClick={() => {
                        updateItems((prev) => {
                          const at = prev.findIndex((x) => x.id === it.id);
                          if (at < 0 || at >= prev.length - 1) return prev;
                          const next = [...prev];
                          const tmp = next[at + 1];
                          next[at + 1] = next[at];
                          next[at] = tmp;
                          return next;
                        });
                      }}
                      title="Aşağı"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[#051A24]/60">Henüz öğe yok.</div>
              )}
            </div>
          </div>
        ) : null}

        {/* Order-preserving render: keep list order, but batch consecutive posters into a grid row. */}
        <div className="mt-8 space-y-8">
          {(() => {
            const visible = isAdmin ? items : items.filter((it) => (filter === 'all' ? true : it.kind === filter));
            const out: Array<React.ReactElement> = [];
            let posterBuf: PackageItem[] = [];

            const flushPosters = () => {
              if (!posterBuf.length) return;
              out.push(
                <div key={`posters:${posterBuf.map((x) => x.id).join(',')}`} className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {posterBuf.map((p) => (
                    <PosterCard key={p.id} {...p} />
                  ))}
                </div>,
              );
              posterBuf = [];
            };

            for (const it of visible) {
              if (it.kind === 'poster') {
                posterBuf.push(it);
                continue;
              }
              flushPosters();
              out.push(<BannerCard key={it.id} it={it} />);
            }
            flushPosters();
            return out;
          })()}
        </div>
      </div>

      {openItem ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenId(null)} />
          <div className="relative w-full max-w-4xl bg-white rounded-none shadow-2xl overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#051A24]">{openItem.kind === 'banner' ? 'Banner detayı' : 'Afiş detayı'}</div>
              <div className="flex items-center gap-2">
                {openItem.kind === 'poster' ? (
                  <a
                    className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition"
                    href={readAsset(openItem.imageKey) || PLACEHOLDER}
                    target="_blank"
                    rel="noreferrer"
                    title="Görseli yeni sekmede aç"
                  >
                    Orijinali aç
                  </a>
                ) : null}
                <button
                  type="button"
                  className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition"
                  onClick={() => setOpenId(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className={openItem.kind === 'poster' ? 'grid grid-cols-1' : 'grid grid-cols-1 md:grid-cols-2'}>
              <div className="bg-black/[0.04] max-h-[78vh] overflow-auto">
                <EditableAsset
                  assetKey={openItem.imageKey}
                  defaultValue={PLACEHOLDER}
                  alt="Paket görseli"
                  className={openItem.kind === 'poster' ? 'w-full h-auto object-contain' : 'w-full h-full object-cover'}
                />
              </div>
              <div className="p-5">
                <div className="text-[22px] md:text-[26px] font-semibold text-[#051A24] tracking-tight leading-tight">
                  <EditableText
                    assetKey={openItem.titleKey}
                    defaultValue={openItem.kind === 'banner' ? 'Banner' : 'Afiş'}
                    as="span"
                  />
                </div>
                <div className="mt-3 text-sm text-[#051A24]/75 whitespace-pre-wrap">
                  <EditableText assetKey={openItem.detailKey} defaultValue="Detay yazısı…" as="span" multiline />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
