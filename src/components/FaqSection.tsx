import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useAdmin } from '../admin/AdminContext';
import { readJsonAsset, writeJsonAsset } from '../admin/assets';
import { EditableText } from '../admin/EditableText';
import { cn } from '../lib/utils';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

const FAQ_KEY = 'site.faq.items.v1';

const DEFAULT_FAQS: FaqItem[] = [
  {
    id: 'shoot-duration',
    question: 'Çekim ne kadar sürüyor?',
    answer: 'Seçilen pakete göre değişir. Kısa çekimler genelde 1 saat, detaylı dış çekimler 2-3 saat sürer.',
  },
  {
    id: 'delivery-time',
    question: 'Fotoğraflar ne zaman teslim edilir?',
    answer: 'Seçki ve düzenleme yoğunluğuna göre teslim tarihi netleşir. Ortalama teslim süresi çekimden sonra paylaşılır.',
  },
  {
    id: 'booking',
    question: 'Tarih ayırmak için ne yapmalıyım?',
    answer: 'WhatsApp veya takvim üzerinden bize ulaşabilirsin. Müsaitlik kontrolünden sonra paket ve saat netleştirilir.',
  },
];

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalizeFaqs(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return DEFAULT_FAQS;
  const out = raw
    .map((item) => {
      const x = item as Partial<FaqItem>;
      const id = String(x.id || '').trim() || newId();
      return {
        id,
        question: String(x.question ?? ''),
        answer: String(x.answer ?? ''),
      };
    })
    .filter((x) => x.id);
  return out.length ? out : DEFAULT_FAQS;
}

export function FaqSection() {
  const { isAdmin, assetsVersion, bumpAssetsVersion } = useAdmin();
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    void assetsVersion;
    return normalizeFaqs(readJsonAsset(FAQ_KEY));
  }, [assetsVersion]);

  const saveItems = (next: FaqItem[]) => {
    writeJsonAsset(FAQ_KEY, normalizeFaqs(next));
    bumpAssetsVersion();
  };

  return (
    <section className="w-full py-14 md:py-20 bg-white">
      <div className="max-w-5xl mx-auto px-5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#051A24]/55 font-mono">
              <EditableText assetKey="site.faq.kicker" defaultValue="Sık sorulanlar" as="span" />
            </div>
            <h2 className="mt-2 text-[30px] md:text-[44px] leading-[1.06] font-serif font-semibold tracking-tight text-[#051A24]">
              <EditableText assetKey="site.faq.title" defaultValue="Çekim öncesi aklındaki sorular" as="span" />
            </h2>
            <p className="mt-3 max-w-2xl text-sm md:text-base leading-relaxed text-[#051A24]/70">
              <EditableText
                assetKey="site.faq.subtitle"
                defaultValue="Tarih, paket, teslim ve çekim süreciyle ilgili en çok sorulan cevapları burada topladık."
                as="span"
                multiline
              />
            </p>
          </div>

          {isAdmin ? (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
              onClick={() =>
                saveItems([
                  ...items,
                  {
                    id: newId(),
                    question: 'Yeni soru',
                    answer: 'Cevabı buradan düzenle.',
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Soru ekle
            </button>
          ) : null}
        </div>

        <div className="divide-y divide-black/10 rounded-3xl border border-black/10 bg-white shadow-[0_14px_40px_rgba(5,26,36,0.06)] overflow-hidden">
          {items.map((item, idx) => {
            const isOpen = openId === item.id;
            return (
              <div key={item.id} className="p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-base md:text-lg font-semibold text-[#051A24]">
                        {item.question.trim() || 'Yeni soru'}
                      </span>
                      <ChevronDown
                        className={cn('mt-1 h-5 w-5 shrink-0 text-[#051A24]/55 transition', isOpen ? 'rotate-180' : '')}
                      />
                    </div>
                  </button>

                  {isAdmin ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="rounded-xl border border-black/10 bg-white p-2 hover:bg-black/[0.03] active:scale-95 transition disabled:opacity-40"
                        disabled={idx === 0}
                        onClick={() =>
                          saveItems(
                            items.map((x, i) => {
                              if (i === idx - 1) return items[idx];
                              if (i === idx) return items[idx - 1];
                              return x;
                            }),
                          )
                        }
                        aria-label="Soruyu yukarı taşı"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-black/10 bg-white p-2 hover:bg-black/[0.03] active:scale-95 transition disabled:opacity-40"
                        disabled={idx === items.length - 1}
                        onClick={() =>
                          saveItems(
                            items.map((x, i) => {
                              if (i === idx) return items[idx + 1];
                              if (i === idx + 1) return items[idx];
                              return x;
                            }),
                          )
                        }
                        aria-label="Soruyu aşağı taşı"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 active:scale-95 transition"
                        onClick={() => {
                          if (!window.confirm('Bu soru silinsin mi?')) return;
                          saveItems(items.filter((x) => x.id !== item.id));
                        }}
                        aria-label="Soruyu sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {isOpen || isAdmin ? (
                  <div className="mt-4 text-sm md:text-base leading-relaxed text-[#051A24]/70">
                    {isAdmin ? (
                      <div className="grid gap-3">
                        <input
                          value={item.question}
                          onChange={(e) =>
                            saveItems(items.map((x) => (x.id === item.id ? { ...x, question: e.target.value } : x)))
                          }
                          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                          placeholder="Soru"
                        />
                        <textarea
                          value={item.answer}
                          onChange={(e) =>
                            saveItems(items.map((x) => (x.id === item.id ? { ...x, answer: e.target.value } : x)))
                          }
                          rows={3}
                          className="w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                          placeholder="Cevap"
                        />
                      </div>
                    ) : (
                      <p>{item.answer.trim() || 'Cevabı yakında eklenecek.'}</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
