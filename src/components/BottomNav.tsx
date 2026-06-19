import { Button } from './Button';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

  return (
    <div className="fixed left-1/2 z-50 w-[min(100%,calc(100vw-1.25rem))] max-w-md -translate-x-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
      <div className="bg-white rounded-full px-3 py-2 sm:px-4 flex items-center justify-center gap-3 sm:gap-6 shadow-[0_4px_30px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.05),inset_0_2px_8px_0_rgba(255,255,255,0.5)]">
        <Button
          variant="primary"
          className="py-2 px-6 bg-white text-[#051A24]"
          type="button"
          onClick={() => {
            setWaName('');
            setWaDraft('');
            setWaOpen(true);
          }}
        >
          <span className="flex flex-col items-start leading-tight">
            <span className="font-medium">
              <EditableText assetKey="bottomNav.whatsappLabel" defaultValue="WhatsApp" as="span" />
            </span>
            {isAdmin ? (
              <span className="text-[11px] opacity-70 -mt-0.5">
                <EditableText assetKey="whatsapp.phone" defaultValue="905XXXXXXXXX" as="span" />
              </span>
            ) : null}
          </span>
        </Button>
        <Button
          variant="primary"
          className="py-2 px-6"
          onClick={() => {
            if (role === 'guest') {
              window.dispatchEvent(new CustomEvent('aiag:open-auth', { detail: { tab: 'login' } }));
              return;
            }
            setDraft('');
            setOpen(true);
          }}
        >
          <EditableText assetKey="bottomNav.cta" defaultValue="Start a chat" as="span" />
        </Button>
      </div>
      {open && canPortal && modal ? createPortal(modal, document.body) : null}
      {waOpen && canPortal && waModal ? createPortal(waModal, document.body) : null}
    </div>
  );
}
