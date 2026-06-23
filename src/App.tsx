import { useEffect, useMemo, useState } from 'react';
import { Edit3, MessageCircle, Plus, ShoppingBag, Trash2, Upload, X } from 'lucide-react';
import { onValue, ref as dbRef, remove, set } from 'firebase/database';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { firebaseStorage, realtimeDb } from './lib/firebase';

type ProductKind = 'hali' | 'perde';
type Page = 'home' | ProductKind | 'iletisim';

type Product = {
  id: string;
  kind: ProductKind;
  name: string;
  price: string;
  image: string;
};

type ContactInfo = {
  phone: string;
  address: string;
  email: string;
};

type HomeStat = {
  value: string;
  label: string;
};

type HomeContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  stats: HomeStat[];
};

const ADMIN_EMAIL = 'admin@ezgihali.com';
const ADMIN_PASSWORD = 'admin123';

const starterProducts: Product[] = [
  { id: 'hali-1', kind: 'hali', name: 'Nirvana El Dokuma Halı', price: '18.900', image: '' },
  { id: 'hali-2', kind: 'hali', name: 'Soho Yün Halı', price: '14.750', image: '' },
  { id: 'perde-1', kind: 'perde', name: 'Lina Blackout Perde', price: '6.450', image: '' },
  { id: 'perde-2', kind: 'perde', name: 'Aura Keten Tül', price: '4.900', image: '' },
];

const starterContact: ContactInfo = {
  phone: '+90 555 000 00 00',
  address: 'İstanbul, Türkiye',
  email: 'info@ezgihaliperde.com',
};

const starterHomeContent: HomeContent = {
  eyebrow: '',
  title: 'Ezgi Halı Perde',
  subtitle: 'Mekana ölçülü, sade ve kalıcı bir dokunuş.',
  description: 'Seçili halı ve perde koleksiyonlarıyla evinize rafine bir bütünlük kazandırıyoruz.',
  stats: [
    { value: '20+', label: 'Yılı aşkın tecrübe' },
    { value: 'Özel', label: 'Ölçü ve ürün danışmanlığı' },
    { value: 'Premium', label: 'Halı, perde ve ev tekstili' },
  ],
};

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');
  const [products, setProducts] = useState<Product[]>(starterProducts);
  const [contact, setContactState] = useState<ContactInfo>(starterContact);
  const [draft, setDraft] = useState({ name: '', price: '', image: '' });
  const [contactDraft, setContactDraft] = useState(contact);
  const [editingContact, setEditingContact] = useState(false);
  const [homeContent, setHomeContent] = useState<HomeContent>(starterHomeContent);
  const [homeDraft, setHomeDraft] = useState<HomeContent>(starterHomeContent);
  const [editingHome, setEditingHome] = useState(false);

  useEffect(() => {
    const sync = () => setPage(pageFromHash());
    window.addEventListener('hashchange', sync);
    if (!window.location.hash) window.history.replaceState({}, '', '#ana-sayfa');
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    const productsRef = dbRef(realtimeDb, 'products');
    const unsub = onValue(productsRef, (snapshot) => {
      const raw = snapshot.val() as Record<string, Product> | null;
      if (!raw) {
        void Promise.all(starterProducts.map((product) => set(dbRef(realtimeDb, `products/${product.id}`), product)));
        setProducts(starterProducts);
        return;
      }
      setProducts(Object.values(raw));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const contactRef = dbRef(realtimeDb, 'settings/contact');
    const unsub = onValue(contactRef, (snapshot) => {
      const raw = snapshot.val() as ContactInfo | null;
      if (!raw) {
        void set(contactRef, starterContact);
        setContactState(starterContact);
        return;
      }
      setContactState(raw);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const homeRef = dbRef(realtimeDb, 'settings/home');
    const unsub = onValue(homeRef, (snapshot) => {
      const raw = snapshot.val() as HomeContent | null;
      if (!raw) {
        void set(homeRef, starterHomeContent);
        setHomeContent(starterHomeContent);
        setHomeDraft(starterHomeContent);
        return;
      }
      const next = normalizeHomeContent(raw);
      setHomeContent(next);
      if (!editingHome) setHomeDraft(next);
    });
    return unsub;
  }, [editingHome]);

  const visibleProducts = useMemo(() => {
    if (page !== 'hali' && page !== 'perde') return [];
    return products.filter((product) => product.kind === page);
  }, [page, products]);

  function navigate(next: Page) {
    const hash = next === 'home' ? '#ana-sayfa' : `#${next}`;
    window.location.hash = hash;
    setPage(next);
  }

  function openAuth(mode: 'login' | 'signup' = 'login') {
    setAuthMode(mode);
    setAuthError('');
    setAuthOpen(true);
  }

  function handleAuthSubmit() {
    if (authMode === 'signup') {
      if (!name.trim() || !email.trim() || !password.trim()) {
        setAuthError('Lütfen tüm alanları doldurun.');
        return;
      }
      setIsAdmin(true);
      setAuthOpen(false);
      return;
    }
    if (email.trim().toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      setAuthError('Demo admin bilgileri: admin@ezgihali.com / admin123');
      return;
    }
    setIsAdmin(true);
    setAuthOpen(false);
  }

  async function handleImage(file: File | null) {
    if (!file) return;
    const imageRef = storageRef(firebaseStorage, `products/${Date.now()}-${file.name}`);
    await uploadBytes(imageRef, file);
    const url = await getDownloadURL(imageRef);
    setDraft((current) => ({ ...current, image: url }));
  }

  function addProduct(kind: ProductKind) {
    if (!draft.name.trim() || !draft.price.trim()) return;
    const id = `${kind}-${Date.now()}`;
    void set(dbRef(realtimeDb, `products/${id}`), {
      id,
      kind,
      name: draft.name.trim(),
      price: onlyDigits(draft.price),
      image: draft.image,
    });
    setDraft({ name: '', price: '', image: '' });
  }

  function removeProduct(id: string) {
    void remove(dbRef(realtimeDb, `products/${id}`));
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white">
      <SiteHeader
        page={page}
        isAdmin={isAdmin}
        onNavigate={navigate}
        onAuth={() => openAuth('login')}
        onLogout={() => setIsAdmin(false)}
      />

      {page === 'home' ? (
        <HomePage
          content={homeContent}
          isAdmin={isAdmin}
          editing={editingHome}
          draft={homeDraft}
          setDraft={setHomeDraft}
          onEdit={() => {
            setHomeDraft(homeContent);
            setEditingHome(true);
          }}
          onSave={() => {
            const next = normalizeHomeContent(homeDraft);
            void set(dbRef(realtimeDb, 'settings/home'), next);
            setHomeContent(next);
            setEditingHome(false);
          }}
          onCancel={() => {
            setHomeDraft(homeContent);
            setEditingHome(false);
          }}
        />
      ) : null}
      {page === 'hali' || page === 'perde' ? (
        <ProductPage
          kind={page}
          products={visibleProducts}
          isAdmin={isAdmin}
          draft={draft}
          setDraft={setDraft}
          onImage={handleImage}
          onAdd={addProduct}
          onRemove={removeProduct}
          contact={contact}
        />
      ) : null}
      {page === 'iletisim' ? (
        <ContactPage
          contact={contact}
          isAdmin={isAdmin}
          editing={editingContact}
          draft={contactDraft}
          setDraft={setContactDraft}
          onEdit={() => {
            setContactDraft(contact);
            setEditingContact(true);
          }}
          onSave={() => {
            void set(dbRef(realtimeDb, 'settings/contact'), {
              ...contactDraft,
              phone: onlyDigits(contactDraft.phone),
            });
            setEditingContact(false);
          }}
          onCancel={() => setEditingContact(false)}
        />
      ) : null}

      {authOpen ? (
        <AuthDialog
          authMode={authMode}
          setAuthMode={setAuthMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          name={name}
          setName={setName}
          error={authError}
          onSubmit={handleAuthSubmit}
          onClose={() => setAuthOpen(false)}
        />
      ) : null}

    </main>
  );
}

function SiteHeader({
  page,
  isAdmin,
  onNavigate,
  onAuth,
  onLogout,
}: {
  page: Page;
  isAdmin: boolean;
  onNavigate: (page: Page) => void;
  onAuth: () => void;
  onLogout: () => void;
}) {
  const nav = [
    { page: 'home' as const, label: 'ANA SAYFA' },
    { page: 'hali' as const, label: 'HALILAR' },
    { page: 'perde' as const, label: 'PERDELER' },
    { page: 'iletisim' as const, label: 'ILETISIM' },
  ];

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.03] bg-black/55 px-6 py-5 backdrop-blur-md lg:px-8">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[auto_1fr_auto] items-center gap-8 max-md:grid-cols-[1fr_auto]">
        <button type="button" className="text-left" onClick={() => onNavigate('home')}>
          <div className="text-[22px] font-semibold uppercase leading-none tracking-[0.18em] md:text-[24px]">
            EZGI HALI PERDE
          </div>
        </button>

        <nav className="hidden items-center justify-center gap-10 lg:flex">
          {nav.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`text-[13px] font-semibold uppercase tracking-[0.15em] transition ${
                page === item.page ? 'text-white' : 'text-white/52 hover:text-white'
              }`}
              onClick={() => onNavigate(item.page)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-none border border-white/18 px-5 py-2 text-[13px] text-white/90 transition hover:border-white/35 hover:text-white"
            onClick={isAdmin ? onLogout : onAuth}
          >
            {isAdmin ? 'Admin çıkış' : 'Giriş yap'}
          </button>
        </div>
      </div>
    </header>
  );
}

function HomePage({
  content,
  isAdmin,
  editing,
  draft,
  setDraft,
  onEdit,
  onSave,
  onCancel,
}: {
  content: HomeContent;
  isAdmin: boolean;
  editing: boolean;
  draft: HomeContent;
  setDraft: React.Dispatch<React.SetStateAction<HomeContent>>;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center px-6 pb-16 pt-32">
      <div className="mx-auto flex w-full max-w-[880px] flex-col items-center text-center">
        {content.eyebrow.trim() ? (
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-white/58">{content.eyebrow}</p>
        ) : null}
        <h1 className="mt-6 text-[48px] font-semibold leading-[0.98] tracking-[0.02em] md:text-[78px]">
          {content.title}
        </h1>
        <p className="mt-7 max-w-[620px] text-[24px] leading-tight text-white md:text-[34px]">{content.subtitle}</p>
        <p className="mt-5 max-w-[540px] text-sm leading-relaxed text-white/62 md:text-base">{content.description}</p>

        <div className="mt-10 grid w-full gap-3 md:grid-cols-3">
          {content.stats.slice(0, 3).map((stat, index) => (
            <div key={`${stat.value}-${index}`} className="border border-white/10 bg-white/[0.035] px-5 py-4 text-left">
              <div className="text-[26px] font-semibold leading-none text-white">{stat.value}</div>
              <div className="mt-3 text-xs uppercase tracking-[0.16em] text-white/48">{stat.label}</div>
            </div>
          ))}
        </div>

        {isAdmin ? (
          <div className="mt-8 w-full border border-white/12 bg-white/[0.035] p-4 text-left">
            {!editing ? (
              <button type="button" className="bg-white px-5 py-2 text-sm font-medium text-black" onClick={onEdit}>
                Ana sayfa metinlerini düzenle
              </button>
            ) : (
              <div className="grid gap-3">
                <TextField label="Üst küçük yazı" value={draft.eyebrow} onChange={(value) => setDraft((c) => ({ ...c, eyebrow: value }))} placeholder="Boş bırakılabilir" />
                <TextField label="Başlık" value={draft.title} onChange={(value) => setDraft((c) => ({ ...c, title: value }))} placeholder="Ezgi Halı Perde" />
                <TextField label="Alt başlık" value={draft.subtitle} onChange={(value) => setDraft((c) => ({ ...c, subtitle: value }))} placeholder="Mekana ölçülü, sade ve kalıcı bir dokunuş." />
                <label className="grid gap-2 text-sm text-white/72">
                  Kısa açıklama
                  <textarea
                    value={draft.description}
                    onChange={(event) => setDraft((c) => ({ ...c, description: event.target.value }))}
                    className="min-h-20 resize-none border border-white/12 bg-white/[0.06] px-3 py-3 text-white outline-none placeholder:text-white/34 focus:border-white/35"
                    placeholder="Kısa açıklama"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  {draft.stats.slice(0, 3).map((stat, index) => (
                    <div key={index} className="grid gap-2 border border-white/10 p-3">
                      <TextField
                        label={`Kutu ${index + 1} başlığı`}
                        value={stat.value}
                        onChange={(value) => setDraft((c) => updateHomeStat(c, index, { value }))}
                        placeholder="20+"
                      />
                      <TextField
                        label={`Kutu ${index + 1} metni`}
                        value={stat.label}
                        onChange={(value) => setDraft((c) => updateHomeStat(c, index, { label: value }))}
                        placeholder="Yılı aşkın tecrübe"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="bg-white px-5 py-2 text-sm font-medium text-black" onClick={onSave}>
                    Kaydet
                  </button>
                  <button type="button" className="border border-white/12 px-5 py-2 text-sm text-white/78" onClick={onCancel}>
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductPage({
  kind,
  products,
  isAdmin,
  draft,
  setDraft,
  onImage,
  onAdd,
  onRemove,
  contact,
}: {
  kind: ProductKind;
  products: Product[];
  isAdmin: boolean;
  draft: { name: string; price: string; image: string };
  setDraft: React.Dispatch<React.SetStateAction<{ name: string; price: string; image: string }>>;
  onImage: (file: File | null) => Promise<void>;
  onAdd: (kind: ProductKind) => void;
  onRemove: (id: string) => void;
  contact: ContactInfo;
}) {
  const title = kind === 'hali' ? 'Halılar' : 'Perdeler';

  return (
    <section className="mx-auto min-h-[100dvh] max-w-[1180px] px-6 pb-20 pt-36 lg:px-8">
      <div className="mb-10 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Ezgi koleksiyon</p>
        <h1 className="font-serif text-[52px] font-semibold leading-none md:text-[72px]">{title}</h1>
        <p className="max-w-2xl text-white/60">
          Ürünleri inceleyip ödeme ve sipariş detayları için WhatsApp üzerinden mağazayla iletişime geçebilirsiniz.
          Düzenleme alanı sadece admin girişinde görünür.
        </p>
      </div>

      {isAdmin ? (
        <div className="mb-8 border border-white/12 bg-white/[0.035] p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/72">
            <Edit3 className="h-4 w-4" />
            Admin ürün düzenleme
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px_1fr_180px_auto]">
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="h-11 border border-white/12 bg-black px-3 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/35"
              placeholder="Ürün adı"
            />
            <input
              value={draft.price}
              onChange={(event) => setDraft((current) => ({ ...current, price: onlyDigits(event.target.value) }))}
              className="h-11 border border-white/12 bg-black px-3 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/35"
              inputMode="numeric"
              placeholder="Fiyat"
            />
            <input
              value={draft.image}
              onChange={(event) => setDraft((current) => ({ ...current, image: event.target.value }))}
              className="h-11 border border-white/12 bg-black px-3 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/35"
              placeholder="Görsel linki"
            />
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 border border-white/12 bg-black px-3 text-sm text-white/78 transition hover:text-white">
              <Upload className="h-4 w-4" />
              Dosya seç
              <input className="hidden" type="file" accept="image/*" onChange={(event) => void onImage(event.target.files?.[0] || null)} />
            </label>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 bg-white px-5 text-sm font-medium text-black transition hover:bg-white/90"
              onClick={() => onAdd(kind)}
            >
              <Plus className="h-4 w-4" />
              Ekle
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <article key={product.id} className="border border-white/10 bg-white/[0.035]">
            <div className="flex aspect-[4/3] items-center justify-center bg-white/[0.04]">
              {product.image ? (
                <img src={product.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <ShoppingBag className="h-10 w-10 text-white/28" />
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{product.name}</h2>
                  <p className="mt-2 text-white/58">₺ {product.price}</p>
                </div>
                {isAdmin ? (
                  <button type="button" className="text-white/42 transition hover:text-white" onClick={() => onRemove(product.id)} aria-label="Ürünü sil">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-white/12 py-2 text-sm text-white/78 transition hover:border-white/35 hover:text-white"
                onClick={() => openWhatsAppForProduct(contact.phone, product)}
              >
                <MessageCircle className="h-4 w-4" />
                Ödeme için WhatsApp'tan iletişime geçin
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContactPage({
  contact,
  isAdmin,
  editing,
  draft,
  setDraft,
  onEdit,
  onSave,
  onCancel,
}: {
  contact: ContactInfo;
  isAdmin: boolean;
  editing: boolean;
  draft: ContactInfo;
  setDraft: React.Dispatch<React.SetStateAction<ContactInfo>>;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="mx-auto min-h-[100dvh] max-w-[980px] px-6 pb-20 pt-36 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">İletişim</p>
      <h1 className="mt-3 font-serif text-[52px] font-semibold leading-none md:text-[72px]">Bize ulaşın</h1>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <InfoBlock label="Telefon" value={contact.phone} />
        <InfoBlock label="E-posta" value={contact.email} />
        <InfoBlock label="Adres" value={contact.address} />
      </div>

      {isAdmin ? (
        <div className="mt-10 border border-white/12 bg-white/[0.035] p-4">
          {!editing ? (
            <button type="button" className="bg-white px-5 py-2 text-sm font-medium text-black" onClick={onEdit}>
              İletişim bilgilerini düzenle
            </button>
          ) : (
            <div className="grid gap-3">
              <input value={draft.phone} onChange={(e) => setDraft((c) => ({ ...c, phone: onlyDigits(e.target.value) }))} className="h-11 border border-white/12 bg-black px-3 text-white outline-none" inputMode="numeric" placeholder="Telefon" />
              <input value={draft.email} onChange={(e) => setDraft((c) => ({ ...c, email: e.target.value }))} className="h-11 border border-white/12 bg-black px-3 text-white outline-none" placeholder="E-posta" />
              <input value={draft.address} onChange={(e) => setDraft((c) => ({ ...c, address: e.target.value }))} className="h-11 border border-white/12 bg-black px-3 text-white outline-none" placeholder="Adres" />
              <div className="flex gap-2">
                <button type="button" className="bg-white px-5 py-2 text-sm font-medium text-black" onClick={onSave}>
                  Kaydet
                </button>
                <button type="button" className="border border-white/12 px-5 py-2 text-sm text-white/78" onClick={onCancel}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-white/42">{label}</div>
      <div className="mt-4 text-lg">{value}</div>
    </div>
  );
}

function AuthDialog({
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  name,
  setName,
  error,
  onSubmit,
  onClose,
}: {
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  name: string;
  setName: (value: string) => void;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <button className="absolute inset-0 bg-black/82 backdrop-blur-md" type="button" onClick={onClose} />
      <div className="relative w-full max-w-[560px] border border-white/12 bg-[#050505] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.65)]">
        <button type="button" className="absolute right-5 top-5 text-white/50 transition hover:text-white" onClick={onClose} aria-label="Kapat">
          <X className="h-5 w-5" />
        </button>
        <div className="mb-7">
          <div className="text-xl font-semibold uppercase tracking-[0.14em]">EZGI HALI PERDE</div>
          <div className="mt-2 text-sm text-white/56">{authMode === 'login' ? 'Yönetim paneline giriş yap.' : 'Yeni yönetici hesabı oluştur.'}</div>
          {authMode === 'login' ? (
            <div className="mt-3 border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/58">
              Demo admin: <span className="text-white">admin@ezgihali.com</span> / <span className="text-white">admin123</span>
            </div>
          ) : null}
        </div>
        <div className="grid gap-4">
          {authMode === 'signup' ? (
            <TextField label="İsim" value={name} onChange={setName} placeholder="Ad Soyad" />
          ) : null}
          <TextField label="E-posta" value={email} onChange={setEmail} placeholder="admin@ezgihali.com" type="email" />
          <TextField label="Şifre" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
        </div>
        {error ? <div className="mt-4 text-sm text-red-300">{error}</div> : null}
        <button type="button" className="mt-6 h-11 w-full bg-white text-sm font-medium text-black transition hover:bg-white/90" onClick={onSubmit}>
          {authMode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
        </button>
        <div className="mt-5 text-center text-sm text-white/58">
          {authMode === 'login' ? (
            <>
              Hesabınız yoksa{' '}
              <button type="button" className="text-white underline underline-offset-4" onClick={() => setAuthMode('signup')}>
                kayıt olun
              </button>
            </>
          ) : (
            <>
              Hesabınız varsa{' '}
              <button type="button" className="text-white underline underline-offset-4" onClick={() => setAuthMode('login')}>
                giriş yapın
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <label className="grid gap-2 text-sm text-white/72">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 border border-white/12 bg-white/[0.06] px-3 text-white outline-none placeholder:text-white/34 focus:border-white/35" placeholder={placeholder} type={type} />
    </label>
  );
}

function pageFromHash(): Page {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
  if (hash === 'hali' || hash === 'halilar') return 'hali';
  if (hash === 'perde' || hash === 'perdeler') return 'perde';
  if (hash === 'iletisim') return 'iletisim';
  return 'home';
}

function normalizeHomeContent(raw: Partial<HomeContent> | null | undefined): HomeContent {
  const statsRaw = Array.isArray(raw?.stats) ? raw?.stats : [];
  const stats = [0, 1, 2].map((index) => ({
    value: String(statsRaw[index]?.value || starterHomeContent.stats[index].value),
    label: String(statsRaw[index]?.label || starterHomeContent.stats[index].label),
  }));
  return {
    eyebrow: String(raw?.eyebrow ?? starterHomeContent.eyebrow),
    title: String(raw?.title || starterHomeContent.title),
    subtitle: String(raw?.subtitle || starterHomeContent.subtitle),
    description: String(raw?.description || starterHomeContent.description),
    stats,
  };
}

function updateHomeStat(content: HomeContent, index: number, patch: Partial<HomeStat>): HomeContent {
  const stats = normalizeHomeContent(content).stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat));
  return { ...content, stats };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function whatsappNumber(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  if (digits.length === 10) digits = `90${digits}`;
  return digits || '905550000000';
}

function openWhatsAppForProduct(phone: string, product: Product) {
  const message = [
    `Merhaba, ${product.name} ürünü hakkında bilgi almak istiyorum.`,
    `Fiyat: ₺ ${product.price}`,
    'Ödeme ve sipariş detayları için yardımcı olur musunuz?',
  ].join('\n');
  window.open(`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
