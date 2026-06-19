import { useMemo } from 'react';
import { useAdmin } from '../admin/AdminContext';
import { readAsset, useEditableAsset } from '../admin/assets';
import { DEFAULT_LOOP_MEDIA_URLS } from '../lib/defaultSiteMedia';

function isVideoUrl(url: string) {
  const u = String(url || '').toLowerCase();
  return u.startsWith('data:video/') || /\.(mp4|webm|ogg)(\?|#|$)/.test(u);
}

export function MarqueeStrip({ blockId = 'hm-marquee' }: { blockId?: string }) {
  const { assetsVersion } = useAdmin();
  const mediaKey = blockId === 'hm-marquee' ? 'app.marquee.urls' : `site.home.blocks.${blockId}.marquee.urls`;
  const { value: marqueeRaw } = useEditableAsset(mediaKey, DEFAULT_LOOP_MEDIA_URLS.join('\n'));

  const urls = useMemo(() => {
    void assetsVersion;
    const stored = readAsset(mediaKey);
    const unified = String(stored ?? marqueeRaw ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    if (unified.length) return unified;
    return [];
  }, [marqueeRaw, assetsVersion]);

  const loop = useMemo(() => [...urls, ...urls], [urls]);

  if (!urls.length) return null;

  return (
    <section className="w-full mt-16 md:mt-20 mb-16 overflow-hidden">
      <div className="flex animate-marquee">
        {loop.map((url, i) => (
          <div key={`m-${i}`} className="flex-shrink-0 mx-3">
            {isVideoUrl(url) ? (
              <video src={url} className="h-[280px] md:h-[500px] w-auto rounded-2xl shadow-lg object-cover" autoPlay muted loop playsInline />
            ) : (
              <img src={url} alt="Marquee graphic" className="h-[280px] md:h-[500px] w-auto rounded-2xl shadow-lg object-cover" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
