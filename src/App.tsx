import { useEffect, useMemo, useState } from 'react';
import { Edit3, Minus, Plus, ShoppingBag, Trash2, Upload, X } from 'lucide-react';
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

type CartItem = {
  productId: string;
  name: string;
  price: string;
  image: string;
  quantity: number;
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

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
      price: draft.price.trim(),
      image: draft.image,
    });
    setDraft({ name: '', price: '', image: '' });
  }

  function removeProduct(id: string) {
    void remove(dbRef(realtimeDb, `products/${id}`));
    setCart((current) => current.filter((item) => item.productId !== id));
  }

  function addToCart(product: Product) {
    setCheckoutError('');
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          quantity: 1,
        },
      ];
    });
    setCartOpen(true);
  }

  function updateCartQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function checkoutWithIyzico() {
    if (!cart.length) return;
    setCheckoutBusy(true);
    setCheckoutError('');
    try {
      const res = await fetch('/api/payments/iyzipay/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: {
            name: name || 'Ezgi',
            surname: 'Musteri',
            email: email || 'sandbox@example.com',
            phone: '+905000000000',
            address: contact.address,
          },
          items: cart.map((item) => ({
            id: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error(data?.message || 'Ödeme başlatılamadı.');
      const html = String(data?.iyzicoCheckout?.checkoutFormContent || '').trim();
      if (!html) throw new Error('iyzico ödeme formu boş döndü.');
      const win = window.open('', '_blank', 'width=520,height=760');
      if (!win) throw new Error('Popup engellendi. Tarayıcıda popuplara izin ver.');
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (error: any) {
      setCheckoutError(error?.message || 'Ödeme başlatılamadı.');
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white">
      <SiteHeader
        page={page}
        isAdmin={isAdmin}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        onNavigate={navigate}
        onAuth={() => openAuth('login')}
        onLogout={() => setIsAdmin(false)}
        onCart={() => setCartOpen(true)}
      />

      {page === 'home' ? <HomePage /> : null}
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
          onAddToCart={addToCart}
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
            void set(dbRef(realtimeDb, 'settings/contact'), contactDraft);
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

      {cartOpen ? (
        <CartPanel
          cart={cart}
          busy={checkoutBusy}
          error={checkoutError}
          onClose={() => setCartOpen(false)}
          onQuantity={updateCartQuantity}
          onCheckout={checkoutWithIyzico}
        />
      ) : null}
    </main>
  );
}

function SiteHeader({
  page,
  isAdmin,
  cartCount,
  onNavigate,
  onAuth,
  onLogout,
  onCart,
}: {
  page: Page;
  isAdmin: boolean;
  cartCount: number;
  onNavigate: (page: Page) => void;
  onAuth: () => void;
  onLogout: () => void;
  onCart: () => void;
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
          <div className="mt-2 text-[8px] font-semibold uppercase tracking-[0.38em] text-white/52 md:text-[9px]">
            PREMIUM HALI • PERDE • DOKUMA
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
            className="inline-flex items-center gap-2 rounded-none border border-white/18 px-4 py-2 text-[13px] text-white/90 transition hover:border-white/35 hover:text-white"
            onClick={onCart}
          >
            <ShoppingBag className="h-4 w-4" />
            Sepet {cartCount ? `(${cartCount})` : ''}
          </button>
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

function HomePage() {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center px-6 pt-20">
      <div className="mx-auto flex w-full max-w-[620px] flex-col items-center text-center">
        <h1 className="font-serif text-[48px] font-semibold leading-[1.04] tracking-tight md:text-[68px]">
          Zamana Direnen
          <br />
          Dokuma
        </h1>
        <p className="mt-7 font-mono text-xs uppercase tracking-[0.18em] text-white/76">
          PREMIUM HALI • PERDE • EV TEKSTILI
        </p>
        <div className="mt-5 text-[38px] leading-[1.06] md:text-[54px]">
          Evin ritmini <span className="font-serif italic">dokuyla</span> kur,
          <br />
          mekanı <span className="font-serif italic">sessiz lüksle</span>
          <br />
          tamamla.
        </div>
        <div className="mt-8 flex max-w-[660px] flex-col gap-5 text-[15px] leading-relaxed text-white/82 md:text-base">
          <p>
            Ezgi Halı Perde; seçili iplikler, zamansız desenler ve rafine renk paletleriyle yaşam
            alanlarına sıcaklık ve karakter kazandırır.
          </p>
          <p>
            Halı, perde ve ev tekstili koleksiyonlarımız modern iç mekanlarla uyumlu, uzun ömürlü
            ve dokunulduğunda kalite hissi veren parçalar için tasarlanır.
          </p>
          <p className="font-semibold text-white">Yeni sezon koleksiyonlarını keşfet.</p>
        </div>
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
  onAddToCart,
}: {
  kind: ProductKind;
  products: Product[];
  isAdmin: boolean;
  draft: { name: string; price: string; image: string };
  setDraft: React.Dispatch<React.SetStateAction<{ name: string; price: string; image: string }>>;
  onImage: (file: File | null) => Promise<void>;
  onAdd: (kind: ProductKind) => void;
  onRemove: (id: string) => void;
  onAddToCart: (product: Product) => void;
}) {
  const title = kind === 'hali' ? 'Halılar' : 'Perdeler';

  return (
    <section className="mx-auto min-h-[100dvh] max-w-[1180px] px-6 pb-20 pt-36 lg:px-8">
      <div className="mb-10 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Ezgi koleksiyon</p>
        <h1 className="font-serif text-[52px] font-semibold leading-none md:text-[72px]">{title}</h1>
        <p className="max-w-2xl text-white/60">
          Satışa hazır ürün vitrini. Üye olmayan ziyaretçiler ürünleri görebilir; düzenleme alanı sadece admin girişinde görünür.
        </p>
      </div>

      {isAdmin ? (
        <div className="mb-8 border border-white/12 bg-white/[0.035] p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/72">
            <Edit3 className="h-4 w-4" />
            Admin ürün düzenleme
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px_180px_auto]">
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="h-11 border border-white/12 bg-black px-3 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/35"
              placeholder="Ürün adı"
            />
            <input
              value={draft.price}
              onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
              className="h-11 border border-white/12 bg-black px-3 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/35"
              placeholder="Fiyat"
            />
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 border border-white/12 bg-black px-3 text-sm text-white/78 transition hover:text-white">
              <Upload className="h-4 w-4" />
              Görsel seç
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
                className="mt-4 w-full border border-white/12 py-2 text-sm text-white/78 transition hover:border-white/35 hover:text-white"
                onClick={() => onAddToCart(product)}
              >
                Sepete ekle
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
              <input value={draft.phone} onChange={(e) => setDraft((c) => ({ ...c, phone: e.target.value }))} className="h-11 border border-white/12 bg-black px-3 text-white outline-none" placeholder="Telefon" />
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

function CartPanel({
  cart,
  busy,
  error,
  onClose,
  onQuantity,
  onCheckout,
}: {
  cart: CartItem[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onQuantity: (productId: string, delta: number) => void;
  onCheckout: () => void;
}) {
  const total = cart.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[430px] flex-col border-l border-white/12 bg-[#050505] text-white shadow-[0_28px_90px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between border-b border-white/10 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Sepet</div>
            <h2 className="mt-2 text-2xl font-semibold">Sipariş özeti</h2>
          </div>
          <button type="button" className="text-white/52 transition hover:text-white" onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cart.length ? (
            <div className="grid gap-3">
              {cart.map((item) => (
                <div key={item.productId} className="grid grid-cols-[72px_1fr] gap-3 border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex h-[72px] items-center justify-center bg-white/[0.05]">
                    {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <ShoppingBag className="h-6 w-6 text-white/30" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="mt-1 text-sm text-white/56">₺ {formatTRY(parsePrice(item.price))}</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center border border-white/12">
                        <button type="button" className="p-2 text-white/62 hover:text-white" onClick={() => onQuantity(item.productId, -1)} aria-label="Azalt">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                        <button type="button" className="p-2 text-white/62 hover:text-white" onClick={() => onQuantity(item.productId, 1)} aria-label="Artır">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button type="button" className="text-xs text-white/45 underline underline-offset-4 hover:text-white" onClick={() => onQuantity(item.productId, -item.quantity)}>
                        Çıkar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-white/10 bg-white/[0.035] p-5 text-sm text-white/58">
              Sepet şu an boş. Halılar veya Perdeler sayfasından ürün ekleyebilirsin.
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-5">
          <div className="mb-4 flex items-center justify-between text-sm text-white/62">
            <span>Toplam</span>
            <strong className="text-xl text-white">₺ {formatTRY(total)}</strong>
          </div>
          {error ? <div className="mb-3 text-sm text-red-300">{error}</div> : null}
          <button
            type="button"
            className="h-11 w-full bg-white text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!cart.length || busy}
            onClick={onCheckout}
          >
            {busy ? 'Ödeme başlatılıyor...' : 'iyzico sandbox ile öde'}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-white/40">
            Sandbox için sunucuda IYZIPAY_API_KEY, IYZIPAY_SECRET_KEY ve IYZIPAY_URI değişkenleri gerekir.
          </p>
        </div>
      </aside>
    </div>
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

function parsePrice(value: string): number {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatTRY(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
