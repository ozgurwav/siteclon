import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Search, User, X } from 'lucide-react';
import { EditableText } from '../admin/EditableText';
import { useEditableAsset } from '../admin/assets';
import { useAdmin } from '../admin/AdminContext';
import { waMeDigits, waMeUrl } from '../lib/whatsapp';

export function BottomNav() {
  const { role, isAdmin } = useAdmin();
  const { value: phoneRaw } = useEditableAsset('whatsapp.phone', '905XXXXXXXXX');
  const { value: defaultMessage } = useEditableAsset('whatsapp.defaultMessage', 'Merhaba, bilgi almak istiyorum.');
  const phoneDigits = useMemo(() => waMeDigits(phoneRaw), [phoneRaw]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const canPortal = typeof document !== 'undefined';

  const { value: contactSubject } = useEditableAsset('contact.subject', 'Website chat');

  const [waOpen, setWaOpen] = useState(false);
  const [waName, setWaName] = useState('');
  const [waDraft, setWaDraft] = useState('');
  const { value: waQuick1 } = useEditableAsset('whatsapp.quick.1', 'Fiyat bilgisi alabilir miyim?');
  const { value: waQuick2 } = useEditableAsset('whatsapp.quick.2', 'Takvim uygunluğu soracaktım.');
  const { value: waQuick3 } = useEditableAsset('whatsapp.quick.3', 'Bir projeyi konuşalım mı?');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navItems = [
    { href: '/', labelKey: 'topNav.home', defaultLabel: 'ANA SAYFA' },
    { href: '/portfolio', labelKey: 'topNav.collections', defaultLabel: 'KOLEKSIYONLAR' },
    { href: '/packages', labelKey: 'topNav.rugs', defaultLabel: 'HALILAR' },
    { href: '/takvim', labelKey: 'topNav.curtains', defaultLabel: 'PERDELER' },
  ];

  function goTo(href: string) {
    setMobileMenuOpen(false);
    setSearchOpen(false);
    if (href === '/') {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    window.location.href = href;
  }

  function openSearch() {
    setMobileMenuOpen(false);
    setSearchQuery('');
    setSearchOpen(true);
  }

  const waNow = useMemo(() => {
    try {
      return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [waOpen]);

  const waMessage = useMemo(() => {
    const msg = (waDraft || '').trim() || (defaultMessage || '').trim();
    const name = (waName || '').trim();
    if (!name) return msg;
    if (!msg) return `Merhaba, ben ${name}.`;
    return `Merhaba, ben ${name}. ${msg}`;
  }, [defaultMessage, waDraft, waName]);

  const waHref = useMemo(() => {
    if (phoneDigits.length < 8) return '';
    return waMeUrl(phoneDigits, waMessage);
  }, [phoneDigits, waMessage]);

  const modal = useMemo(() => {
    if (!open || !canPortal) return null;
    const canSend = draft.trim().length > 0 && !sending;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div
          className="relative my-auto w-full max-w-lg max-h-[min(90dvh,calc(100dvh-3rem))] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-lg font-semibold text-[#051A24]">
                <EditableText assetKey="contact.title" defaultValue="Start a chat" as="span" />
              </div>
              <div className="text-xs text-[#051A24]/70 mt-1">
                <EditableText
                  assetKey="contact.subtitle"
                  defaultValue="Mesajını bırak, sana en kısa sürede dönüş yapalım."
                  as="span"
                  multiline
                />
              </div>
            </div>
            <button
              type="button"
              className="text-[#051A24]/60 hover:text-[#051A24] px-2"
              onClick={() => setOpen(false)}
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>

          <label className="block text-xs font-medium text-[#051A24]/80 mb-2">
            <EditableText assetKey="contact.messageLabel" defaultValue="Mesajın" as="span" />
          </label>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSendError(null);
              setSentMessage(null);
            }}
            rows={6}
            className="w-full rounded-xl border border-black/10 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/10 resize-y"
            placeholder="Kısaca neye ihtiyacın var?"
            autoFocus
          />

          {sendError ? <div className="mt-3 text-sm text-red-600">{sendError}</div> : null}
          {sentMessage ? <div className="mt-3 text-sm text-emerald-700">{sentMessage}</div> : null}

          <div className="flex flex-wrap gap-2 mt-4 justify-end">
            <button
              type="button"
              disabled={!canSend}
              className={
                canSend
                  ? 'rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition'
                  : 'rounded-full bg-black/10 text-[#051A24]/50 px-4 py-2 text-sm cursor-not-allowed'
              }
              onClick={async () => {
                const body = draft.trim();
                if (!body) return;
                setSending(true);
                setSendError(null);
                setSentMessage(null);
                try {
                  const res = await fetch('/api/inbox/threads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ subject: contactSubject || 'Website chat', body }),
                  });
                  const data = (await res.json().catch(() => null)) as any;
                  if (!res.ok || !data?.ok) throw new Error('Mesaj gelen kutusuna gönderilemedi.');
                  setDraft('');
                  setSentMessage('Mesajın gelen kutusuna gönderildi.');
                  window.setTimeout(() => {
                    setOpen(false);
                    setSentMessage(null);
                  }, 900);
                } catch (e: any) {
                  setSendError(e?.message || 'Mesaj gelen kutusuna gönderilemedi.');
                } finally {
                  setSending(false);
                }
              }}
            >
              {sending ? 'Gönderiliyor...' : <EditableText assetKey="contact.sendLabel" defaultValue="Gönder" as="span" />}
            </button>
            <button
              type="button"
              className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
              onClick={() => setOpen(false)}
            >
              <EditableText assetKey="contact.cancelLabel" defaultValue="İptal" as="span" />
            </button>
          </div>
        </div>
      </div>
    );
  }, [canPortal, contactSubject, draft, open, sendError, sending, sentMessage]);

  const waModal = useMemo(() => {
    if (!waOpen || !canPortal) return null;
    const quick = [waQuick1, waQuick2, waQuick3].filter(Boolean).slice(0, 3);
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="absolute inset-0 bg-black/40" onClick={() => setWaOpen(false)} />
        <div
          className="relative my-auto w-full max-w-lg max-h-[min(90dvh,calc(100dvh-3rem))] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-lg font-semibold text-[#051A24]">
                <EditableText assetKey="whatsapp.modalTitle" defaultValue="WhatsApp ile konuşma başlat" as="span" />
              </div>
              <div className="text-xs text-[#051A24]/70 mt-1">
                <EditableText
                  assetKey="whatsapp.modalSubtitle"
                  defaultValue="Mesajını yaz, “Başlat” deyince WhatsApp’a yönlendireceğiz."
                  as="span"
                  multiline
                />
              </div>
              <div className="text-[11px] text-[#051A24]/60 mt-2">
                <EditableText assetKey="whatsapp.hours" defaultValue="Genelde 09:00–18:00 içinde hızlı dönüş." as="span" />
                {waNow ? <span className="ml-2">• Şu an: {waNow}</span> : null}
              </div>
              {isAdmin ? (
                <div className="text-[11px] text-[#051A24]/60 mt-1">
                  <EditableText assetKey="whatsapp.phone" defaultValue="905XXXXXXXXX" as="span" />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="text-[#051A24]/60 hover:text-[#051A24] px-2"
              onClick={() => setWaOpen(false)}
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-[#051A24]/80 mb-2">
                <EditableText assetKey="whatsapp.nameLabel" defaultValue="İsim" as="span" />
              </label>
              <input
                value={waName}
                onChange={(e) => setWaName(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Adınız"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-[#051A24]/80 mb-2">
                <EditableText assetKey="whatsapp.quickLabel" defaultValue="Hızlı seçenekler" as="span" />
              </label>
              <div className="flex flex-wrap gap-2">
                {quick.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => setWaDraft(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-[#051A24]/80 mb-2">
              <EditableText assetKey="whatsapp.messageLabel" defaultValue="Mesaj" as="span" />
            </label>
            <textarea
              value={waDraft}
              onChange={(e) => setWaDraft(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-black/10 resize-y"
              placeholder={defaultMessage}
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-2 mt-4 justify-end">
            <a
              href={waHref || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={
                waHref
                  ? 'rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition'
                  : 'rounded-full bg-black/10 text-[#051A24]/50 px-4 py-2 text-sm pointer-events-none'
              }
              onClick={() => setWaOpen(false)}
            >
              <EditableText assetKey="whatsapp.startLabel" defaultValue="Başlat" as="span" />
            </a>
            <button
              type="button"
              className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
              onClick={() => setWaOpen(false)}
            >
              <EditableText assetKey="whatsapp.cancelLabel" defaultValue="İptal" as="span" />
            </button>
          </div>
        </div>
      </div>
    );
  }, [canPortal, defaultMessage, isAdmin, waHref, waName, waNow, waOpen, waQuick1, waQuick2, waQuick3, waDraft]);

  const searchModal = useMemo(() => {
    if (!searchOpen || !canPortal) return null;
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const matches = navItems.filter((item) => item.defaultLabel.toLocaleLowerCase('tr-TR').includes(q));
    const results = matches.length ? matches : navItems;
    return (
      <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-24 sm:px-6">
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
        <div
          className="relative w-full max-w-xl rounded-[8px] border border-white/14 bg-black/88 p-3 text-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 rounded-full border border-white/16 px-4">
            <Search className="h-4 w-4 text-white/70" aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goTo(results[0]?.href || '/');
                if (e.key === 'Escape') setSearchOpen(false);
              }}
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/45"
              placeholder="Ara"
              autoFocus
            />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
              onClick={() => setSearchOpen(false)}
              aria-label="Kapat"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid gap-1">
            {results.map((item) => (
              <button
                key={item.labelKey}
                type="button"
                className="flex h-10 items-center rounded-md px-3 text-left text-[13px] font-semibold uppercase tracking-[0.12em] text-white/72 transition hover:bg-white/10 hover:text-white"
                onClick={() => goTo(item.href)}
              >
                {item.defaultLabel}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }, [canPortal, navItems, searchOpen, searchQuery]);

  return (
    <div className="fixed left-0 right-0 top-0 z-50 px-4 pt-[max(1.25rem,env(safe-area-inset-top,0px))] sm:px-6 lg:px-9">
      <header className="mx-auto flex h-11 w-full max-w-[1360px] items-center justify-between gap-5 text-white">
        <button
          type="button"
          className="shrink-0 text-left text-[20px] font-semibold uppercase leading-none tracking-[0.12em] text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)] sm:text-[22px]"
          onClick={() => goTo('/')}
          aria-label="Ana sayfa"
        >
          <EditableText assetKey="topNav.brand" defaultValue="ELIT DOKUMA" as="span" />
        </button>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-8 lg:flex">
          {navItems.map((item, index) => (
            <button
              key={item.labelKey}
              type="button"
              className={`text-[13px] font-semibold uppercase tracking-[0.12em] transition hover:text-white ${
                index === 0 ? 'text-white' : 'text-white/62'
              }`}
              onClick={() => goTo(item.href)}
            >
              <EditableText assetKey={item.labelKey} defaultValue={item.defaultLabel} as="span" />
            </button>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/18 bg-black/18 px-5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition hover:border-white/32 hover:bg-white/10"
            onClick={openSearch}
            aria-label="Arama"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <EditableText assetKey="topNav.search" defaultValue="Arama" as="span" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-black/18 text-white backdrop-blur-md transition hover:border-white/32 hover:bg-white/10"
            onClick={() => {
              if (role === 'guest') {
                window.dispatchEvent(new CustomEvent('aiag:open-auth', { detail: { tab: 'login' } }));
                return;
              }
              setDraft('');
              setOpen(true);
            }}
            aria-label="Hesap"
          >
            <User className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-black/18 text-white backdrop-blur-md transition hover:border-white/32 hover:bg-white/10 lg:hidden"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {mobileMenuOpen ? (
        <div className="mx-auto mt-3 w-full max-w-[1360px] rounded-[8px] border border-white/14 bg-black/82 p-2 text-white shadow-2xl backdrop-blur-xl lg:hidden">
          {navItems.map((item, index) => (
            <button
              key={item.labelKey}
              type="button"
              className={`flex h-11 w-full items-center rounded-md px-3 text-left text-[13px] font-semibold uppercase tracking-[0.12em] ${
                index === 0 ? 'text-white' : 'text-white/66'
              }`}
              onClick={() => goTo(item.href)}
            >
              <EditableText assetKey={item.labelKey} defaultValue={item.defaultLabel} as="span" />
            </button>
          ))}
          <div className="mt-2 grid grid-cols-[1fr_44px] gap-2 border-t border-white/10 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/14 text-[13px] font-semibold text-white"
              onClick={openSearch}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <EditableText assetKey="topNav.search" defaultValue="Arama" as="span" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/14 text-white"
              onClick={() => {
                setMobileMenuOpen(false);
                if (role === 'guest') {
                  window.dispatchEvent(new CustomEvent('aiag:open-auth', { detail: { tab: 'login' } }));
                  return;
                }
                setDraft('');
                setOpen(true);
              }}
              aria-label="Hesap"
            >
              <User className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {searchOpen && canPortal && searchModal ? createPortal(searchModal, document.body) : null}
      {open && canPortal && modal ? createPortal(modal, document.body) : null}
      {waOpen && canPortal && waModal ? createPortal(waModal, document.body) : null}
    </div>
  );
}
