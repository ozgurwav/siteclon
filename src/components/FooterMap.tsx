import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditableAsset } from '../admin/assets';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(raw: string, fallback: number) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function buildGoogleEmbedUrl(lat: number, lng: number, zoom: number) {
  const z = clamp(Math.round(zoom), 2, 20);
  const q = `${lat},${lng}`;
  // This is a lightweight embed that doesn't require an API key.
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${encodeURIComponent(String(z))}&output=embed`;
}

export function FooterMap() {
  const { value: latRaw } = useEditableAsset('footer.map.lat', '41.0082');
  const { value: lngRaw } = useEditableAsset('footer.map.lng', '28.9784');
  const { value: zoomRaw } = useEditableAsset('footer.map.zoom', '14');
  const { value: title } = useEditableAsset('footer.map.title', 'Location');
  const { value: ctaLabel } = useEditableAsset('footer.map.cta', 'Haritayı aç');

  const lat = toNumber(latRaw, 41.0082);
  const lng = toNumber(lngRaw, 28.9784);
  const zoom = toNumber(zoomRaw, 14);

  const src = useMemo(() => buildGoogleEmbedUrl(lat, lng, zoom), [lat, lng, zoom]);
  const mapsHref = useMemo(() => `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=${encodeURIComponent(String(clamp(Math.round(zoom), 2, 20)))}`, [lat, lng, zoom]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          obs.disconnect();
        }
      },
      { root: null, rootMargin: '400px 0px', threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [shouldLoad]);

  return (
    <div className="w-full md:w-[360px]">
      <div className="text-xs font-medium text-[#051A24]/70 mb-3">{title}</div>
      <div className="rounded-2xl overflow-hidden border border-black/10 shadow-[0_4px_30px_rgba(0,0,0,0.08),inset_0_2px_8px_0_rgba(255,255,255,0.5)] bg-white">
        <div ref={hostRef} className="w-full h-[220px] relative">
          {shouldLoad ? (
            <iframe
              title={title}
              src={src}
              className="absolute inset-0 w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/[0.02] to-black/[0.06]">
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 shadow-[0_4px_30px_rgba(0,0,0,0.08),inset_0_2px_8px_0_rgba(255,255,255,0.5)] hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => setShouldLoad(true)}
              >
                {ctaLabel}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

