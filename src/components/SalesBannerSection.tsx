import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '../admin/AdminContext';
import { readAsset, writeAsset } from '../admin/assets';
import { DEFAULT_SALES_BANNER_MEDIA } from '../lib/defaultSiteMedia';
import { cn } from '../lib/utils';
import { EditableText } from '../admin/EditableText';
import { normalizeSiteHref } from '../lib/siteLinks';
import { waMeDigits, waMeUrl } from '../lib/whatsapp';

function isVideoUrl(url: string) {
  const u = (url || '').toLowerCase();
  if (u.startsWith('data:video/')) return true;
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(u);
}

export function SalesBannerSection({ blockId = 'hm-sales' }: { blockId?: string }) {
  const { assetsVersion, isAdmin } = useAdmin();
  const keyFor = (suffix: string) => (blockId === 'hm-sales' ? `site.salesBanner.${suffix}` : `site.home.blocks.${blockId}.${suffix}`);

  const { media, text, width, heightPx, corners, overlay, cta, drag } = useMemo(() => {
    void assetsVersion;
    const media = (readAsset(keyFor('media')) || DEFAULT_SALES_BANNER_MEDIA).trim() || DEFAULT_SALES_BANNER_MEDIA;
    const text = (readAsset(keyFor('text')) || '').trim();
    const width = (readAsset(keyFor('width')) || 'contained').trim().toLowerCase();
    const rawH = Number((readAsset(keyFor('heightPx')) || '').trim());
    const heightPx = Number.isFinite(rawH) ? Math.min(900, Math.max(140, Math.floor(rawH))) : 360;
    const corners = (readAsset(keyFor('corners')) || 'soft').trim().toLowerCase();
    const position = (readAsset(keyFor('overlay.position')) || 'center-left').trim().toLowerCase();
    const color = (readAsset(keyFor('overlay.color')) || 'light').trim().toLowerCase();
    const hasOverlay =
      Boolean((readAsset(keyFor('overlay.title')) || '').trim()) ||
      Boolean((readAsset(keyFor('overlay.subtitle')) || '').trim()) ||
      (readAsset(keyFor('cta.enabled')) || '0').trim() === '1';
    const ctaEnabled = (readAsset(keyFor('cta.enabled')) || '0').trim() === '1';
    const normalizedCtaHref = normalizeSiteHref((readAsset(keyFor('cta.href')) || '#').trim());
    const ctaHref =
      normalizedCtaHref === 'whatsapp'
        ? (() => {
            const digits = waMeDigits(readAsset('whatsapp.phone') || '905XXXXXXXXX');
            return digits.length >= 8 ? waMeUrl(digits, readAsset('whatsapp.defaultMessage') || 'Merhaba, bilgi almak istiyorum.') : '/';
          })()
        : normalizedCtaHref === '#'
          ? '/calendar'
          : normalizedCtaHref;
    const dx = Number((readAsset(keyFor('overlay.dx')) || '0').trim());
    const dy = Number((readAsset(keyFor('overlay.dy')) || '0').trim());
    const drag = {
      dx: Number.isFinite(dx) ? Math.max(-600, Math.min(600, Math.floor(dx))) : 0,
      dy: Number.isFinite(dy) ? Math.max(-600, Math.min(600, Math.floor(dy))) : 0,
    };
    return {
      media,
      text,
      width,
      heightPx,
      corners,
      overlay: { position, color, enabled: hasOverlay },
      cta: { enabled: ctaEnabled, href: ctaHref },
      drag,
    };
  }, [assetsVersion, blockId]);

  const isVideo = isVideoUrl(media);
  const fullBleed = width === 'full';
  const sharp = corners === 'sharp' || corners === 'hard' || corners === 'none';
  const radiusClass = fullBleed ? 'rounded-none' : sharp ? 'rounded-none' : 'rounded-3xl';
  const frameClass = fullBleed ? 'border-transparent bg-transparent shadow-none' : 'border-black/10 bg-white shadow-sm';
  const overlayColorClass = overlay.color === 'dark' ? 'text-[#051A24]' : 'text-white';
  const overlayShadowClass = overlay.color === 'dark' ? '' : 'drop-shadow-[0_2px_14px_rgba(0,0,0,0.35)]';

  const overlayPosClass =
    overlay.position === 'top-left'
      ? 'items-start justify-start text-left pt-10 sm:pt-12'
      : overlay.position === 'top-center'
        ? 'items-start justify-center text-center pt-10 sm:pt-12'
        : overlay.position === 'top-right'
          ? 'items-start justify-end text-right pt-10 sm:pt-12'
          : overlay.position === 'center'
            ? 'items-center justify-center text-center'
            : overlay.position === 'center-right'
              ? 'items-center justify-end text-right'
              : overlay.position === 'bottom-left'
                ? 'items-end justify-start text-left pb-10 sm:pb-12'
                : overlay.position === 'bottom-center'
                  ? 'items-end justify-center text-center pb-10 sm:pb-12'
                  : overlay.position === 'bottom-right'
                    ? 'items-end justify-end text-right pb-10 sm:pb-12'
                    : 'items-center justify-start text-left'; // center-left default

  const [dragPos, setDragPos] = useState<{ dx: number; dy: number }>({ dx: drag.dx, dy: drag.dy });
  useEffect(() => setDragPos({ dx: drag.dx, dy: drag.dy }), [drag.dx, drag.dy]);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);

  return (
    <section className="w-full">
      <div className={cn(fullBleed ? 'w-full' : 'max-w-6xl mx-auto px-5')}>
        <div className={cn(radiusClass, 'relative overflow-hidden border', frameClass)}>
          <div className="w-full bg-[#F4F5F6]" style={{ height: `${heightPx}px` }}>
            {isVideo ? (
              <video src={media} className="w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : (
              <img src={media} alt="" className="w-full h-full object-cover" />
            )}
          </div>

          {overlay.enabled ? (
            <div className={cn('absolute inset-0 flex px-6 sm:px-10', overlayPosClass, overlayColorClass)}>
              {/* subtle fade for readability */}
              {overlay.color !== 'dark' ? (
                <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/10 to-black/0 pointer-events-none" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-r from-white/55 via-white/20 to-white/0 pointer-events-none" />
              )}

              <div
                className={cn('relative z-10 max-w-[720px] py-10', overlayShadowClass)}
                style={{ transform: `translate(${dragPos.dx}px, ${dragPos.dy}px)` }}
              >
                {isAdmin ? (
                  <div className="mb-3 pointer-events-auto">
                    <span
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium border',
                        overlay.color === 'dark'
                          ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                          : 'bg-black/45 text-white border-white/20 hover:bg-black/55',
                      )}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                        dragRef.current = {
                          active: true,
                          startX: e.clientX,
                          startY: e.clientY,
                          baseDx: dragPos.dx,
                          baseDy: dragPos.dy,
                        };
                      }}
                      onPointerMove={(e) => {
                        const st = dragRef.current;
                        if (!st?.active) return;
                        const nextDx = Math.max(-600, Math.min(600, Math.floor(st.baseDx + (e.clientX - st.startX))));
                        const nextDy = Math.max(-600, Math.min(600, Math.floor(st.baseDy + (e.clientY - st.startY))));
                        setDragPos({ dx: nextDx, dy: nextDy });
                      }}
                      onPointerUp={() => {
                        const st = dragRef.current;
                        if (!st?.active) return;
                        dragRef.current = null;
                        writeAsset(keyFor('overlay.dx'), String(dragPos.dx));
                        writeAsset(keyFor('overlay.dy'), String(dragPos.dy));
                      }}
                      onPointerCancel={() => {
                        dragRef.current = null;
                      }}
                      title="Sürükleyip konumlandır"
                    >
                      Taşı
                      <span className="opacity-70 tabular-nums">
                        ({dragPos.dx},{dragPos.dy})
                      </span>
                    </span>
                    <button
                      type="button"
                      className={cn(
                        'ml-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium border',
                        overlay.color === 'dark'
                          ? 'bg-white/85 text-[#051A24] border-black/10 hover:bg-white'
                          : 'bg-black/45 text-white border-white/20 hover:bg-black/55',
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragPos({ dx: 0, dy: 0 });
                        writeAsset(keyFor('overlay.dx'), '0');
                        writeAsset(keyFor('overlay.dy'), '0');
                      }}
                    >
                      Reset konum
                    </button>
                  </div>
                ) : null}
                <div className="text-[28px] sm:text-[40px] lg:text-[52px] leading-[1.05] font-serif font-semibold tracking-tight">
                  <EditableText assetKey={keyFor('overlay.title')} defaultValue="Master Your Craft" as="span" />
                </div>
                <div className="mt-2 text-[11px] sm:text-xs uppercase tracking-[0.18em] opacity-85 font-mono">
                  <EditableText assetKey={keyFor('overlay.subtitle')} defaultValue="Join over 500,000 students" as="span" />
                </div>

                {cta.enabled ? (
                  <div className="mt-5 pointer-events-auto">
                    <a
                      href={cta.href}
                      className={cn(
                        'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium border transition',
                        overlay.color === 'dark'
                          ? 'bg-[#051A24] text-white border-[#051A24] hover:opacity-95'
                          : 'bg-white/90 text-[#051A24] border-white/60 hover:bg-white',
                      )}
                    >
                      <EditableText assetKey={keyFor('cta.label')} defaultValue="Browse collections" as="span" />
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {text ? (
        <div className={cn(fullBleed ? 'max-w-6xl mx-auto px-5' : '', 'pt-4')}>
          <div className={cn('text-sm sm:text-base text-[#051A24]/80 leading-relaxed', fullBleed ? '' : 'px-2')}>
            {text}
          </div>
        </div>
      ) : null}
    </section>
  );
}
