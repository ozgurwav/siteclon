import { useMemo } from 'react';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';

function getQueryParam(name: string) {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

export function PaymentCancelPage() {
  const bookingId = useMemo(() => getQueryParam('booking_id') || '', []);

  return (
    <main className={cn('min-h-screen bg-[#F4F5F6] text-[#051A24] antialiased')}>
      <div className="max-w-xl mx-auto px-5 py-12">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-5 md:p-6">
          <h1 className="font-serif font-semibold text-2xl tracking-tight">Ödeme iptal edildi</h1>
          <p className="mt-3 text-sm text-[#051A24]/75">
            İstersen tekrar deneyebilirsin. Rezervasyon numarası: <span className="font-medium">{bookingId || '—'}</span>
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              variant="primary"
              onClick={() => {
                window.location.assign('/calendar');
              }}
            >
              Tekrar dene
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
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

