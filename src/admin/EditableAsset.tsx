import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from './AdminContext';
import { fileToDataUrl, useEditableAsset } from './assets';

function guessKind(url: string): 'image' | 'video' {
  const u = url.toLowerCase();
  if (u.startsWith('data:video/')) return 'video';
  if (u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.ogg')) return 'video';
  return 'image';
}

type AssetHint = {
  title: string;
  aspect: string;
  minPx: string;
  idealPx: string;
};

function getAssetHint(assetKey: string, kind: 'image' | 'video'): AssetHint {
  const k = assetKey.toLowerCase();

  // Small UI elements
  if (k.includes('avatar')) {
    return {
      title: 'Avatar (küçük)',
      aspect: '1:1',
      minPx: '256×256',
      idealPx: '512×512',
    };
  }

  if (k.includes('partnersection.particle')) {
    return {
      title: 'Particle kart (küçük)',
      aspect: 'yakın 16:9',
      minPx: '320×192',
      idealPx: '640×384',
    };
  }

  // Product detail media area
  if (k.includes('portrait') || k.includes('people.')) {
    return {
      title: kind === 'video' ? 'Portre video' : 'Portre görsel',
      aspect: '4:5 (portre)',
      minPx: kind === 'video' ? '1080×1350' : '1000×1250',
      idealPx: kind === 'video' ? '1440×1800' : '1600×2000',
    };
  }

  // Projects / Hero marquee (large)
  if (k.startsWith('projects.')) {
    return {
      title: kind === 'video' ? 'Project video (büyük)' : 'Project görsel (büyük)',
      aspect: '16:9 (önerilen)',
      minPx: '1920×1080',
      idealPx: kind === 'video' ? '2560×1440' : '2560×1440',
    };
  }

  if (k.startsWith('app.marquee.')) {
    return {
      title: kind === 'video' ? 'Hero marquee video' : 'Hero marquee görsel',
      aspect: '16:9',
      minPx: '1920×1080',
      idealPx: kind === 'video' ? '2560×1440' : '2560×1440',
    };
  }

  // Default fallback
  return {
    title: kind === 'video' ? 'Video' : 'Görsel',
    aspect: '16:9 veya 3:2',
    minPx: kind === 'video' ? '1920×1080' : '1600×900',
    idealPx: kind === 'video' ? '2560×1440' : '2400×1350',
  };
}

type EditableAssetProps = {
  assetKey: string;
  defaultValue: string;
  alt?: string;
  className?: string;
  kind?: 'auto' | 'image' | 'video';
  onDelete?: () => void;
  deleteLabel?: string;
};

export function EditableAsset({
  assetKey,
  defaultValue,
  alt,
  className,
  kind = 'auto',
  onDelete,
  deleteLabel = 'Sil',
}: EditableAssetProps) {
  const { isAdmin } = useAdmin();
  const { value, setValue, reset } = useEditableAsset(assetKey, defaultValue);
  const [open, setOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(value);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveKind = kind === 'auto' ? guessKind(value) : kind;
  const canPortal = typeof document !== 'undefined';
  const hint = useMemo(() => getAssetHint(assetKey, effectiveKind), [assetKey, effectiveKind]);
  const modal = useMemo(() => {
    if (!open || !canPortal) return null;
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div
          className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-lg font-semibold text-[#051A24]">Medya düzenle</div>
              <div className="text-xs text-[#051A24]/70 mt-1">{assetKey}</div>
            </div>
            <button
              type="button"
              className="text-[#051A24]/60 hover:text-[#051A24] px-2"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2">
              <div className="text-xs font-semibold text-[#051A24]">{hint.title} önerisi</div>
              <div className="text-xs text-[#051A24]/70 mt-1">
                Oran: <span className="font-medium text-[#051A24]">{hint.aspect}</span> · Minimum:{" "}
                <span className="font-medium text-[#051A24]">{hint.minPx}</span> · İdeal:{" "}
                <span className="font-medium text-[#051A24]">{hint.idealPx}</span>
              </div>
            </div>

            <div className="text-xs font-medium text-[#051A24]">URL</div>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="https://... veya data:..."
              autoFocus
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                onClick={() => {
                  setValue(draftUrl.trim());
                  setOpen(false);
                }}
              >
                Kaydet
              </button>

              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => fileInputRef.current?.click()}
              >
                Dosya yükle
              </button>

              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Reset
              </button>

              {onDelete ? (
                <button
                  type="button"
                  className="rounded-full bg-white text-red-700 px-4 py-2 text-sm border border-red-200 hover:bg-red-50 active:scale-95 transition"
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                  }}
                >
                  {deleteLabel}
                </button>
              ) : null}

              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => setOpen(false)}
              >
                İptal
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={effectiveKind === 'video' ? 'video/*' : 'image/*,video/*'}
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const dataUrl = await fileToDataUrl(file);
                setValue(dataUrl);
                setOpen(false);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    );
  }, [assetKey, canPortal, deleteLabel, draftUrl, effectiveKind, hint, onDelete, open, reset, setValue]);

  return (
    <div className="relative group">
      {effectiveKind === 'video' ? (
        <video src={value} className={className} autoPlay muted loop playsInline />
      ) : (
        <img src={value} alt={alt ?? ''} className={className} />
      )}

      {isAdmin ? (
        <>
          <div className="absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition bg-black/20 pointer-events-none" />
          <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition">
            <span
              role="button"
              tabIndex={0}
              className="cursor-pointer select-none rounded-full bg-white/90 backdrop-blur px-3 py-1 text-xs font-medium shadow hover:bg-white inline-flex items-center"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraftUrl(value);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraftUrl(value);
                  setOpen(true);
                }
              }}
            >
              Düzenle
            </span>
          </div>

          {open && canPortal && modal ? createPortal(modal, document.body) : null}
        </>
      ) : null}
    </div>
  );
}

