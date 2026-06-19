import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';

/** BookingCalendarPage ile aynı olmalı. */
const IYZICO_PAYMENT_PAID_MESSAGE = 'aiag:iyzico-payment-paid';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; paid: boolean; status: string; bookingId: number | null; source: 'stripe' | 'iyzico' }
  | { kind: 'err'; message: string };

export function PaymentSuccessPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [sessionId, setSessionId] = useState('');
  const [paymentReceiptId, setPaymentReceiptId] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;

    async function run() {
      let sp: URLSearchParams;
      try {
        sp = new URLSearchParams(window.location.search);
      } catch {
        if (!cancelled) setState({ kind: 'err', message: 'Geçersiz ödeme bağlantısı.' });
        return;
      }

      const prId = sp.get('payment_request_id') || '';
      const sid = sp.get('session_id') || '';
      if (!cancelled) {
        setPaymentReceiptId(prId);
        setSessionId(sid);
      }

      if (prId) {
        try {
          const url = `/api/payments/receipt?id=${encodeURIComponent(prId)}`;
          const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
          const data = (await res.json().catch(() => null)) as any;
          if (!res.ok || !data?.ok) throw new Error('Ödeme kaydı doğrulanamadı.');
          const paid = Boolean(data.paid);
          const bookingId = data?.booking_id != null ? Number(data.booking_id) : null;
          const status = paid ? 'paid' : String(data?.status || 'unknown');
          if (!cancelled)
            setState({
              kind: 'ok',
              paid,
              status,
              bookingId: Number.isFinite(bookingId) ? bookingId : null,
              source: 'iyzico',
            });
        } catch (e: any) {
          if (ctrl.signal.aborted || cancelled) return;
          const msg = e?.name === 'AbortError' ? 'İstek zaman aşımına uğradı veya iptal edildi.' : String(e?.message || 'Bir hata oluştu.');
          if (!cancelled) setState({ kind: 'err', message: msg });
        }
        return;
      }

      if (sid) {
        try {
          const res = await fetch(`/api/payments/stripe/session/${encodeURIComponent(sid)}`, {
            credentials: 'include',
            signal: ctrl.signal,
          });
          const data = (await res.json().catch(() => null)) as any;
          if (!res.ok || !data?.ok) throw new Error('Ödeme doğrulanamadı.');
          const paid = String(data?.session?.payment_status || '') === 'paid' || String(data?.payment?.status || '') === 'paid';
          const bookingId = data?.payment?.booking_id != null ? Number(data.payment.booking_id) : null;
          const status = String(data?.payment?.status || data?.session?.payment_status || 'unknown');
          if (!cancelled)
            setState({
              kind: 'ok',
              paid,
              status,
              bookingId: Number.isFinite(bookingId) ? bookingId : null,
              source: 'stripe',
            });
        } catch (e: any) {
          if (ctrl.signal.aborted || cancelled) return;
          const msg = e?.name === 'AbortError' ? 'İstek zaman aşımına uğradı veya iptal edildi.' : String(e?.message || 'Bir hata oluştu.');
          if (!cancelled) setState({ kind: 'err', message: msg });
        }
        return;
      }

      if (!cancelled) setState({ kind: 'err', message: 'Geçersiz ödeme bağlantısı.' });
    }

    const t = window.setTimeout(() => ctrl.abort(), 25_000);
    void run().finally(() => window.clearTimeout(t));
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, []);

  useEffect(() => {
    if (state.kind !== 'ok') return;
    document.title = state.paid ? 'Ödeme alındı' : 'Ödeme sonucu';
    return () => {
      document.title = 'My Google AI Studio App';
    };
  }, [state]);

  useEffect(() => {
    if (state.kind !== 'ok' || !state.paid || state.source !== 'iyzico') return;
    const prNum = Number(paymentReceiptId);
    if (!Number.isFinite(prNum) || prNum <= 0) return;

    const tid = window.setTimeout(() => {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: IYZICO_PAYMENT_PAID_MESSAGE,
              paid: true,
              paymentRequestId: prNum,
              bookingId: state.bookingId ?? null,
            },
            window.location.origin,
          );
          window.opener.focus?.();
          window.close();
        }
      } catch {
        /* opener / postMessage engellenmiş olabilir */
      }
    }, 120);

    return () => window.clearTimeout(tid);
  }, [state, paymentReceiptId]);

  const hasOpener = typeof window !== 'undefined' && Boolean(window.opener && !window.opener.closed);
  const showOpenerHint = state.kind === 'ok' && state.paid && state.source === 'iyzico' && hasOpener;

  return (
    <main className={cn('min-h-screen bg-[#F4F5F6] text-[#051A24] antialiased')}>
      <div className="max-w-xl mx-auto px-5 py-12">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-5 md:p-6">
          <h1 className="font-serif font-semibold text-2xl tracking-tight">Ödeme sonucu</h1>
          {state.kind === 'loading' ? (
            <p className="mt-3 text-sm text-[#051A24]/70">Kontrol ediliyor…</p>
          ) : state.kind === 'err' ? (
            <p className="mt-3 text-sm text-red-700">{state.message}</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-[#051A24]/80">
                Durum: <span className="font-medium">{state.paid ? 'Ödendi' : state.status}</span>
              </p>
              {state.source === 'stripe' ? (
                <p className="mt-2 text-xs text-[#051A24]/60 break-all">Oturum: {sessionId}</p>
              ) : (
                <p className="mt-2 text-xs text-[#051A24]/60 break-all">Makbuz: #{paymentReceiptId}</p>
              )}
              {state.bookingId ? (
                <p className="mt-2 text-xs text-[#051A24]/60">Rezervasyon: #{state.bookingId}</p>
              ) : null}
              {showOpenerHint ? (
                <p className="mt-3 text-xs text-[#051A24]/55">Takvim sekmesine geçiriliyor; bu pencere kapanacak.</p>
              ) : null}
            </>
          )}

          <div className="mt-5 flex gap-3">
            <Button
              variant="primary"
              onClick={() => {
                if (window.opener && !window.opener.closed) {
                  try {
                    window.opener.focus?.();
                  } catch {
                    /* ignore */
                  }
                  window.close();
                  return;
                }
                window.location.assign('/calendar');
              }}
            >
              Takvime dön
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (window.opener && !window.opener.closed) {
                  try {
                    window.opener.location.assign('/');
                  } catch {
                    /* ignore */
                  }
                  try {
                    window.opener.focus?.();
                  } catch {
                    /* ignore */
                  }
                  window.close();
                  return;
                }
                window.location.assign('/');
              }}
            >
              Ana sayfa
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

