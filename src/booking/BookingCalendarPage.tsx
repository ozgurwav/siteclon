import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useAdmin } from '../admin/AdminContext';
import { readJsonAsset, writeJsonAsset } from '../admin/assets';
import {
  CALENDAR_CONFIG_KEY,
  CALENDAR_FONT_PRESETS,
  DEFAULT_CALENDAR_TEXTS,
  DEFAULT_CALENDAR_THEME,
  type CalendarConfig,
  type CalendarFontPresetId,
  type CalendarTexts,
  type CalendarTheme,
  type CalendarThemeFont,
  fontToClass,
  matchCalendarFontPreset,
  normalizeCalendarConfig,
} from '../lib/calendarConfig';
import { cn } from '../lib/utils';

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

const WEEKDAYS_MON = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] as const;

function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIsoLocal() {
  return toIsoLocal(new Date());
}

/** 09:00 … 16:30 — sunucu ile aynı */
export function generateBookingSlots(): { start: string; label: string }[] {
  const out: { start: string; label: string }[] = [];
  for (let t = 9 * 60; t < 17 * 60; t += 30) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    out.push({ start, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
  }
  return out;
}

type BookedSlot = { date: string; slotStart: string };

type AdminBookingRow = {
  id: number;
  category_id?: number | null;
  name: string;
  email: string;
  phone: string | null;
  booking_date: string;
  slot_start: string;
  slot_end: string;
  note: string | null;
  status: string;
  created_at: string;
};

type BookingCategory = { id: number; name: string; deposit_amount_minor: number; currency: string };
type AdminBookingCategory = BookingCategory & {
  active: number;
  sort_order: number;
  created_at: string;
};

function statusLabelTr(status: string) {
  if (status === 'hidden') return 'Gizli';
  if (status === 'pending') return 'Bekliyor';
  if (status === 'confirmed') return 'Onaylı';
  if (status === 'cancelled') return 'İptal';
  return status;
}

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function slotIsPast(dateIso: string | null, slotStart: string | null) {
  if (!dateIso || !slotStart) return true;
  const today = todayIsoLocal();
  if (dateIso < today) return true;
  if (dateIso > today) return false;
  const m = slotStart.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return true;
  const slotMinutes = Number(m[1]) * 60 + Number(m[2]);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes;
}

/** Ödeme popup'ı kapanınca takvim sekmesine haber vermek için (PaymentSuccessPage ile aynı string). */
const IYZICO_PAYMENT_PAID_MESSAGE = 'aiag:iyzico-payment-paid';

function openIyzicoCheckoutHtml(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;

  // Blob URL: about:blank + document.write çoğu tarayıcıda noopener ile kilitlenir / boş kalır.
  try {
    const blob = new Blob([trimmed], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, '_blank', 'popup=yes,width=560,height=920');
    if (!popup) {
      URL.revokeObjectURL(url);
      return false;
    }
    const revoke = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    };
    popup.addEventListener('pagehide', revoke, { once: true });
    setTimeout(revoke, 600_000);
    popup.focus?.();
    return true;
  } catch {
    /* blob veya open başarısız */
  }

  // Yedek: doğrudan yaz — noopener kullanma (yazmayı engeller).
  try {
    const popup = window.open('', '_blank', 'popup=yes,width=560,height=920');
    if (!popup) return false;
    popup.document.open();
    popup.document.write(trimmed);
    popup.document.close();
    popup.focus?.();
    return true;
  } catch {
    return false;
  }
}

const FONT_OPTIONS: { value: CalendarThemeFont; label: string }[] = [
  { value: 'serif', label: 'Serif (PP Mondwest — ana sayfa başlıkları)' },
  { value: 'sans', label: 'Sans (PP Neue Montreal — gövde)' },
  { value: 'mono', label: 'Mono (JetBrains — etiket / kod)' },
];

export function BookingCalendarPage() {
  const { role, isAdmin, assetsVersion, bumpAssetsVersion } = useAdmin();
  const canManage = role === 'admin';

  const cfg = useMemo(() => {
    void assetsVersion;
    return normalizeCalendarConfig(readJsonAsset<unknown>(CALENDAR_CONFIG_KEY));
  }, [assetsVersion]);

  const t = cfg.texts;
  const th = cfg.theme;

  const [maxPerDay, setMaxPerDay] = useState(16);
  const [draftTexts, setDraftTexts] = useState<CalendarTexts>(DEFAULT_CALENDAR_TEXTS);
  const [draftTheme, setDraftTheme] = useState<CalendarTheme>(DEFAULT_CALENDAR_THEME);
  const [draftMax, setDraftMax] = useState(16);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNote, setSettingsNote] = useState<string | null>(null);

  const [categories, setCategories] = useState<BookingCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const [adminCats, setAdminCats] = useState<AdminBookingCategory[]>([]);
  const [adminCatsBusy, setAdminCatsBusy] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDeposit, setNewCatDeposit] = useState('500');

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/booking-categories');
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) return;
      const rows = (data.categories || []) as BookingCategory[];
      setCategories(Array.isArray(rows) ? rows : []);
      setCategoryId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        const first = rows[0]?.id;
        return Number.isFinite(Number(first)) ? Number(first) : null;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const loadAdminCats = useCallback(async () => {
    if (!canManage) return;
    setAdminCatsBusy(true);
    try {
      const res = await fetch('/api/admin/booking-categories', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) {
        setAdminCats([]);
        return;
      }
      setAdminCats(((data.categories || []) as AdminBookingCategory[]) || []);
    } catch {
      setAdminCats([]);
    } finally {
      setAdminCatsBusy(false);
    }
  }, [canManage]);

  const loadPublicMax = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/public-settings');
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) return;
      const n = Number(data.maxBookingsPerDay);
      if (Number.isFinite(n) && n >= 1) {
        setMaxPerDay(Math.min(100, Math.floor(n)));
        setDraftMax(Math.min(100, Math.floor(n)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPublicMax();
  }, [loadPublicMax]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadAdminCats();
  }, [loadAdminCats]);

  useEffect(() => {
    if (!isAdmin) return;
    const n = normalizeCalendarConfig(readJsonAsset<unknown>(CALENDAR_CONFIG_KEY));
    setDraftTexts({ ...n.texts });
    setDraftTheme({ ...n.theme });
  }, [assetsVersion, isAdmin]);

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayIsoLocal());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookedSlot[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [loadingBooked, setLoadingBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [paymentRetry, setPaymentRetry] = useState<{ bookingId: number; email: string } | null>(null);
  const [paymentRetryBusy, setPaymentRetryBusy] = useState(false);
  const [adminBookings, setAdminBookings] = useState<AdminBookingRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);

  const slots = useMemo(() => generateBookingSlots(), []);

  const monthLabel = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const { gridDays } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const lastDate = last.getDate();
    const mon0 = (first.getDay() + 6) % 7;
    const days: { iso: string; inMonth: boolean; dayNum: number }[] = [];
    for (let i = 0; i < mon0; i++) days.push({ iso: '', inMonth: false, dayNum: 0 });
    for (let d = 1; d <= lastDate; d++) {
      const dt = new Date(y, m, d);
      days.push({ iso: toIsoLocal(dt), inMonth: true, dayNum: d });
    }
    while (days.length % 7 !== 0) {
      days.push({ iso: '', inMonth: false, dayNum: 0 });
    }
    return { gridDays: days };
  }, [cursor]);

  const monthRange = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const from = toIsoLocal(new Date(y, m, 1));
    const to = toIsoLocal(new Date(y, m + 1, 0));
    return { from, to };
  }, [cursor]);

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of booked) m.set(b.date, (m.get(b.date) || 0) + 1);
    return m;
  }, [booked]);

  const dayIsFull = useCallback(
    (iso: string) => (countByDate.get(iso) || 0) >= maxPerDay,
    [countByDate, maxPerDay],
  );

  const selectedDayFull = selectedDate ? dayIsFull(selectedDate) : false;
  const selectedSlotPast = slotIsPast(selectedDate, selectedSlot);

  const loadBooked = useCallback(async () => {
    setLoadingBooked(true);
    try {
      const u = new URL('/api/bookings/booked', window.location.origin);
      u.searchParams.set('from', monthRange.from);
      u.searchParams.set('to', monthRange.to);
      const res = await fetch(u.toString());
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error('Uygunluk alınamadı.');
      setBooked((data.slots || []) as BookedSlot[]);
    } catch {
      setBooked([]);
    } finally {
      setLoadingBooked(false);
    }
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    void loadBooked();
  }, [loadBooked]);

  const bookedSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of booked) s.add(`${b.date}|${b.slotStart}`);
    return s;
  }, [booked]);

  const loadAdmin = useCallback(async () => {
    if (!canManage) return;
    setAdminLoading(true);
    try {
      const res = await fetch('/api/bookings', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error();
      setAdminBookings((data.bookings || []) as AdminBookingRow[]);
    } catch {
      setAdminBookings([]);
    } finally {
      setAdminLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  useEffect(() => {
    function onPaymentMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; paid?: boolean; bookingId?: unknown; paymentRequestId?: unknown } | null;
      if (!d || d.type !== IYZICO_PAYMENT_PAID_MESSAGE || d.paid !== true) return;
      const bookingId = d.bookingId != null ? Number(d.bookingId) : NaN;
      setPaymentRetry(null);
      setMessage({
        kind: 'ok',
        text:
          Number.isFinite(bookingId) && bookingId > 0
            ? `Kapora alındı. Rezervasyon #${bookingId} onaylandı.`
            : 'Kapora alındı. Randevunuz onaylandı.',
      });
      void loadBooked();
      void loadAdmin();
    }
    window.addEventListener('message', onPaymentMessage);
    return () => window.removeEventListener('message', onPaymentMessage);
  }, [loadBooked, loadAdmin]);

  const patchBookingStatus = async (id: number, status: 'confirmed' | 'cancelled' | 'hidden') => {
    if (status === 'hidden' && !window.confirm('Bu randevu admin listesinden gizlensin mi?')) return;
    setStatusBusyId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error();
      void loadAdmin();
      void loadBooked();
    } catch {
      setMessage({ kind: 'err', text: t.msgGenericError });
    } finally {
      setStatusBusyId(null);
    }
  };

  const deleteBooking = async (id: number) => {
    if (!window.confirm('Bu randevu tamamen silinsin mi? Bu işlem geri alınamaz.')) return;
    setStatusBusyId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error();
      void loadAdmin();
      void loadBooked();
    } catch {
      setMessage({ kind: 'err', text: t.msgGenericError });
    } finally {
      setStatusBusyId(null);
    }
  };

  const saveCalendarSettings = async () => {
    if (!isAdmin) return;
    setSettingsBusy(true);
    setSettingsNote(null);
    const next: CalendarConfig = { texts: draftTexts, theme: draftTheme };
    try {
      writeJsonAsset(CALENDAR_CONFIG_KEY, next);
      bumpAssetsVersion();
      const res = await fetch('/api/admin/calendar-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ maxBookingsPerDay: draftMax }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.ok) {
        const authHint =
          res.status === 401 || res.status === 403
            ? ' Ana sayfadan e-posta/şifre ile tekrar giriş yap (sunucu oturumu gerekir).'
            : '';
        setSettingsNote(
          `Metin ve fontlar kaydedildi.${authHint} Gün kotası sunucuya yazılamadı${data?.error ? ` (${String(data.error)})` : ''}.`,
        );
        return;
      }
      setMaxPerDay(Number(data.maxBookingsPerDay) || draftMax);
      setSettingsNote(t.settingsSaved);
    } catch (e: any) {
      setSettingsNote(e?.message || t.msgGenericError);
    } finally {
      setSettingsBusy(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!categoryId) {
      setMessage({ kind: 'err', text: 'Lütfen çekim türünü seç.' });
      return;
    }
    if (!selectedDate || !selectedSlot) {
      setMessage({ kind: 'err', text: t.msgSelectSlot });
      return;
    }
    if (slotIsPast(selectedDate, selectedSlot)) {
      setMessage({ kind: 'err', text: 'Geçmiş saat için randevu alınamaz. Lütfen ileri bir saat seçin.' });
      setSelectedSlot(null);
      return;
    }
    if (dayIsFull(selectedDate)) {
      setMessage({ kind: 'err', text: t.msgDayFull });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          categoryId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          date: selectedDate,
          slotStart: selectedSlot,
          note: note.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (res.status === 409 && data?.error === 'slot_taken') {
        setMessage({ kind: 'err', text: t.msgSlotTaken });
        void loadBooked();
        return;
      }
      if (res.status === 409 && data?.error === 'day_full') {
        setMessage({ kind: 'err', text: t.msgDayFull });
        void loadBooked();
        void loadPublicMax();
        return;
      }
      if (!res.ok || !data?.ok) {
        setMessage({ kind: 'err', text: t.msgGenericError });
        return;
      }

      const bookingId = Number(data?.id) || 0;
      const checkoutHtml =
        typeof data?.iyzicoCheckout?.checkoutFormContent === 'string' ? data.iyzicoCheckout.checkoutFormContent : '';
      const cat = (categories || []).find((c) => c.id === categoryId);
      const depositMinor = cat ? Number(cat.deposit_amount_minor) || 0 : 0;
      const retryEmail = email.trim();

      if (checkoutHtml) {
        const opened = openIyzicoCheckoutHtml(checkoutHtml);
        if (!opened) {
          setMessage({
            kind: 'err',
            text: 'Rezervasyon kaydedildi ancak ödeme penceresi açılamadı. Açılır pencere engelini kaldırıp aşağıdan tekrar deneyin.',
          });
          setPaymentRetry({ bookingId, email: retryEmail });
        } else {
          setMessage({
            kind: 'ok',
            text: 'Rezervasyon oluşturuldu. Ödeme penceresinde kart bilgilerinizi girin; kapora tamamlandığında randevu otomatik onaylanır.',
          });
          setPaymentRetry(null);
        }
      } else if (depositMinor > 0) {
        const ie = data?.iyzicoError as
          | { message?: string; callbackUrl?: string; reason?: string; code?: string }
          | undefined;
        const detail = ie?.message
          ? `${ie.message}${ie.code ? ` [${ie.code}]` : ''}${ie.callbackUrl ? `\nCallback: ${ie.callbackUrl}` : ''}`
          : 'Ödeme formu açılamadı; aşağıdan tekrar deneyin veya API sunucusunu (.env + PORT) kontrol edin.';
        setMessage({
          kind: ie ? 'err' : 'ok',
          text: `Rezervasyon kaydedildi. ${detail}`,
        });
        setPaymentRetry({ bookingId, email: retryEmail });
      } else {
        setMessage({ kind: 'ok', text: t.msgSuccess });
        setPaymentRetry(null);
      }

      setName('');
      setEmail('');
      setPhone('');
      setNote('');
      setSelectedSlot(null);
      void loadBooked();
      void loadAdmin();
    } catch {
      setMessage({ kind: 'err', text: t.msgNetwork });
    } finally {
      setSubmitting(false);
    }
  };

  const today = todayIsoLocal();

  const titleFont = fontToClass(th.titleFont);
  const subtitleFont = fontToClass(th.subtitleFont);
  const labelFont = fontToClass(th.labelFont);
  const bodyFont = fontToClass(th.bodyFont);

  return (
    <main className={cn('min-h-screen bg-[#F4F5F6] text-[#051A24] antialiased', bodyFont)}>
      <div className="max-w-6xl mx-auto px-5 py-8 md:py-12">
        {isAdmin ? (
          <div className="mb-8 rounded-2xl border border-amber-200/80 bg-amber-50/90 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((o) => !o);
                setSettingsNote(null);
              }}
              className={cn(
                'w-full px-4 py-3 text-left text-sm font-medium flex items-center justify-between gap-3',
                labelFont,
                'text-amber-950/90',
              )}
            >
              <span>{t.settingsTitle}</span>
              <span className="text-xs opacity-70">{settingsOpen ? '▲' : '▼'}</span>
            </button>
            {settingsOpen ? (
              <div className="px-4 pb-4 pt-0 border-t border-amber-200/60 space-y-4">
                <p className={cn('text-xs text-[#051A24]/65 leading-relaxed', bodyFont)}>
                  Metin ve fontlar bu tarayıcıda saklanır. Gün kotası sunucuya yazılır — giriş yapmış yönetici
                  oturumu gerekir.
                </p>
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1.5', labelFont)}>Font ön ayarı</label>
                  <select
                    value={matchCalendarFontPreset(draftTheme)}
                    onChange={(e) => {
                      const v = e.target.value as CalendarFontPresetId;
                      if (v === 'custom') return;
                      setDraftTheme({ ...CALENDAR_FONT_PRESETS[v] });
                    }}
                    className={cn(
                      'w-full max-w-md rounded-xl border border-black/12 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                      bodyFont,
                    )}
                  >
                    <option value="home">Ana sayfa gibi — serif başlık, mono etiket, sans gövde</option>
                    <option value="allSans">Tüm metin sans (tek tip, sade)</option>
                    <option value="allSerif">Tüm metin serif (editoryal)</option>
                    {matchCalendarFontPreset(draftTheme) === 'custom' ? (
                      <option value="custom">Özel (aşağıdan düzenlendi)</option>
                    ) : null}
                  </select>
                </div>

                <details className="rounded-xl border border-black/10 bg-white/70 px-3 py-2">
                  <summary className={cn('text-sm text-[#051A24] cursor-pointer select-none', labelFont)}>
                    İleri düzey — başlık / alt metin / etiket / gövde ayrı ayrı
                  </summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.fontTitleLabel}</label>
                      <select
                        value={draftTheme.titleFont}
                        onChange={(e) =>
                          setDraftTheme((s) => ({ ...s, titleFont: e.target.value as CalendarThemeFont }))
                        }
                        className={cn(
                          'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                          bodyFont,
                        )}
                      >
                        {FONT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.fontSubtitleLabel}</label>
                      <select
                        value={draftTheme.subtitleFont}
                        onChange={(e) =>
                          setDraftTheme((s) => ({ ...s, subtitleFont: e.target.value as CalendarThemeFont }))
                        }
                        className={cn(
                          'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                          bodyFont,
                        )}
                      >
                        {FONT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.fontLabelLabel}</label>
                      <select
                        value={draftTheme.labelFont}
                        onChange={(e) =>
                          setDraftTheme((s) => ({ ...s, labelFont: e.target.value as CalendarThemeFont }))
                        }
                        className={cn(
                          'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                          bodyFont,
                        )}
                      >
                        {FONT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.fontBodyLabel}</label>
                      <select
                        value={draftTheme.bodyFont}
                        onChange={(e) =>
                          setDraftTheme((s) => ({ ...s, bodyFont: e.target.value as CalendarThemeFont }))
                        }
                        className={cn(
                          'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                          bodyFont,
                        )}
                      >
                        {FONT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </details>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Sayfa başlığı</label>
                    <input
                      value={draftTexts.pageTitle}
                      onChange={(e) => setDraftTexts((s) => ({ ...s, pageTitle: e.target.value }))}
                      className={cn(
                        'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                        bodyFont,
                      )}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Üst açıklama</label>
                    <textarea
                      value={draftTexts.pageSubtitle}
                      onChange={(e) => setDraftTexts((s) => ({ ...s, pageSubtitle: e.target.value }))}
                      rows={2}
                      className={cn(
                        'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white resize-y',
                        bodyFont,
                      )}
                    />
                  </div>
                  <div>
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Geri link metni</label>
                    <input
                      value={draftTexts.backLink}
                      onChange={(e) => setDraftTexts((s) => ({ ...s, backLink: e.target.value }))}
                      className={cn(
                        'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                        bodyFont,
                      )}
                    />
                  </div>
                  <div>
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Form bölüm başlığı</label>
                    <input
                      value={draftTexts.formSectionTitle}
                      onChange={(e) => setDraftTexts((s) => ({ ...s, formSectionTitle: e.target.value }))}
                      className={cn(
                        'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                        bodyFont,
                      )}
                    />
                  </div>
                  <div>
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Saat listesi etiketi</label>
                    <input
                      value={draftTexts.slotsLabel}
                      onChange={(e) => setDraftTexts((s) => ({ ...s, slotsLabel: e.target.value }))}
                      className={cn(
                        'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                        bodyFont,
                      )}
                    />
                  </div>
                  <div>
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Gönder butonu metni</label>
                    <input
                      value={draftTexts.submitButton}
                      onChange={(e) => setDraftTexts((s) => ({ ...s, submitButton: e.target.value }))}
                      className={cn(
                        'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                        bodyFont,
                      )}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.maxPerDayLabel}</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draftMax}
                      onChange={(e) => setDraftMax(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                      className={cn(
                        'w-full max-w-[200px] rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                        bodyFont,
                      )}
                    />
                    <p className={cn('text-xs text-[#051A24]/55 mt-1', bodyFont)}>{t.maxPerDayHint}</p>
                  </div>
                </div>

                {settingsNote ? (
                  <p className={cn('text-sm text-[#051A24]/80', bodyFont)}>{settingsNote}</p>
                ) : null}

                <button
                  type="button"
                  disabled={settingsBusy}
                  onClick={() => void saveCalendarSettings()}
                  className={cn(
                    'rounded-full bg-[#051A24] text-white px-5 py-2.5 text-sm font-medium shadow-sm hover:opacity-95 disabled:opacity-50',
                    bodyFont,
                  )}
                >
                  {settingsBusy ? '…' : t.settingsSave}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <header className="mb-10 md:mb-12">
          <a
            href="/"
            className={cn(
              'inline-flex items-center gap-2 text-xs md:text-sm text-[#051A24]/60 hover:text-[#051A24] transition mb-5',
              subtitleFont,
            )}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            {t.backLink}
          </a>
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="rounded-2xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3.5 shrink-0">
              <CalendarDays className="w-7 h-7 text-[#051A24]/85" strokeWidth={1.5} />
            </div>
            <div>
              <h1
                className={cn(
                  'font-semibold text-[32px] md:text-[40px] tracking-tight text-[#051A24] leading-[1.1]',
                  titleFont,
                )}
              >
                {t.pageTitle}
              </h1>
              <p className={cn('text-xs md:text-sm text-[#051A24]/70 mt-3 max-w-xl leading-relaxed', subtitleFont)}>
                {t.pageSubtitle}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
          <section className="lg:col-span-7 rounded-2xl bg-white border border-black/10 shadow-sm p-5 md:p-7">
            <div className="flex items-center justify-between gap-4 mb-6">
              <button
                type="button"
                className={cn(
                  'p-2.5 rounded-xl border border-black/10 bg-white text-[#051A24] hover:bg-black/[0.03] active:scale-[0.98] transition shadow-sm',
                  bodyFont,
                )}
                aria-label="Önceki ay"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className={cn('font-semibold text-lg md:text-xl text-[#051A24] tracking-tight', titleFont)}>
                {monthLabel}
              </div>
              <button
                type="button"
                className={cn(
                  'p-2.5 rounded-xl border border-black/10 bg-white text-[#051A24] hover:bg-black/[0.03] active:scale-[0.98] transition shadow-sm',
                  bodyFont,
                )}
                aria-label="Sonraki ay"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div
              className={cn(
                'grid grid-cols-7 gap-1 text-center text-[11px] md:text-xs uppercase tracking-[0.12em] text-[#051A24]/40 mb-2',
                labelFont,
              )}
            >
              {WEEKDAYS_MON.map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {gridDays.map((cell, i) => {
                if (!cell.inMonth) {
                  return <div key={`e-${i}`} className="aspect-square rounded-xl bg-[#F4F5F6]" />;
                }
                const past = cell.iso < today;
                const full = dayIsFull(cell.iso);
                const isSelected = selectedDate === cell.iso;
                const disabled = past || full;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setSelectedDate(cell.iso);
                      setSelectedSlot(null);
                      setMessage(null);
                    }}
                    className={cn(
                      'aspect-square rounded-xl text-sm font-medium transition border',
                      bodyFont,
                      past && 'opacity-30 cursor-not-allowed border-transparent bg-transparent text-[#051A24]/35',
                      full &&
                        !past &&
                        'opacity-45 cursor-not-allowed border-black/10 bg-black/[0.04] text-[#051A24]/50 line-through decoration-[#051A24]/30',
                      !past &&
                        !full &&
                        !isSelected &&
                        'bg-[#FAFAFA] border-black/[0.08] text-[#051A24] hover:bg-white hover:border-black/15 hover:shadow-sm',
                      isSelected && !full && 'bg-[#051A24] border-[#051A24] text-white shadow-md',
                    )}
                  >
                    {cell.dayNum}
                  </button>
                );
              })}
            </div>
            {loadingBooked ? (
              <p className={cn('text-xs text-[#051A24]/45 mt-4 text-center', labelFont)}>{t.loadingAvailability}</p>
            ) : null}
          </section>

          <section
            className={cn(
              'lg:col-span-5 rounded-2xl bg-white border border-black/10 shadow-sm p-5 md:p-7 flex flex-col min-h-[420px] text-[#051A24]',
              bodyFont,
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-[#051A24]/70 shrink-0" />
              <h2 className={cn('font-semibold text-[22px] md:text-[24px] tracking-tight text-[#051A24]', titleFont)}>
                {t.formSectionTitle}
              </h2>
            </div>
            <p className={cn('text-xs text-[#051A24]/60 mb-5', subtitleFont)}>
              {selectedDate
                ? `${t.dateSelectedPrefix} ${selectedDate.split('-').reverse().join('.')}`
                : t.selectDayHint}
              {selectedDate && selectedDayFull ? (
                <span className="block mt-1 text-amber-800/90">{t.msgDayFull}</span>
              ) : null}
            </p>

            <div className="flex-1 flex flex-col gap-5">
              <div>
                <div className={cn('text-xs uppercase tracking-[0.14em] text-[#051A24]/55 mb-2', labelFont)}>
                  {t.slotsLabel}
                </div>
                <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {slots.map(({ start, label }) => {
                    const key = selectedDate ? `${selectedDate}|${start}` : '';
                    const taken = selectedDate ? bookedSet.has(key) : false;
                    const active = selectedSlot === start;
                    const pastDay = selectedDate ? selectedDate < today : true;
                    const pastSlot = slotIsPast(selectedDate, start);
                    const disabled = !selectedDate || pastDay || pastSlot || taken || selectedDayFull;
                    return (
                      <button
                        key={start}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedSlot(start);
                          setMessage(null);
                        }}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs border transition',
                          labelFont,
                          disabled && 'opacity-35 cursor-not-allowed border-black/10',
                          !disabled && !active && 'border-black/15 bg-black/[0.03] hover:bg-black/[0.06]',
                          active && 'border-[#051A24] bg-[#051A24] text-white shadow-md',
                          taken && 'line-through opacity-50',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-3 border-t border-black/10 pt-4">
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Çekim türü</label>
                  <select
                    value={categoryId ?? ''}
                    onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 bg-white',
                      bodyFont,
                    )}
                    required
                  >
                    {(categories || []).length ? null : <option value="">Yükleniyor…</option>}
                    {(categories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {(Number(c.deposit_amount_minor) || 0) / 100} {String(c.currency || 'try').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.labelName}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15',
                      bodyFont,
                    )}
                    placeholder={t.phName}
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.labelEmail}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15',
                      bodyFont,
                    )}
                    placeholder={t.phEmail}
                    required
                  />
                </div>
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.labelPhone}</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(onlyDigits(e.target.value))}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15',
                      bodyFont,
                    )}
                    placeholder={t.phPhone}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </div>
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>{t.labelNote}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15 resize-y',
                      bodyFont,
                    )}
                    placeholder={t.phNote}
                  />
                </div>

                {message ? (
                  <div
                    className={cn(
                      'text-sm rounded-xl px-3 py-2 whitespace-pre-wrap break-words',
                      bodyFont,
                      message.kind === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900',
                    )}
                  >
                    {message.text}
                  </div>
                ) : null}

                {paymentRetry ? (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-3 space-y-2">
                    <p className={cn('text-xs text-amber-950/90 leading-relaxed', bodyFont)}>
                      Kapora ödemesi henüz tamamlanmadı (rezervasyon #{paymentRetry.bookingId}). Ödeme penceresini buradan
                      yeniden açabilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={() => setPaymentRetry(null)}
                      className={cn('text-[11px] text-amber-900/70 underline underline-offset-2', bodyFont)}
                    >
                      Kapora beklemesini kapat
                    </button>
                    <button
                      type="button"
                      disabled={paymentRetryBusy}
                      onClick={async () => {
                        setPaymentRetryBusy(true);
                        try {
                          const res = await fetch('/api/payments/iyzipay/initialize', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                              bookingId: paymentRetry.bookingId,
                              email: paymentRetry.email,
                            }),
                          });
                          const raw = await res.text();
                          let data: any = null;
                          try {
                            data = raw ? JSON.parse(raw) : null;
                          } catch {
                            data = null;
                          }
                          const html =
                            typeof data?.iyzicoCheckout?.checkoutFormContent === 'string'
                              ? data.iyzicoCheckout.checkoutFormContent
                              : '';
                          if (!res.ok || !data?.ok || !html?.trim()) {
                            const fromJson =
                              typeof data?.message === 'string' && data.message.trim()
                                ? data.message.trim()
                                : typeof data?.error === 'string' && data.error.trim()
                                  ? `${data.error}: ${typeof data?.message === 'string' ? data.message : ''}`.trim()
                                  : '';
                            const cb = typeof data?.callbackUrl === 'string' ? data.callbackUrl : '';
                            const snippet =
                              raw && !fromJson
                                ? `\n(HTTP ${res.status}, yanıt JSON değil veya boş: ${raw.slice(0, 220)}${raw.length > 220 ? '…' : ''})`
                                : fromJson
                                  ? ''
                                  : `\n(HTTP ${res.status})`;
                            setMessage({
                              kind: 'err',
                              text: fromJson
                                ? `Ödeme: ${fromJson}${cb ? `\nCallback: ${cb}` : ''}${snippet}`
                                : `Ödeme isteği başarısız.${snippet}\nYerelde: .env + npm run server. Vercel’de: Environment Variables + redeploy; /api/health ile iyzipay alanlarını kontrol et.`,
                            });
                            return;
                          }
                          const opened = openIyzicoCheckoutHtml(html);
                          if (!opened) {
                            setMessage({
                              kind: 'err',
                              text: 'Ödeme penceresi açılamadı; tarayıcıda bu site için açılır pencerelere izin verin.',
                            });
                            return;
                          }
                          setPaymentRetry(null);
                          setMessage({
                            kind: 'ok',
                            text: 'Ödeme penceresi açıldı. İşlemi tamamladığınızda randevu otomatik onaylanır.',
                          });
                        } finally {
                          setPaymentRetryBusy(false);
                        }
                      }}
                      className={cn(
                        'w-full rounded-full bg-[#051A24] text-white py-2.5 text-sm font-medium shadow-sm hover:opacity-95 disabled:opacity-45',
                        bodyFont,
                      )}
                    >
                      {paymentRetryBusy ? '…' : 'Kapora ödemesini başlat'}
                    </button>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || !selectedDate || !selectedSlot || selectedDayFull || selectedSlotPast}
                  className={cn(
                    'w-full rounded-full bg-[#051A24] text-white py-3 text-sm md:text-base font-medium shadow-[0_4px_14px_rgba(5,26,36,0.25)] hover:opacity-[0.96] active:scale-[0.99] transition disabled:opacity-40 disabled:pointer-events-none',
                    bodyFont,
                  )}
                >
                  {submitting ? t.submitLoading : t.submitButton}
                </button>
              </form>
            </div>
          </section>
        </div>

        {canManage ? (
          <section className="mt-8 md:mt-10 rounded-2xl bg-white border border-black/10 shadow-sm p-5 md:p-7">
            <div className="flex items-center justify-between gap-4 mb-5">
              <h3 className={cn('font-semibold text-lg md:text-xl tracking-tight text-[#051A24]', titleFont)}>
                {t.adminTitle}
              </h3>
              <button
                type="button"
                onClick={() => void loadAdmin()}
                className={cn(
                  'text-xs font-medium rounded-full px-4 py-2 bg-[#F4F5F6] text-[#051A24] border border-black/10 hover:bg-black/[0.04] transition',
                  labelFont,
                )}
              >
                {adminLoading ? '…' : t.adminRefresh}
              </button>
            </div>
            {adminBookings.length === 0 ? (
              <p className={cn('text-sm text-[#051A24]/55', bodyFont)}>{t.adminEmpty}</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className={cn('w-full text-left text-sm text-[#051A24] min-w-[640px]', bodyFont)}>
                  <thead>
                    <tr className={cn('border-b border-black/10 text-[#051A24]/50 text-xs uppercase tracking-[0.1em]', labelFont)}>
                      <th className="py-2.5 pr-3 font-medium">{t.thDate}</th>
                      <th className="py-2.5 pr-3 font-medium">{t.thTime}</th>
                      <th className="py-2.5 pr-3 font-medium">{t.thName}</th>
                      <th className="py-2.5 pr-3 font-medium">{t.thEmail}</th>
                      <th className="py-2.5 pr-3 font-medium">{t.thStatus}</th>
                      <th className="py-2.5 pr-3 font-medium">{t.thActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminBookings.map((b) => (
                      <tr key={b.id} className="border-b border-black/[0.06] last:border-0">
                        <td className="py-2.5 pr-3 whitespace-nowrap text-[#051A24]/90">{b.booking_date}</td>
                        <td className={cn('py-2.5 pr-3 whitespace-nowrap text-xs text-[#051A24]/80', labelFont)}>
                          {b.slot_start}–{b.slot_end}
                        </td>
                        <td className="py-2.5 pr-3">{b.name}</td>
                        <td className="py-2.5 pr-3 text-[#051A24]/65">{b.email}</td>
                        <td className="py-2.5 pr-3 text-xs font-medium text-[#051A24]/70">
                          {statusLabelTr(b.status)}
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="flex flex-wrap gap-1.5">
                            {b.status === 'pending' ? (
                              <button
                                type="button"
                                disabled={statusBusyId === b.id}
                                onClick={() => void patchBookingStatus(b.id, 'confirmed')}
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-[11px] border border-emerald-700/30 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50',
                                  labelFont,
                                )}
                              >
                                {t.approve}
                              </button>
                            ) : null}
                            {b.status === 'pending' || b.status === 'confirmed' ? (
                              <button
                                type="button"
                                disabled={statusBusyId === b.id}
                                onClick={() => void patchBookingStatus(b.id, 'cancelled')}
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-[11px] border border-red-200 bg-red-50 text-red-900 hover:bg-red-100 disabled:opacity-50',
                                  labelFont,
                                )}
                              >
                                {t.cancel}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={statusBusyId === b.id}
                              onClick={() => void patchBookingStatus(b.id, 'hidden')}
                              className={cn(
                                'rounded-full px-2.5 py-1 text-[11px] border border-black/10 bg-[#F4F5F6] text-[#051A24] hover:bg-black/[0.04] disabled:opacity-50',
                                labelFont,
                              )}
                            >
                              Gizle
                            </button>
                            <button
                              type="button"
                              disabled={statusBusyId === b.id}
                              onClick={() => void deleteBooking(b.id)}
                              className={cn(
                                'rounded-full px-2.5 py-1 text-[11px] border border-red-300 bg-white text-red-900 hover:bg-red-50 disabled:opacity-50',
                                labelFont,
                              )}
                            >
                              Sil
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-black/10">
              <div className="flex items-center justify-between gap-4">
                <h4 className={cn('font-semibold text-base md:text-lg tracking-tight text-[#051A24]', titleFont)}>
                  Çekim türleri & kapora
                </h4>
                <button
                  type="button"
                  onClick={() => void loadAdminCats()}
                  className={cn(
                    'text-xs font-medium rounded-full px-4 py-2 bg-[#F4F5F6] text-[#051A24] border border-black/10 hover:bg-black/[0.04] transition',
                    labelFont,
                  )}
                >
                  {adminCatsBusy ? '…' : 'Yenile'}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Kategori adı</label>
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15',
                      bodyFont,
                    )}
                    placeholder="Düğün çekimi"
                  />
                </div>
                <div>
                  <label className={cn('block text-xs text-[#051A24]/70 mb-1', labelFont)}>Kapora (TRY)</label>
                  <input
                    value={newCatDeposit}
                    onChange={(e) => setNewCatDeposit(onlyDigits(e.target.value))}
                    className={cn(
                      'w-full rounded-xl border border-black/12 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15',
                      bodyFont,
                    )}
                    placeholder="500"
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={async () => {
                      const name = newCatName.trim();
                      const depTry = Number(String(newCatDeposit).replace(',', '.'));
                      const minor = Math.max(0, Math.floor((Number.isFinite(depTry) ? depTry : 0) * 100));
                      if (!name) return;
                      try {
                        const res = await fetch('/api/admin/booking-categories', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({
                            name,
                            deposit_amount_minor: minor,
                            currency: 'try',
                            active: 1,
                            sort_order: 0,
                          }),
                        });
                        const data = (await res.json().catch(() => null)) as any;
                        if (!res.ok || !data?.ok) return;
                        setNewCatName('');
                        setNewCatDeposit('500');
                        void loadAdminCats();
                        void loadCategories();
                      } catch {
                        /* ignore */
                      }
                    }}
                    className={cn(
                      'w-full rounded-xl bg-[#051A24] text-white py-2.5 text-sm font-medium shadow-[0_4px_14px_rgba(5,26,36,0.25)] hover:opacity-[0.96] active:scale-[0.99] transition',
                      bodyFont,
                    )}
                  >
                    Ekle
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto -mx-1">
                <table className={cn('w-full text-left text-sm text-[#051A24] min-w-[720px]', bodyFont)}>
                  <thead>
                    <tr className={cn('border-b border-black/10 text-[#051A24]/50 text-xs uppercase tracking-[0.1em]', labelFont)}>
                      <th className="py-2.5 pr-3 font-medium">Ad</th>
                      <th className="py-2.5 pr-3 font-medium">Kapora</th>
                      <th className="py-2.5 pr-3 font-medium">Aktif</th>
                      <th className="py-2.5 pr-3 font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminCats.map((c) => (
                      <tr key={c.id} className="border-b border-black/[0.06] last:border-0">
                        <td className="py-2.5 pr-3">
                          <input
                            defaultValue={c.name}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (!v || v === c.name) return;
                              void fetch(`/api/admin/booking-categories/${c.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ name: v }),
                              }).then(() => {
                                void loadAdminCats();
                                void loadCategories();
                              });
                            }}
                            className={cn(
                              'w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white',
                              bodyFont,
                            )}
                          />
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <input
                            defaultValue={String((Number(c.deposit_amount_minor) || 0) / 100)}
                            onChange={(e) => {
                              e.currentTarget.value = onlyDigits(e.currentTarget.value);
                            }}
                            onBlur={(e) => {
                              const v = Number(onlyDigits(e.target.value));
                              if (!Number.isFinite(v)) return;
                              const minor = Math.max(0, Math.floor(v * 100));
                              if (minor === Number(c.deposit_amount_minor)) return;
                              void fetch(`/api/admin/booking-categories/${c.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ deposit_amount_minor: minor, currency: 'try' }),
                              }).then(() => {
                                void loadAdminCats();
                                void loadCategories();
                              });
                            }}
                            className={cn(
                              'w-[140px] rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white',
                              bodyFont,
                            )}
                            inputMode="numeric"
                            pattern="[0-9]*"
                          />{' '}
                          TRY
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="checkbox"
                            checked={Boolean(c.active)}
                            onChange={(e) => {
                              const active = e.target.checked ? 1 : 0;
                              void fetch(`/api/admin/booking-categories/${c.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ active }),
                              }).then(() => {
                                void loadAdminCats();
                                void loadCategories();
                              });
                            }}
                          />
                        </td>
                        <td className="py-2.5 pr-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm('Bu kategoriyi silmek istiyor musun?')) return;
                              void fetch(`/api/admin/booking-categories/${c.id}`, {
                                method: 'DELETE',
                                credentials: 'include',
                              }).then(() => {
                                void loadAdminCats();
                                void loadCategories();
                              });
                            }}
                            className={cn(
                              'rounded-full px-2.5 py-1 text-[11px] border border-red-200 bg-red-50 text-red-900 hover:bg-red-100',
                              labelFont,
                            )}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
