import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Quote, Plus } from 'lucide-react';
import { useInViewAnimation } from '../hooks/useInViewAnimation';
import { cn } from '../lib/utils';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { useAdmin } from '../admin/AdminContext';
import { clearAsset, fileToDataUrl, readJsonAsset, useEditableAsset, writeAsset, writeJsonAsset } from '../admin/assets';
import { PRODUCT_DETAIL_MEDIA_URLS } from '../lib/defaultSiteMedia';

type Person = {
  id: string;
  keyBase: string;
  imageDefault: string;
};

const PEOPLE_LIST_KEY = 'peopleCarousel.items';

export function TestimonialSection() {
  const { ref, isInView } = useInViewAnimation();
  const { isAdmin, bumpAssetsVersion } = useAdmin();
  const [offset, setOffset] = useState(0);
  const [index, setIndex] = useState(0);
  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null);
  const [adminPinnedSide, setAdminPinnedSide] = useState<'left' | 'right' | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const indexBeforeAdd = useRef(0);
  const [newName, setNewName] = useState('');
  const [newTitlePrefix, setNewTitlePrefix] = useState('I left ');
  const [newTitleItalic, setNewTitleItalic] = useState('dokuma');
  const [newTitleSuffix, setNewTitleSuffix] = useState(' to build the studio I always wanted to work with');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY;
      const val = scrolled * 0.1;
      setOffset(Math.min(val, 200));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const people = useMemo<Person[]>(() => {
    const stored = readJsonAsset<Person[]>(PEOPLE_LIST_KEY);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    return [
      {
        id: 'demo-person-1',
        keyBase: 'people.demo-person-1',
        imageDefault: PRODUCT_DETAIL_MEDIA_URLS[0],
      },
      {
        id: 'demo-person-2',
        keyBase: 'people.demo-person-2',
        imageDefault: PRODUCT_DETAIL_MEDIA_URLS[1],
      },
      {
        id: 'demo-person-3',
        keyBase: 'people.demo-person-3',
        imageDefault: PRODUCT_DETAIL_MEDIA_URLS[2],
      },
    ];
  }, []);

  // Keep detail media sizing consistent with the original layout (max-w-xs).
  const CARD_W = 320;
  const GAP = 56;
  const VIEW_W = CARD_W * 2 + GAP;

  useEffect(() => {
    if (index > people.length - 1) setIndex(Math.max(0, people.length - 1));
  }, [index, people.length]);

  const deletePerson = (p: Person) => {
    if (p.id === 'legacy-v1') return;
    const keys = [
      `${p.keyBase}.portrait`,
      `${p.keyBase}.author`,
      `${p.keyBase}.title.prefix`,
      `${p.keyBase}.title.italic`,
      `${p.keyBase}.title.suffix`,
      `${p.keyBase}.label`,
      `${p.keyBase}.motivation`,
      `${p.keyBase}.extra`,
      `${p.keyBase}.bio`,
    ];
    keys.forEach((k) => clearAsset(k));

    const next = people.filter((x) => x.id !== p.id);
    writeJsonAsset(PEOPLE_LIST_KEY, next);
    bumpAssetsVersion();
    setHoverSide(null);
    setAdminPinnedSide(null);
    setIndex(0);
  };

  const safeIndex = people.length > 0 ? ((index % people.length) + people.length) % people.length : 0;
  const leftPerson = people[Math.min(safeIndex, people.length - 1)];
  const hasRight = people.length > 1;
  const rightPerson = hasRight ? people[(safeIndex + 1) % people.length] : null;
  const intentSide = isAdmin ? adminPinnedSide ?? hoverSide : hoverSide;
  const activeSide = intentSide;
  const selected = activeSide === 'right' && rightPerson ? rightPerson : leftPerson;
  const displayPerson = selected ?? leftPerson;
  // Keep the section headline static (not tied to the selected person).
  const titlePrefixKey = `testimonialSectionStatic.title.prefix`;
  const titleItalicKey = `testimonialSectionStatic.title.italic`;
  const titleSuffixKey = `testimonialSectionStatic.title.suffix`;
  const authorKey = `testimonialSectionStatic.author`;
  const { value: titlePrefixLive } = useEditableAsset(titlePrefixKey, 'Anılarınız ');
  const { value: titleItalicLive } = useEditableAsset(titleItalicKey, 'bizimle ');
  const { value: titleSuffixLive } = useEditableAsset(titleSuffixKey, 'ölümsüzleşir.');
  const prefixWantsGap = /[\s\u00A0]$/.test(titlePrefixLive || '');
  // Leading whitespace inside an inline element often collapses away visually; render an explicit gap.
  const titleWantsGap = /[\s\u00A0]$/.test(titleItalicLive || '') || /^[\s\u00A0]/.test(titleSuffixLive || '');

  return (
    <section className="py-12 px-6 max-w-4xl mx-auto flex flex-col items-center text-center" ref={ref}>
      <Quote
        className={cn(
          "w-6 h-6 text-slate-900 mb-8 transition-all duration-700",
          isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}
      />

      <h2
        className={cn(
          // Different font metrics (italic vs roman) can visually collide.
          "text-[32px] md:text-[40px] lg:text-[44px] leading-[1.2] font-serif text-[#0D212C] tracking-tight mb-8 transition-all duration-700 delay-200",
          isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}
      >
        {/* Keep "I left" vs "I left " distinct (edge spaces matter). */}
        <EditableText assetKey={titlePrefixKey} defaultValue="Anılarınız " as="span" preserveEdgeSpaces />
        {prefixWantsGap ? <span aria-hidden className="inline-block w-[0.22em]" /> : null}
        <span className="font-serif italic align-baseline">
          <EditableText assetKey={titleItalicKey} defaultValue="bizimle " as="span" preserveEdgeSpaces />
        </span>
        {titleWantsGap ? <span aria-hidden className="inline-block w-[0.22em]" /> : null}
        <EditableText
          assetKey={titleSuffixKey}
          defaultValue="ölümsüzleşir."
          as="span"
        />
      </h2>

      <p
        className={cn(
          "italic text-sm text-[#273C46] mb-12 transition-all duration-700 delay-300",
          isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}
      >
        <EditableText assetKey={authorKey} defaultValue="Ezgi Halı Perde" as="span" />
      </p>

      <div
        className={cn(
          "flex gap-8 items-center mb-10 transition-all duration-700 delay-400",
          isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}
      >
        <span className="text-2xl font-medium text-slate-900 w-[80px]">
          <EditableText assetKey="testimonialSection.badge1" defaultValue="Düğün" as="span" />
        </span>
        <span className="text-2xl font-medium text-slate-900 w-[83px]">
          <EditableText assetKey="testimonialSection.badge2" defaultValue="Portre" as="span" />
        </span>
        <span className="text-2xl font-medium text-slate-900 w-[110px]">
          <EditableText assetKey="testimonialSection.badge3" defaultValue="Dokuma" as="span" />
        </span>
      </div>

      <div
        className={cn(
          "w-full transition-all duration-1000 delay-500",
          isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-[#051A24]/60">{people.length} kişi</div>
          {isAdmin ? <div className="text-xs text-[#051A24]/50">İpucu: Shift+Tık = paneli pinle</div> : null}
          {isAdmin ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  indexBeforeAdd.current = index;
                  setAddOpen(true);
                }}
                className="w-10 h-10 rounded-full border border-[#0D212C]/20 flex items-center justify-center hover:bg-[#0D212C]/5 transition-colors"
                aria-label="Add person"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          ) : null}
        </div>

        {/* Product detail carousel: same feel as testimonial cards */}
        {people.length <= 1 ? (
          <div className="flex justify-center">
            <div className="w-full max-w-xs">
              {/* Parallax transform can get clipped by carousel overflow during re-render.
                  Keep detail images stable to avoid top cropping. */}
              <div className="transition-transform duration-300">
                <EditableAsset
                  assetKey={`${leftPerson.keyBase}.portrait`}
                  defaultValue={leftPerson.imageDefault}
                  alt="Ürün detayı"
                  className="w-full h-auto rounded-2xl shadow-lg"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            {people.length > 2 ? (
              <>
                <button
                  type="button"
                  className="hidden md:flex absolute -left-14 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-[#0D212C]/20 items-center justify-center hover:bg-[#0D212C]/5 transition-colors z-10"
                  aria-label="Previous people"
                  onClick={() => {
                    setHoverSide(null);
                    setAdminPinnedSide(null);
                    setIndex((i) => (i - 1 + people.length) % people.length);
                  }}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  className="hidden md:flex absolute -right-14 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-[#0D212C]/20 items-center justify-center hover:bg-[#0D212C]/5 transition-colors z-10"
                  aria-label="Next people"
                  onClick={() => {
                    setHoverSide(null);
                    setAdminPinnedSide(null);
                    setIndex((i) => (i + 1) % people.length);
                  }}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            ) : null}

            <div className="overflow-hidden mx-auto" style={{ maxWidth: VIEW_W }}>
              <div
                className="flex gap-14 transition-transform duration-800 cubic-bezier(0.4, 0, 0.2, 1)"
                style={{ transform: `translateX(-${safeIndex * (CARD_W + GAP)}px)` }}
              >
                {people.map((p, i) => {
                  const isLeftVisible = i === safeIndex;
                  const isRightVisible = i === (safeIndex + 1) % people.length;
                  const visible = isLeftVisible || isRightVisible;
                  const side: 'left' | 'right' | null = isLeftVisible ? 'left' : isRightVisible ? 'right' : null;
                  const shouldShowPanel = activeSide && side && side !== activeSide;

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex-none transition-all duration-500",
                        visible ? "opacity-100 scale-100" : "opacity-30 scale-[0.96]"
                      )}
                      style={{ width: CARD_W }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className="block w-full text-left cursor-pointer"
                        aria-label={`Ürün detayı seç ${i + 1}`}
                        onMouseEnter={() => {
                          if (!side) return;
                          setHoverSide(side);
                        }}
                        onMouseLeave={() => {
                          setHoverSide(null);
                        }}
                        onClick={(e) => {
                          if (!side) return;
                          // Admin: Shift+Click keeps the old "pin" behavior.
                          if (isAdmin && (e as any).shiftKey) {
                            setAdminPinnedSide((s) => (s === side ? null : side));
                            return;
                          }
                          // Everyone: normal click opens editorial profile.
                          try {
                            if (typeof window !== 'undefined' && window.location.pathname === '/') {
                              window.sessionStorage.setItem('aiag.homeScrollY', String(window.scrollY || 0));
                            }
                          } catch {}
                          window.location.href = `/person?pid=${encodeURIComponent(p.id)}`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (!side) return;
                            // Keyboard: open profile. (Admin pin via keyboard isn't critical.)
                            try {
                              if (typeof window !== 'undefined' && window.location.pathname === '/') {
                                window.sessionStorage.setItem('aiag.homeScrollY', String(window.scrollY || 0));
                              }
                            } catch {}
                            window.location.href = `/person?pid=${encodeURIComponent(p.id)}`;
                          }
                        }}
                      >
                        <div className="transition-transform duration-300">
                          <div className="relative">
                            <EditableAsset
                              assetKey={`${p.keyBase}.portrait`}
                              defaultValue={p.imageDefault}
                              alt="Ürün detayı"
                              className={cn(
                                "w-full h-auto rounded-2xl shadow-lg",
                                activeSide && side
                                  ? side === activeSide
                                    ? ""
                                    : "grayscale opacity-80"
                                  : ""
                              )}
                              onDelete={isAdmin && p.id !== 'legacy-v1' ? () => deletePerson(p) : undefined}
                              deleteLabel="Kişiyi sil"
                            />

                            {shouldShowPanel ? (
                              <div
                                className="absolute inset-0 rounded-2xl bg-white shadow-lg border border-black/10 p-5 flex flex-col justify-start pointer-events-auto"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isAdmin && adminPinnedSide ? (
                                  <button
                                    type="button"
                                    className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full border border-black/10 bg-white hover:bg-black/[0.02] flex items-center justify-center"
                                    aria-label="Close panel"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setAdminPinnedSide(null);
                                      setHoverSide(null);
                                    }}
                                  >
                                    ✕
                                  </button>
                                ) : null}

                                <div className="text-xs text-[#051A24]/60 mb-1">
                                  <EditableText assetKey={`${displayPerson.keyBase}.label`} defaultValue="Kurucu" as="span" />
                                </div>
                                <div className="text-base font-semibold text-[#051A24]">
                                  <EditableText assetKey={`${displayPerson.keyBase}.author`} defaultValue="Ezgi Halı Perde Ekibi" as="span" />
                                </div>
                                <div className="text-sm text-[#051A24]/70 mt-3 leading-relaxed">
                                  <EditableText assetKey={`${displayPerson.keyBase}.extra`} defaultValue="Bu alana ek metin yazabilirsiniz." as="span" multiline />
                                </div>
                                <div className="text-sm text-[#051A24]/70 mt-3 leading-relaxed">
                                  <EditableText assetKey={`${displayPerson.keyBase}.motivation`} defaultValue="Motivasyon / kısa söz" as="span" multiline />
                                </div>
                                <div className="text-sm text-[#051A24]/70 mt-2 leading-relaxed">
                                  <EditableText assetKey={`${displayPerson.keyBase}.bio`} defaultValue="Write a short bio / motivation here." as="span" multiline />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* (moved to overlay on left detail image for symmetry) */}
      </div>

      {addOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddOpen(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Yeni kişi ekle</div>
                <div className="text-xs text-[#051A24]/70 mt-1">Başlık + isim + büyük görsel</div>
              </div>
              <button type="button" className="text-[#051A24]/60 hover:text-[#051A24] px-2" onClick={() => setAddOpen(false)}>
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="İsim Soyisim"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  value={newTitlePrefix}
                  onChange={(e) => setNewTitlePrefix(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Başlık (prefix)"
                />
                <input
                  value={newTitleItalic}
                  onChange={(e) => setNewTitleItalic(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Italic kelime"
                />
                <input
                  value={newTitleSuffix}
                  onChange={(e) => setNewTitleSuffix(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Başlık (suffix)"
                />
              </div>

              <input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Görsel URL (opsiyonel)"
              />

              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewImageFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                onClick={async () => {
                  const id = `p_${Date.now().toString(36)}`;
                  const keyBase = `people.${id}`;

                  writeAsset(`${keyBase}.author`, newName.trim() || 'New Person');
                  writeAsset(`${keyBase}.title.prefix`, newTitlePrefix);
                  writeAsset(`${keyBase}.title.italic`, newTitleItalic);
                  writeAsset(`${keyBase}.title.suffix`, newTitleSuffix);
                  writeAsset(`${keyBase}.bio`, 'Write a short bio / motivation here.');
                  writeAsset(`${keyBase}.label`, 'Kurucu');
                  writeAsset(`${keyBase}.motivation`, 'Motivasyon / kısa söz');
                  writeAsset(`${keyBase}.extra`, 'Bu alana ek metin yazabilirsiniz.');

                  let img = newImageUrl.trim();
                  if (!img && newImageFile) img = await fileToDataUrl(newImageFile);
                  if (img) writeAsset(`${keyBase}.portrait`, img);

                  const next: Person[] = [...people, { id, keyBase, imageDefault: img || leftPerson.imageDefault }];
                  writeJsonAsset(PEOPLE_LIST_KEY, next);
                  bumpAssetsVersion();

                  setAddOpen(false);
                  setNewName('');
                  setNewImageUrl('');
                  setNewImageFile(null);
                  setIndex(indexBeforeAdd.current);
                  setHoverSide(null);
                  setAdminPinnedSide(null);
                }}
              >
                Ekle
              </button>
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => setAddOpen(false)}
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
