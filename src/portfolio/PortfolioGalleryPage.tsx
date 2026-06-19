import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useAdmin } from '../admin/AdminContext';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { clearAsset, readAsset, readJsonAsset, writeAsset, writeJsonAsset } from '../admin/assets';

type GalleryKind = 'photo' | 'video' | 'mixed';
type GalleryLayout = 'masonry' | 'edge' | 'film';

type GalleryMediaItem = {
  id: string;
  kind: 'photo' | 'video';
  assetKey: string;
};

type ToolbarMenuSubItem =
  | { id: string; type?: 'link'; label: string; href: string; enabled: boolean }
  | { id: string; type: 'gallery'; label: string; enabled: boolean; galleryKind: GalleryKind; galleryLayout?: GalleryLayout };

type ToolbarItemConfig =
  | { id: string; type: 'link'; label: string; href: string; enabled: boolean }
  | { id: string; type: 'menu'; label: string; enabled: boolean; items: ToolbarMenuSubItem[] };

const GALLERY_LIST_PREFIX = 'portfolio.gallery';
const GALLERY_PLACEHOLDER_IMAGE =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1526170375885-4d8ecf77b99f%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1200%26q%3D80&w=1200&q=85';

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function parseGalleryMeta(it: unknown): { label: string; kind: GalleryKind; layout: GalleryLayout } | null {
  if (!it || typeof it !== 'object') return null;
  if (String((it as any).type || '').toLowerCase() !== 'gallery') return null;
  const label = String((it as any).label || 'Portfolyo');
  const k = String((it as any).galleryKind || 'mixed').toLowerCase();
  const kind: GalleryKind = k === 'photo' || k === 'video' || k === 'mixed' ? (k as GalleryKind) : 'mixed';
  const l = String((it as any).galleryLayout || 'masonry').toLowerCase();
  const layout: GalleryLayout = l === 'masonry' || l === 'edge' || l === 'film' ? (l as GalleryLayout) : 'masonry';
  return { label, kind, layout };
}

function findGalleryMeta(galleryId: string): { label: string; kind: GalleryKind; layout: GalleryLayout } | null {
  const raw = readJsonAsset<unknown>('admin.toolbar.buttons');
  if (!Array.isArray(raw)) return null;

  for (const top of raw as any[]) {
    if (!top || typeof top !== 'object') continue;
    if (top.type !== 'menu' && top.type !== 'link') continue;
    const items = Array.isArray(top.items) ? top.items : [];
    for (const it of items) {
      if (String((it as any)?.id || '') !== galleryId) continue;
      const meta = parseGalleryMeta(it);
      if (meta) return meta;
    }
  }
  return null;
}

type PortfolioGalleryPageProps = {
  galleryIdOverride?: string;
  titleOverride?: string;
};

export function PortfolioGalleryPage({ galleryIdOverride, titleOverride }: PortfolioGalleryPageProps = {}) {
  const { isAdmin, bumpAssetsVersion } = useAdmin();
  const galleryId = useMemo(() => {
    if (galleryIdOverride) return galleryIdOverride;
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    return String(u.searchParams.get('g') || '').trim();
  }, [galleryIdOverride]);

  const meta = useMemo(() => (galleryId ? findGalleryMeta(galleryId) : null), [galleryId]);
  const title = titleOverride || meta?.label || 'Portfolyo';
  const kind: GalleryKind = meta?.kind || 'mixed';
  const layout: GalleryLayout = meta?.layout || 'masonry';

  const listKey = useMemo(() => `${GALLERY_LIST_PREFIX}.${galleryId}.items`, [galleryId]);
  const [items, setItems] = useState<GalleryMediaItem[]>([]);

  useEffect(() => {
    if (!galleryId) return;
    try {
      const stored = readJsonAsset<unknown>(listKey);
      if (Array.isArray(stored)) {
        const next = (stored as any[])
          .filter((x) => x && typeof x === 'object')
          .map((x) => ({
            id: String((x as any).id || '').trim() || newId(),
            kind: (String((x as any).kind || 'photo') === 'video' ? 'video' : 'photo') as 'photo' | 'video',
            assetKey:
              String((x as any).assetKey || '').trim() ||
              `${GALLERY_LIST_PREFIX}.${galleryId}.media.${String((x as any).id || '').trim() || newId()}`,
          }));
        setItems(next);
        return;
      }
    } catch {
      // ignore
    }
    setItems([]);
  }, [galleryId, listKey]);

  const persist = (next: GalleryMediaItem[]) => {
    writeJsonAsset(listKey, next.map((x) => ({ id: x.id, kind: x.kind, assetKey: x.assetKey })));
    bumpAssetsVersion();
  };

  const removeMediaItem = (id: string) => {
    const cur = items.find((x) => x.id === id);
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    persist(next);
    if (cur?.assetKey) clearAsset(cur.assetKey);
  };

  const videos = useMemo(() => items.filter((x) => x.kind === 'video'), [items]);
  const photos = useMemo(() => items.filter((x) => x.kind === 'photo'), [items]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const displayed = useMemo(() => (kind === 'video' ? videos : kind === 'photo' ? photos : photos), [kind, photos, videos]);
  const [filmIndex, setFilmIndex] = useState(0);
  const lightboxItem = displayed[lightboxIndex] || null;
  const lightboxSrc = useMemo(() => (lightboxItem ? readAsset(lightboxItem.assetKey) || GALLERY_PLACEHOLDER_IMAGE : ''), [lightboxItem]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (displayed.length ? (i + 1) % displayed.length : 0));
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (displayed.length ? (i - 1 + displayed.length) % displayed.length : 0));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [displayed.length, lightboxOpen]);

  useEffect(() => {
    if (filmIndex > displayed.length - 1) setFilmIndex(0);
  }, [displayed.length, filmIndex]);

  if (!galleryId) {
    return (
      <main className="min-h-screen px-6 py-10">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-[#051A24]/70 hover:text-[#051A24]">
          <ChevronLeft className="h-4 w-4" />
          Anasayfa
        </a>
        <div className="mt-6 rounded-2xl border border-black/10 p-6">
          <div className="text-lg font-semibold text-[#051A24]">Portfolyo</div>
          <div className="text-sm text-[#051A24]/70 mt-2">Bu sayfayı açmak için bir galeri seçmelisin.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10">
      {lightboxOpen && lightboxItem ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4" onClick={() => setLightboxOpen(false)}>
          <div className="absolute inset-0 bg-black/75" />
          <div className="relative w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white/70 text-xs">
                {lightboxIndex + 1} / {displayed.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-white/10 text-white px-3 py-1.5 text-xs border border-white/15 hover:bg-white/15 active:scale-95 transition"
                  onClick={() => setLightboxIndex((i) => (displayed.length ? (i - 1 + displayed.length) % displayed.length : 0))}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="rounded-full bg-white/10 text-white px-3 py-1.5 text-xs border border-white/15 hover:bg-white/15 active:scale-95 transition"
                  onClick={() => setLightboxIndex((i) => (displayed.length ? (i + 1) % displayed.length : 0))}
                >
                  →
                </button>
                <button
                  type="button"
                  className="rounded-full bg-white/10 text-white px-3 py-1.5 text-xs border border-white/15 hover:bg-white/15 active:scale-95 transition"
                  onClick={() => setLightboxOpen(false)}
                >
                  Kapat
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center">
              {String(lightboxSrc).match(/\.(mp4|webm|ogg)(\?.*)?$/i) || String(lightboxSrc).startsWith('data:video') ? (
                <video
                  src={lightboxSrc}
                  className="max-w-[90vw] max-h-[85vh] w-auto h-auto rounded-2xl shadow-2xl"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                />
              ) : (
                <img src={lightboxSrc} alt="" className="max-w-[90vw] max-h-[85vh] w-auto h-auto rounded-2xl shadow-2xl" />
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-sm text-[#051A24]/70 hover:text-[#051A24]">
              <ChevronLeft className="h-4 w-4" />
              Anasayfa
            </a>
            <div className="mt-4 text-[34px] md:text-[44px] leading-[1.1] font-semibold text-[#0D212C] tracking-tight">
              {title}
            </div>
            <div className="text-sm text-[#0D212C]/70 mt-2">
              {kind === 'photo' ? 'Fotoğraf albümü' : kind === 'video' ? 'Video albümü' : 'Fotoğraf + video'}
            </div>
          </div>

          {isAdmin ? (
            <div className="flex flex-wrap gap-2 justify-end">
              {(kind === 'photo' || kind === 'mixed') ? (
                <button
                  type="button"
                  className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                  onClick={() => {
                    const id = newId();
                    const next: GalleryMediaItem[] = [
                      ...items,
                      { id, kind: 'photo', assetKey: `${GALLERY_LIST_PREFIX}.${galleryId}.media.${id}` },
                    ];
                    setItems(next);
                    persist(next);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Foto ekle
                </button>
              ) : null}

              {(kind === 'video' || kind === 'mixed') ? (
                <button
                  type="button"
                  className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                  onClick={() => {
                    const url = window.prompt('Video URL gir (mp4/webm önerilir):', 'https://');
                    if (!url || !url.trim()) return;
                    const id = newId();
                    const assetKey = `${GALLERY_LIST_PREFIX}.${galleryId}.media.${id}`;
                    const next: GalleryMediaItem[] = [
                      ...items,
                      { id, kind: 'video', assetKey },
                    ];
                    setItems(next);
                    persist(next);
                    writeAsset(assetKey, url.trim());
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Video ekle
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {kind === 'mixed' && videos.length ? (
          <section className="w-full mt-10 overflow-hidden">
            <div className="flex animate-marquee">
              {(videos.length >= 4 ? [...videos, ...videos] : videos).map((m, i) => (
                <div key={`${m.id}-${i}`} className="flex-shrink-0 mx-3">
                  <div className="relative">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="absolute top-3 right-[92px] z-10 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 text-xs border border-black/10 hover:bg-white active:scale-95 transition inline-flex items-center gap-2"
                        onClick={() => removeMediaItem(m.id)}
                        title="Sil"
                        aria-label="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                        Sil
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="block"
                      onClick={() => {
                        const idx = displayed.findIndex((x) => x.id === m.id);
                        if (idx >= 0) setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      aria-label="Medyayı büyüt"
                      title="Büyüt"
                    >
                      <EditableAsset
                        assetKey={m.assetKey}
                        defaultValue={GALLERY_PLACEHOLDER_IMAGE}
                        alt="Video"
                        kind="auto"
                        className="h-[220px] md:h-[360px] w-auto rounded-2xl shadow-lg object-cover"
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {kind === 'mixed' ? (
          <section className="mt-10 rounded-2xl border border-black/10 bg-white p-6 md:p-8">
            <div className="text-2xl md:text-3xl font-semibold text-[#0D212C] tracking-tight">
              <EditableText assetKey={`${GALLERY_LIST_PREFIX}.${galleryId}.blocks.0.title`} defaultValue="Öne çıkanlar" as="span" />
            </div>
            <div className="mt-3 text-sm md:text-base text-[#0D212C]/80 leading-relaxed">
              <EditableText
                assetKey={`${GALLERY_LIST_PREFIX}.${galleryId}.blocks.0.body`}
                defaultValue="Bu bölümde videolar ve fotoğraflar birlikte akıyor. Admin modda metni düzenleyip portfolyoyu hikayeleştirebilirsin."
                as="span"
                multiline
              />
            </div>
          </section>
        ) : null}

        <div className="mt-10">
          {displayed.length ? (
            kind === 'video' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayed.map((m, idx) => (
                  <div key={m.id} className="rounded-2xl border border-black/10 p-4 bg-white">
                    {isAdmin ? (
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-medium text-[#051A24]/70">Video</div>
                        <button
                          type="button"
                          className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                          onClick={() => removeMediaItem(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Sil
                        </button>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      aria-label="Medyayı büyüt"
                      title="Büyüt"
                    >
                      <EditableAsset
                        assetKey={m.assetKey}
                        defaultValue={GALLERY_PLACEHOLDER_IMAGE}
                        alt="Video"
                        kind="auto"
                        className="w-full h-auto rounded-xl object-cover shadow-sm"
                        onDelete={isAdmin ? () => removeMediaItem(m.id) : undefined}
                        deleteLabel="Medya sil"
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : layout === 'film' ? (
              <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
                <div className="p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[#0D212C]/70">Film strip</div>
                    {isAdmin && displayed[filmIndex] ? (
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                        onClick={() => removeMediaItem(displayed[filmIndex].id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Sil
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="mt-4 block w-full"
                    onClick={() => {
                      setLightboxIndex(filmIndex);
                      setLightboxOpen(true);
                    }}
                    aria-label="Medyayı büyüt"
                    title="Büyüt"
                  >
                    <EditableAsset
                      assetKey={displayed[filmIndex]?.assetKey || `${GALLERY_LIST_PREFIX}.${galleryId}.media.__empty`}
                      defaultValue={GALLERY_PLACEHOLDER_IMAGE}
                      alt="Fotoğraf"
                      kind="image"
                      className="w-full max-h-[70vh] object-contain rounded-2xl"
                      onDelete={isAdmin && displayed[filmIndex] ? () => removeMediaItem(displayed[filmIndex].id) : undefined}
                      deleteLabel="Medya sil"
                    />
                  </button>
                </div>

                <div className="border-t border-black/10 p-3 overflow-x-auto">
                  <div className="flex gap-2">
                    {displayed.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`relative flex-shrink-0 rounded-xl overflow-hidden border ${
                          idx === filmIndex ? 'border-black/40' : 'border-black/10'
                        }`}
                        onClick={() => setFilmIndex(idx)}
                        aria-label={`Seç: ${idx + 1}`}
                      >
                        <EditableAsset
                          assetKey={m.assetKey}
                          defaultValue={GALLERY_PLACEHOLDER_IMAGE}
                          alt="Thumbnail"
                          kind="image"
                          className="h-16 w-24 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : layout === 'edge' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[2px] bg-black/10 rounded-2xl overflow-hidden">
                {displayed.map((m, idx) => (
                  <div key={m.id} className="relative bg-white">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="absolute top-2 right-2 z-10 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 text-xs border border-black/10 hover:bg-white active:scale-95 transition inline-flex items-center gap-2"
                        onClick={() => removeMediaItem(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Sil
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      aria-label="Medyayı büyüt"
                      title="Büyüt"
                    >
                      <EditableAsset
                        assetKey={m.assetKey}
                        defaultValue={GALLERY_PLACEHOLDER_IMAGE}
                        alt="Fotoğraf"
                        kind="image"
                        className="w-full aspect-square object-cover"
                        onDelete={isAdmin ? () => removeMediaItem(m.id) : undefined}
                        deleteLabel="Medya sil"
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              // masonry default
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
                {displayed.map((m, idx) => (
                  <div key={m.id} className="mb-4 break-inside-avoid relative">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="absolute top-2 right-2 z-10 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 text-xs border border-black/10 hover:bg-white active:scale-95 transition inline-flex items-center gap-2"
                        onClick={() => removeMediaItem(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Sil
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      aria-label="Medyayı büyüt"
                      title="Büyüt"
                    >
                      <EditableAsset
                        assetKey={m.assetKey}
                        defaultValue={GALLERY_PLACEHOLDER_IMAGE}
                        alt="Fotoğraf"
                        kind="image"
                        className="w-full h-auto rounded-2xl object-cover shadow-sm"
                        onDelete={isAdmin ? () => removeMediaItem(m.id) : undefined}
                        deleteLabel="Medya sil"
                      />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-black/10 p-6 text-sm text-[#051A24]/70 bg-white">
              Henüz medya yok.
            </div>
          )}
        </div>

        {kind === 'mixed' ? (
          <section className="mt-10 rounded-2xl border border-black/10 bg-white p-6 md:p-8">
            <div className="text-2xl md:text-3xl font-semibold text-[#0D212C] tracking-tight">
              <EditableText assetKey={`${GALLERY_LIST_PREFIX}.${galleryId}.blocks.1.title`} defaultValue="Detaylar" as="span" />
            </div>
            <div className="mt-3 text-sm md:text-base text-[#0D212C]/80 leading-relaxed">
              <EditableText
                assetKey={`${GALLERY_LIST_PREFIX}.${galleryId}.blocks.1.body`}
                defaultValue="İstersen burada çekim süreci, ekip, mekan, teslimat gibi bilgileri yazıp portfolyoyu daha premium hale getirebilirsin."
                as="span"
                multiline
              />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
