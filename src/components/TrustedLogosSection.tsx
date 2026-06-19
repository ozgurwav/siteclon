import { useMemo } from 'react';
import { useAdmin } from '../admin/AdminContext';
import { readAsset } from '../admin/assets';
import { EditableText } from '../admin/EditableText';
import { cn } from '../lib/utils';

function parseLines(raw: string | null): string[] {
  return String(raw || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function TrustedLogosSection({ blockId = 'hm-trustedLogos' }: { blockId?: string }) {
  const { assetsVersion, isAdmin } = useAdmin();
  const keyFor = (suffix: string) => (blockId === 'hm-trustedLogos' ? `site.trustedLogos.${suffix}` : `site.home.blocks.${blockId}.${suffix}`);

  const { logos, layout, tone } = useMemo(() => {
    void assetsVersion;
    const logos = parseLines(readAsset(keyFor('logos')));
    const layout = (readAsset(keyFor('layout')) || 'grid').trim().toLowerCase();
    const tone = (readAsset(keyFor('tone')) || 'mono-dim').trim().toLowerCase();
    return {
      logos,
      layout: layout === 'strip' ? 'strip' : 'grid',
      tone: tone === 'color' || tone === 'mono' || tone === 'mono-dim' ? tone : 'mono-dim',
    };
  }, [assetsVersion, blockId]);

  if (!logos.length && !isAdmin) return null;

  const imgToneClass =
    tone === 'color' ? 'opacity-90' : tone === 'mono' ? 'grayscale opacity-90' : 'grayscale opacity-70';

  return (
    <section className="w-full py-14 md:py-20">
      <div className="max-w-6xl mx-auto px-5">
        <div className="mb-8 md:mb-10">
          <div className="text-xs uppercase tracking-[0.2em] text-[#051A24]/55 font-mono">
            <EditableText assetKey={keyFor('kicker')} defaultValue="Trusted by" as="span" />
          </div>
          <div className="mt-2 text-[28px] md:text-[40px] leading-[1.06] font-serif font-semibold tracking-tight text-[#051A24]">
            <EditableText assetKey={keyFor('title')} defaultValue="Çalıştığımız büyük markalar" as="span" />
          </div>
          <div className="mt-3 text-sm md:text-base text-[#051A24]/70 leading-relaxed max-w-2xl">
            <EditableText
              assetKey={keyFor('subtitle')}
              defaultValue="Seçili örnekler — tüm referansları istersen ayrıca paylaşırız."
              as="span"
              multiline
            />
          </div>
        </div>

        {!logos.length ? (
          <div className="rounded-2xl border border-dashed border-black/20 bg-white/70 px-5 py-8 text-sm text-[#051A24]/65">
            Büyük markalar bloğu eklendi. Logoları yönetici panelindeki Site medyaları bölümünden ekleyebilirsin.
          </div>
        ) : layout === 'strip' ? (
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
              {logos.slice(0, 24).map((src, i) => (
                <div key={`logo-${i}`} className="h-8 md:h-10">
                  <img
                    src={src}
                    alt=""
                    className={cn('h-full w-auto object-contain transition hover:opacity-95', imgToneClass)}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={cn('grid gap-5 md:gap-7', 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6')}>
            {logos.slice(0, 24).map((src, i) => (
              <div
                key={`logo-${i}`}
                className="rounded-2xl border border-black/10 bg-white/70 backdrop-blur px-4 py-5 flex items-center justify-center"
              >
                <img src={src} alt="" className={cn('h-8 md:h-10 w-auto object-contain', imgToneClass)} loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
