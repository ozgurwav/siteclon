import { useEffect, useState } from 'react';
import { ChevronLeft, KeyRound, Mail } from 'lucide-react';
import { useAdmin } from '../admin/AdminContext';

export function AccountPage() {
  const { role } = useAdmin();
  const [meEmail, setMeEmail] = useState<string>('');
  const [meName, setMeName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [pw1Email, setPw1Email] = useState('');
  const [pw2Email, setPw2Email] = useState('');

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [newPw1, setNewPw1] = useState('');
  const [newPw2, setNewPw2] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok || !data?.ok) return;
        setMeEmail(String(data.user?.email || ''));
        setMeName(String(data.user?.name || ''));
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[#F6F7F8]">
      <div className="px-6 py-6 max-w-4xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-[#051A24]/70 hover:text-[#051A24]">
          <ChevronLeft className="h-4 w-4" />
          Anasayfa
        </a>

        <div className="mt-4 text-[28px] md:text-[34px] font-semibold text-[#0D212C] tracking-tight">Hesap ayarları</div>
        <div className="text-sm text-[#0D212C]/70 mt-1">
          {role === 'guest' ? 'Devam etmek için giriş yap.' : `Hesap: ${meName || '—'} • ${meEmail || '—'}`}
        </div>

        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
        {okMsg ? <div className="mt-4 text-sm text-green-700">{okMsg}</div> : null}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-black/10 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-black/10 flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#051A24]/70" />
              <div className="text-sm font-semibold text-[#051A24]">Mail değiştir</div>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Yeni email"
                inputMode="email"
              />
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={pw1Email}
                  onChange={(e) => setPw1Email(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Mevcut şifre"
                  type="password"
                />
                <input
                  value={pw2Email}
                  onChange={(e) => setPw2Email(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Mevcut şifre (tekrar)"
                  type="password"
                />
              </div>
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition disabled:opacity-40"
                disabled={loading || role === 'guest'}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  setOkMsg(null);
                  try {
                    const res = await fetch('/api/account/email', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ newEmail, password1: pw1Email, password2: pw2Email }),
                    });
                    const data = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !data?.ok) throw new Error('Mail değiştirilemedi.');
                    setOkMsg('Mail güncellendi.');
                    setMeEmail(newEmail.trim().toLowerCase());
                    setNewEmail('');
                    setPw1Email('');
                    setPw2Email('');
                  } catch (e: any) {
                    setError(e?.message || 'Hata');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Kaydet
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-black/10 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-black/10 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#051A24]/70" />
              <div className="text-sm font-semibold text-[#051A24]">Şifre değiştir</div>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Mevcut şifre"
                  type="password"
                />
                <input
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Mevcut şifre (tekrar)"
                  type="password"
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <input
                  value={newPw1}
                  onChange={(e) => setNewPw1(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Yeni şifre"
                  type="password"
                />
                <input
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Yeni şifre (tekrar)"
                  type="password"
                />
              </div>

              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition disabled:opacity-40"
                disabled={loading || role === 'guest'}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  setOkMsg(null);
                  try {
                    const res = await fetch('/api/account/password', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        password1: pw1,
                        password2: pw2,
                        newPassword1: newPw1,
                        newPassword2: newPw2,
                      }),
                    });
                    const data = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !data?.ok) throw new Error('Şifre değiştirilemedi.');
                    setOkMsg('Şifre güncellendi.');
                    setPw1('');
                    setPw2('');
                    setNewPw1('');
                    setNewPw2('');
                  } catch (e: any) {
                    setError(e?.message || 'Hata');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

