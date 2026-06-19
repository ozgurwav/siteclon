import { cn } from '../lib/utils';
import { EditableText } from '../admin/EditableText';
import { isValidLegalSlug } from '../lib/footerLinks';

const DEFAULT_TITLE: Record<string, string> = {
  'mesafeli-satis': 'Mesafeli satış sözleşmesi',
  gizlilik: 'Gizlilik politikası',
  kvkk: 'KVKK aydınlatma metni',
  kullanim: 'Kullanım koşulları',
};

const DEFAULT_BODY = `Bu sayfadaki metni yönetici olarak düzenleyebilirsiniz (sayfada tıklayıp düzenle).

Yasal metinlerinizi buraya ekleyin.`;

type Props = { slug: string };

export function LegalDocumentPage({ slug }: Props) {
  const ok = isValidLegalSlug(slug);
  const titleKey = `legal.${slug}.title`;
  const bodyKey = `legal.${slug}.body`;
  const defaultTitle = DEFAULT_TITLE[slug] || 'Yasal metin';

  if (!ok) {
    return (
      <main className="min-h-screen bg-[#F4F5F6] text-[#051A24] antialiased px-5 py-12">
        <div className="max-w-xl mx-auto rounded-2xl border border-black/10 bg-white shadow-sm p-6">
          <h1 className="font-serif font-semibold text-xl tracking-tight">Geçersiz bağlantı</h1>
          <p className="mt-3 text-sm text-[#051A24]/70">Bu belge adresi tanınmıyor.</p>
          <a href="/" className="mt-5 inline-block text-sm font-medium text-[#051A24] underline underline-offset-2">
            Ana sayfaya dön
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className={cn('min-h-screen bg-[#F4F5F6] text-[#051A24] antialiased')}>
      <div className="max-w-2xl mx-auto px-5 py-10 md:py-14">
        <a
          href="/"
          className="text-xs font-medium text-[#051A24]/55 hover:text-[#051A24] underline underline-offset-2 mb-2 inline-block"
        >
          ← Ana sayfa
        </a>
        <p className="text-[11px] text-[#051A24]/50 mb-6">
          Yöneticiysen başlık ve metne tıklayarak buradan düzenleyebilirsin.
        </p>
        <article className="rounded-2xl border border-black/10 bg-white shadow-sm p-6 md:p-8">
          <h1 className="font-serif font-semibold text-2xl md:text-3xl tracking-tight text-[#051A24]">
            <EditableText assetKey={titleKey} defaultValue={defaultTitle} as="span" />
          </h1>
          <div
            className={cn(
              'mt-6 text-sm md:text-base text-[#051A24]/85 leading-relaxed whitespace-pre-wrap',
              'font-sans',
            )}
          >
            <EditableText assetKey={bodyKey} defaultValue={DEFAULT_BODY} as="div" multiline />
          </div>
        </article>
      </div>
    </main>
  );
}
