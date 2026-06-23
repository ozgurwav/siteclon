import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Star, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { useAdmin } from '../admin/AdminContext';
import { readJsonAsset, writeJsonAsset, writeAsset } from '../admin/assets';

const GAP_PX = 24;

type TestimonialItem = {
  id: string;
  name: string;
  role: string;
  content: string;
  avatar: string;
};

const DEFAULT_TESTIMONIALS: TestimonialItem[] = [
  {
    id: 'marcus-anderson',
    name: 'Marcus Anderson',
    role: 'CEO, Data.storage',
    content:
      'With very little guidance team delivered designs that were consistently spot on. The attention to detail is remarkable.',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
  },
  {
    id: 'alex-wu',
    name: 'Alex Wu',
    role: 'Founder, Nexgate',
    content:
      'Salonumuz için seçtiğimiz halı ve perdeler mekana çok daha sıcak, premium bir hava kattı.',
    avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150',
  },
  {
    id: 'james-mitchell',
    name: 'James Mitchell',
    role: 'VP Product, LaunchPad',
    content:
      'Renk ve doku konusunda çok iyi yönlendirdiler; ürünler evde beklediğimizden daha kaliteli durdu.',
    avatar: 'https://images.pexels.com/photos/771742/pexels-photo-771742.jpeg?auto=compress&cs=tinysrgb&w=150',
  },
  {
    id: 'rachel-foster',
    name: 'Rachel Foster',
    role: 'Co-founder, Nexus Labs',
    content: 'The design quality exceeded our expectations. The team moves fast without cutting corners, a rare find.',
    avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150',
  },
  {
    id: 'david-zhang',
    name: 'David Zhang',
    role: 'Head of Design, Paradigm Labs',
    content:
      'Başından sonuna kadar ilgiliydiler. Ölçü, ürün ve teslimat süreci çok net ilerledi.',
    avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150',
  },
];

const TESTIMONIAL_LIST_KEY = 'testimonialCarousel.items';

function newTestimonialId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalizeTestimonials(raw: unknown): TestimonialItem[] {
  if (!Array.isArray(raw)) return DEFAULT_TESTIMONIALS;
  const items = raw
    .map((item) => {
      const x = item as Partial<TestimonialItem>;
      const id = String(x.id || '').trim() || newTestimonialId();
      return {
        id,
        name: String(x.name || 'Yeni yorum').trim() || 'Yeni yorum',
        role: String(x.role || 'Firma / Ünvan').trim() || 'Firma / Ünvan',
        content: String(x.content || 'Yorum metni').trim() || 'Yorum metni',
        avatar:
          String(x.avatar || '').trim() ||
          'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
      };
    })
    .filter((item) => item.id);
  return items.length ? items : DEFAULT_TESTIMONIALS;
}

export function TestimonialCarousel() {
  const { isAdmin, assetsVersion, bumpAssetsVersion } = useAdmin();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [items, setItems] = useState<TestimonialItem[]>(() => normalizeTestimonials(readJsonAsset(TESTIMONIAL_LIST_KEY)));
  const [cardWidth, setCardWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncLock = useRef(false);
  const scrollRaf = useRef<number | null>(null);
  const prevStepRef = useRef(-1);

  const step = cardWidth > 0 ? cardWidth + GAP_PX : 0;

  useEffect(() => {
    setItems(normalizeTestimonials(readJsonAsset(TESTIMONIAL_LIST_KEY)));
  }, [assetsVersion]);

  useEffect(() => {
    setCurrentIndex((prev) => Math.max(0, Math.min(items.length - 1, prev)));
  }, [items.length]);

  const persistItems = useCallback(
    (next: TestimonialItem[]) => {
      const normalized = normalizeTestimonials(next);
      writeJsonAsset(TESTIMONIAL_LIST_KEY, normalized);
      setItems(normalized);
      bumpAssetsVersion();
    },
    [bumpAssetsVersion],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setCardWidth(w > 0 ? Math.min(427.5, w) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollToIndex = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el || step <= 0) return;
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    scrollSyncLock.current = true;
    el.scrollTo({ left: clamped * step, behavior });
    window.setTimeout(() => {
      scrollSyncLock.current = false;
    }, behavior === 'instant' ? 0 : 550);
  }, [items.length, step]);

  useEffect(() => {
    if (step <= 0) return;
    if (prevStepRef.current === step) return;
    prevStepRef.current = step;
    const el = scrollRef.current;
    if (!el) return;
    scrollSyncLock.current = true;
    el.scrollTo({ left: currentIndex * step, behavior: 'instant' });
    scrollSyncLock.current = false;
  }, [step, currentIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || step <= 0) return;
    const target = currentIndex * step;
    if (Math.abs(el.scrollLeft - target) < 12) return;
    scrollToIndex(currentIndex, 'smooth');
  }, [currentIndex, step, scrollToIndex]);

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(next, 3000);
    return () => clearInterval(interval);
  }, [next, isPaused]);

  const onScroll = useCallback(() => {
    if (scrollSyncLock.current || step <= 0) return;
    if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / step);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      setCurrentIndex((p) => (p === clamped ? p : clamped));
    });
  }, [items.length, step]);

  return (
    <section className="py-12 md:py-20 overflow-hidden bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="md:max-w-4xl md:ml-auto flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 gap-6">
          <h2 className="text-[32px] md:text-[40px] lg:text-[44px] font-serif tracking-tight text-[#0D212C]">
            <EditableText assetKey="testimonialCarousel.title" defaultValue="Müşteriler ne söylüyor?" as="span" />
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  const id = newTestimonialId();
                  const next: TestimonialItem = {
                    id,
                    name: 'Yeni müşteri',
                    role: 'Firma / Ünvan',
                    content: 'Yorum metnini buradan düzenle.',
                    avatar:
                      'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
                  };
                  writeAsset(`testimonials.${id}.name`, next.name);
                  writeAsset(`testimonials.${id}.role`, next.role);
                  writeAsset(`testimonials.${id}.content`, next.content);
                  writeAsset(`testimonials.${id}.avatar`, next.avatar);
                  persistItems([...items, next]);
                  window.setTimeout(() => setCurrentIndex(items.length), 0);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#0D212C]/15 bg-white px-4 py-2 text-sm font-medium text-[#0D212C] hover:bg-[#0D212C]/5 transition"
              >
                <Plus className="w-4 h-4" />
                Yorum ekle
              </button>
            ) : null}
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-black" />
              ))}
            </div>
            <span className="text-sm font-medium">Clutch 5/5</span>
          </div>
        </div>

        <div
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => {
            window.setTimeout(() => setIsPaused(false), 2500);
          }}
        >
          <div
            ref={scrollRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Müşteri yorumları"
            onScroll={onScroll}
            className={cn(
              'flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory touch-pan-x',
              'pb-3 -mx-6 px-6 md:mx-0 md:px-0',
              '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {items.map((t, i) => (
              <div
                key={t.id}
                style={cardWidth > 0 ? { width: cardWidth, flex: '0 0 auto' } : { flex: '0 0 100%' }}
                className={cn(
                  'relative',
                  'snap-start bg-white rounded-[32px] md:rounded-[40px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-6 md:pl-10 md:pr-24 py-8 flex flex-col justify-between transition-all duration-500',
                  currentIndex === i
                    ? 'scale-100 opacity-100'
                    : 'max-md:scale-100 max-md:opacity-100 md:scale-95 md:opacity-50',
                )}
              >
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Bu yorumu silmek istiyor musun?')) return;
                      const next = items.filter((item) => item.id !== t.id);
                      persistItems(next.length ? next : DEFAULT_TESTIMONIALS);
                    }}
                    className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition"
                    aria-label="Yorumu sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Sil
                  </button>
                ) : null}
                <div>
                  <svg width="40" height="30" viewBox="0 0 40 30" fill="none" className="mb-6 opacity-20">
                    <path
                      d="M12.5 0L17.5 5L10 15H17.5V30H0V15C0 6.5 6.5 0 12.5 0ZM35 0L40 5L32.5 15H40V30H22.5V15C22.5 6.5 29 0 35 0Z"
                      fill="currentColor"
                    />
                  </svg>
                  <p className="text-base text-[#0D212C] leading-relaxed mb-8">
                    <EditableText assetKey={`testimonials.${t.id}.content`} defaultValue={t.content} as="span" multiline />
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <EditableAsset
                    assetKey={`testimonials.${t.id}.avatar`}
                    defaultValue={t.avatar}
                    alt={t.name}
                    className="w-12 h-12 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-[#0D212C]">
                      <EditableText assetKey={`testimonials.${t.id}.name`} defaultValue={t.name} as="span" />
                    </h4>
                    <p className="text-xs text-[#273C46] flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 shrink-0 translate-y-[0.5px]" />
                      <EditableText assetKey={`testimonials.${t.id}.role`} defaultValue={t.role} as="span" />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 md:absolute md:-bottom-16 md:mt-0 md:left-0 flex gap-4">
            <button
              type="button"
              onClick={prev}
              className="w-12 h-12 rounded-full border border-[#0D212C]/20 flex items-center justify-center hover:bg-[#0D212C]/5 transition-colors"
              aria-label="Önceki yorum"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="w-12 h-12 rounded-full border border-[#0D212C]/20 flex items-center justify-center hover:bg-[#0D212C]/5 transition-colors"
              aria-label="Sonraki yorum"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
