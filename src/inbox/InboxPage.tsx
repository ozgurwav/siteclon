import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus, Send, Trash2 } from 'lucide-react';
import { useAdmin } from '../admin/AdminContext';

type ThreadRow = {
  id: number;
  subject: string;
  status?: string;
  updated_at?: string;
  created_at?: string;
  owner_email?: string;
  owner_name?: string;
};

type MessageRow = {
  id: number;
  sender_role: 'admin' | 'staff' | 'customer';
  body: string;
  created_at: string;
};

function roleLabel(r: string) {
  if (r === 'admin') return 'Yönetici';
  if (r === 'staff') return 'Personel';
  return 'Müşteri';
}

export function InboxPage() {
  const { role } = useAdmin();
  const isAdminView = role === 'admin';

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [newThreadBodyDraft, setNewThreadBodyDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedThread = useMemo(() => threads.find((t) => t.id === selectedId) || null, [selectedId, threads]);

  const loadThreads = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/threads${isAdminView && showAll ? '?all=1' : ''}`);
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error('Gelen kutusu alınamadı (giriş gerekli).');
      setThreads((data.threads || []) as ThreadRow[]);
    } catch (e: any) {
      setError(e?.message || 'Hata');
    } finally {
      setLoading(false);
    }
  };

  const loadThread = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/threads/${id}`);
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error('Konuşma alınamadı.');
      setSelectedId(id);
      setMessages((data.messages || []) as MessageRow[]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    } catch (e: any) {
      setError(e?.message || 'Hata');
    } finally {
      setLoading(false);
    }
  };

  const deleteThread = async (id: number) => {
    if (!window.confirm('Bu konuşma ve içindeki mesajlar silinsin mi? Bu işlem geri alınamaz.')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/threads/${id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error('Konuşma silinemedi.');
      setThreads((prev) => prev.filter((t) => Number(t.id) !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Silme hatası');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadThreads();
  }, [isAdminView, showAll]);

  useEffect(() => {
    if (!selectedId) return;
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
  }, [messages.length, selectedId]);

  return (
    <main className="min-h-screen bg-[#F6F7F8]">
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-sm text-[#051A24]/70 hover:text-[#051A24]">
              <ChevronLeft className="h-4 w-4" />
              Anasayfa
            </a>
            <div className="mt-3 text-[28px] md:text-[34px] font-semibold text-[#0D212C] tracking-tight">Gelen kutusu</div>
            <div className="text-sm text-[#0D212C]/70 mt-1">
              {isAdminView ? 'Tüm müşterilerle konuşmalar' : 'Taleplerin ve dosya teslimlerin'}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <button
              type="button"
              className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
              onClick={loadThreads}
            >
              {loading ? 'Yükleniyor…' : 'Yenile'}
            </button>

            {isAdminView ? (
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Aktifleri göster' : 'Hepsini görüntüle'}
              </button>
            ) : null}

            <div className="flex gap-2 flex-wrap items-center">
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 min-w-[240px]"
                placeholder="Yeni konu (örn: Albüm teslimi)"
              />
              <input
                value={newThreadBodyDraft}
                onChange={(e) => setNewThreadBodyDraft(e.target.value)}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 min-w-[320px]"
                placeholder="İlk mesaj (zorunlu)"
              />
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition inline-flex items-center gap-2"
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    if (!newThreadBodyDraft.trim()) throw new Error('İlk mesaj zorunlu.');
                    const res = await fetch('/api/inbox/threads', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subject: subjectDraft || 'Talep', body: newThreadBodyDraft.trim() }),
                    });
                    const data = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !data?.ok) throw new Error('Konu açılamadı.');
                    setSubjectDraft('');
                    setNewThreadBodyDraft('');
                    await loadThreads();
                    if (data.thread?.id) await loadThread(Number(data.thread.id));
                  } catch (e: any) {
                    setError(e?.message || 'Hata');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                Konu aç
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* Threads */}
          <div className="rounded-2xl bg-white border border-black/10 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-black/10">
              <div className="text-sm font-semibold text-[#051A24]">Konular</div>
              <div className="text-xs text-[#051A24]/60 mt-1">Son 200</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {threads.length ? (
                <div className="divide-y divide-black/10">
                  {threads.map((t) => {
                    const threadId = Number(t.id);
                    const selected = selectedId === threadId;

                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        className={`w-full px-4 py-3 hover:bg-black/[0.02] transition ${
                          selected ? 'bg-black/[0.02]' : ''
                        }`}
                        onClick={() => void loadThread(threadId)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          void loadThread(threadId);
                        }}
                      >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-sm font-medium text-[#051A24] line-clamp-2">{t.subject || 'Talep'}</div>
                          {isAdminView && (t.owner_email || t.owner_name) ? (
                            <div className="text-xs text-[#051A24]/60 mt-1">
                              {t.owner_name ? `${t.owner_name} • ` : ''}
                              {t.owner_email || ''}
                            </div>
                          ) : null}
                          <div className="text-[11px] text-[#051A24]/50 mt-1">{t.updated_at || t.created_at || ''}</div>
                        </div>
                        {isAdminView ? (
                          <div className="shrink-0 flex items-center gap-2">
                            <select
                            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-black/10"
                            value={t.status === 'solved' ? 'answered' : 'awaiting'}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={async (e) => {
                              e.stopPropagation();
                              const v = e.target.value;
                              setLoading(true);
                              setError(null);
                              try {
                                const res = await fetch(`/api/inbox/threads/${t.id}/status`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: v }),
                                });
                                const data = (await res.json().catch(() => null)) as any;
                                if (!res.ok || !data?.ok) throw new Error('Durum güncellenemedi.');
                                await loadThreads();
                              } catch (e2: any) {
                                setError(e2?.message || 'Hata');
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            <option value="awaiting">Cevap bekleniyor</option>
                            <option value="answered">Cevap verildi</option>
                            </select>
                            <button
                              type="button"
                              className="rounded-full border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 active:scale-95 transition"
                              title="Konuşmayı sil"
                              aria-label="Konuşmayı sil"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteThread(threadId);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-[#051A24]/60">Henüz konu yok.</div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="rounded-2xl bg-white border border-black/10 overflow-hidden shadow-sm flex flex-col min-h-[70vh]">
            <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#051A24]">{selectedThread ? selectedThread.subject : 'Bir konu seç'}</div>
                {selectedThread && isAdminView && (selectedThread.owner_email || selectedThread.owner_name) ? (
                  <div className="text-xs text-[#051A24]/60 mt-1">
                    {selectedThread.owner_name ? `${selectedThread.owner_name} • ` : ''}
                    {selectedThread.owner_email || ''}
                  </div>
                ) : null}
              </div>
              {/* Attachments are intentionally disabled for now (serverless). */}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FBFBFC]">
              {selectedId ? (
                messages.length ? (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[78%] rounded-2xl border border-black/10 px-4 py-3 text-sm shadow-sm ${
                        m.sender_role === 'customer' ? 'bg-white ml-0' : 'bg-[#051A24] text-white ml-auto border-[#051A24]'
                      }`}
                    >
                      <div className={`text-[11px] mb-1 ${m.sender_role === 'customer' ? 'text-[#051A24]/60' : 'text-white/70'}`}>
                        {roleLabel(m.sender_role)} • {m.created_at}
                      </div>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-[#051A24]/60">Henüz mesaj yok.</div>
                )
              ) : (
                <div className="text-sm text-[#051A24]/60">Soldan bir konu seç.</div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-black/10 bg-white">
              <div className="flex gap-2 items-end">
                <textarea
                  value={bodyDraft}
                  onChange={(e) => setBodyDraft(e.target.value)}
                  className="flex-1 rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10 min-h-[52px] max-h-[180px] resize-y"
                  placeholder={selectedId ? 'Mesaj yaz…' : 'Önce konu seç…'}
                  disabled={!selectedId}
                />
                <button
                  type="button"
                  className="rounded-full bg-[#051A24] text-white px-4 py-3 text-sm shadow hover:opacity-90 active:scale-95 transition inline-flex items-center gap-2 disabled:opacity-40"
                  disabled={!selectedId || !bodyDraft.trim() || loading}
                  onClick={async () => {
                    if (!selectedId) return;
                    const body = bodyDraft.trim();
                    if (!body) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await fetch(`/api/inbox/threads/${selectedId}/messages`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ body }),
                      });
                      const data = (await res.json().catch(() => null)) as any;
                      if (!res.ok || !data?.ok) throw new Error('Gönderilemedi.');
                      setBodyDraft('');
                      await loadThread(selectedId);
                      await loadThreads();
                    } catch (e: any) {
                      setError(e?.message || 'Hata');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  <Send className="h-4 w-4" />
                  Gönder
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
