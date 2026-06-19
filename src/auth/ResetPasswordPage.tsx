import { useMemo, useState } from 'react';

function getTokenFromLocation() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

export function ResetPasswordPage() {
  const token = useMemo(() => getTokenFromLocation(), []);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = token.length > 10 && password.length >= 6 && password === password2 && status !== 'saving';

  return (
    <main className="min-h-screen px-6 py-16 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-2xl font-semibold font-serif text-[#051A24]">Şifreyi yenile</div>
        <div className="text-sm text-[#051A24]/70 mt-2">
          Yeni şifreni belirle. En az 6 karakter olmalı.
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <div className="text-xs font-medium text-[#051A24]/80 mb-2">Yeni şifre</div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="En az 6 karakter"
              autoFocus
            />
          </div>
          <div>
            <div className="text-xs font-medium text-[#051A24]/80 mb-2">Yeni şifre (tekrar)</div>
            <input
              type="password"
              value={password2}
              onChange={(e) => {
                setPassword2(e.target.value);
                setError(null);
              }}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Tekrar yaz"
            />
          </div>
        </div>

        {status === 'ok' ? (
          <div className="mt-4 text-sm text-[#051A24]">
            Şifren güncellendi. Bu sekmeyi kapatabilirsin.
          </div>
        ) : null}

        {error ? <div className="mt-4 text-xs text-red-600">{error}</div> : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={!canSubmit}
            className={
              canSubmit
                ? 'flex-1 rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition'
                : 'flex-1 rounded-full bg-black/10 text-[#051A24]/50 px-4 py-2 text-sm'
            }
            onClick={async () => {
              try {
                setStatus('saving');
                setError(null);
                const res = await fetch('/api/auth/reset', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token, newPassword: password }),
                });
                const data = (await res.json().catch(() => null)) as any;
                if (!res.ok || !data?.ok) {
                  setStatus('error');
                  setError('Link süresi dolmuş olabilir. Yeniden “Şifremi unuttum” deneyin.');
                  return;
                }
                setStatus('ok');
              } catch {
                setStatus('error');
                setError('Bir hata oluştu. Tekrar deneyin.');
              }
            }}
          >
            {status === 'saving' ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
          </button>
          <a
            className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
            href="/"
          >
            Ana sayfa
          </a>
        </div>
      </div>
    </main>
  );
}

