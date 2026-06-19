import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './Button';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { useEditableAsset } from '../admin/assets';
import { useAdmin } from '../admin/AdminContext';
import { DEFAULT_LOOP_MEDIA_URLS } from '../lib/defaultSiteMedia';
import { waMeDigits, waMeUrl } from '../lib/whatsapp';

interface MouseParticle {
  id: number;
  x: number;
  y: number;
  url: string;
  rotation: number;
  scale: number;
  opacity: number;
}

export function PartnerSection({ blockId = 'hm-partner' }: { blockId?: string }) {
  const { isAdmin } = useAdmin();
  const [particles, setParticles] = useState<MouseParticle[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSpawn = useRef(0);

  const { value: phoneRaw, setValue: setPhoneRaw } = useEditableAsset('whatsapp.phone', '905XXXXXXXXX');
  const { value: defaultMessage } = useEditableAsset('whatsapp.defaultMessage', 'Merhaba, bilgi almak istiyorum.');
  const partnerWaHref = useMemo(() => {
    const d = waMeDigits(phoneRaw);
    if (d.length < 8) return '';
    return waMeUrl(d, (defaultMessage || '').trim());
  }, [phoneRaw, defaultMessage]);

  // Mouse particle medyaları → Yönetici menüsü “Site medyaları”ndan düzenlenir (partnerSection.particleList).
  const particleListKey = blockId === 'hm-partner' ? 'partnerSection.particleList' : `site.home.blocks.${blockId}.partner.particles`;
  const particleAssetPrefix = blockId === 'hm-partner' ? 'partnerSection.particle' : `site.home.blocks.${blockId}.partner.particle`;
  const { value: particleListRaw } = useEditableAsset(particleListKey, DEFAULT_LOOP_MEDIA_URLS.join('\n'));
  const particleUrls = useMemo(() => {
    const lines = String(particleListRaw || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    return lines.length ? lines : [...DEFAULT_LOOP_MEDIA_URLS];
  }, [particleListRaw]);

  const spawnParticle = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastSpawn.current < 80) return;
    lastSpawn.current = now;

    const pick = particleUrls[Math.floor(Math.random() * particleUrls.length)] || DEFAULT_LOOP_MEDIA_URLS[0];
    const newParticle: MouseParticle = {
      id: now,
      x,
      y,
      url: pick,
      rotation: Math.random() * 20 - 10,
      scale: 1,
      opacity: 1
    };

    setParticles(prev => [...prev, newParticle]);
  }, [particleUrls]);

  useEffect(() => {
    const int = setInterval(() => {
      setParticles(prev => prev
        .map(p => ({
          ...p,
          scale: p.scale - 0.05,
          opacity: p.opacity - 0.05
        }))
        .filter(p => p.opacity > 0)
      );
    }, 50);

    return () => clearInterval(int);
  }, []);

  return (
    <section className="w-full py-12 px-6 overflow-hidden">
      <div 
        ref={containerRef}
        className="max-w-7xl mx-auto py-48 rounded-[40px] bg-white shadow-sm border border-black/[0.03] relative flex flex-col items-center justify-center text-center cursor-none"
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            spawnParticle(e.clientX - rect.left, e.clientY - rect.top);
          }
        }}
      >
        <h2 className="text-[48px] md:text-[64px] lg:text-[80px] font-serif text-[#0D212C] mb-12 tracking-tight z-10">
          <EditableText assetKey="partnerSection.title.prefix" defaultValue="Partner with " as="span" />
          <span className="italic">
            <EditableText assetKey="partnerSection.title.italic" defaultValue="us" as="span" />
          </span>
        </h2>
        
        <div className="z-10">
          <Button
            variant="primary"
            type="button"
            className="flex items-center gap-3 pr-10"
            disabled={!partnerWaHref && !isAdmin}
            onClick={() => {
              if (typeof window === 'undefined' || !partnerWaHref) return;
              window.open(partnerWaHref, '_blank', 'noopener,noreferrer');
            }}
          >
            <EditableAsset
              assetKey="partnerSection.avatar"
              defaultValue="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=160"
              alt="Ekip"
              className="w-10 h-10 rounded-full object-cover"
            />
            <EditableText assetKey="partnerSection.cta" defaultValue="Bizimle birlikte çalış" as="span" />
          </Button>
          {isAdmin ? (
            <div className="mt-3 rounded-2xl border border-black/10 bg-white/90 p-3 text-left shadow-sm">
              <label className="mb-1 block text-[11px] font-medium text-[#051A24]/70">WhatsApp numarasi</label>
              <input
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                placeholder="905XXXXXXXXX"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <div className="mt-1 text-[11px] text-[#051A24]/55">Ulke koduyla yaz: 905xxxxxxxxx</div>
            </div>
          ) : null}
        </div>

        {particles.map(p => (
          <div
            key={p.id}
            className="absolute w-40 h-24 pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.scale})`,
              opacity: p.opacity
            }}
          >
            <EditableAsset
              assetKey={`${particleAssetPrefix}.${Math.max(0, particleUrls.indexOf(p.url))}`}
              defaultValue={p.url}
              alt="Particle"
              kind="auto"
              className="w-40 h-24 object-cover rounded-xl shadow-2xl"
            />
          </div>
        ))}

        {/* Custom cursor follower */}
        <div 
          className="fixed w-4 h-4 bg-[#051A24] rounded-full mix-blend-difference pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2 hidden md:block"
          style={{ transition: 'none' }}
          id="cursor-follower"
        />

      </div>
    </section>
  );
}
