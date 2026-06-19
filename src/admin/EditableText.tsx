import { useMemo, useState } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from './AdminContext';
import { useEditableAsset } from './assets';

type EditableTextProps = {
  assetKey: string;
  defaultValue: string;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  multiline?: boolean;
  rich?: boolean;
  /** Preserve leading/trailing spaces (HTML would normally collapse them). */
  preserveEdgeSpaces?: boolean;
  /** If true, show a font picker and apply chosen font. */
  allowFontPick?: boolean;
  /** Optional asset key to store chosen font (defaults to `${assetKey}.font.v1`). */
  fontAssetKey?: string;
};

function parseRichText(input: string): Array<string | { type: 'serif' | 'mono' | 'italic'; text: string }> {
  // Supported tags: [[serif]]...[[/serif]], [[mono]]...[[/mono]], [[italic]]...[[/italic]]
  const out: Array<string | { type: 'serif' | 'mono' | 'italic'; text: string }> = [];
  const s = input || '';
  const re = /\[\[(serif|mono|italic)\]\]([\s\S]*?)\[\[\/\1\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push({ type: m[1] as any, text: m[2] || '' });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function wrapSelection(
  text: string,
  selStart: number | null,
  selEnd: number | null,
  tag: 'serif' | 'mono' | 'italic',
): { next: string; cursor: number } {
  if (selStart == null || selEnd == null) return { next: text, cursor: text.length };
  const a = Math.min(selStart, selEnd);
  const b = Math.max(selStart, selEnd);
  const open = `[[${tag}]]`;
  const close = `[[/${tag}]]`;
  const next = text.slice(0, a) + open + text.slice(a, b) + close + text.slice(b);
  return { next, cursor: b + open.length + close.length };
}

export function EditableText({
  assetKey,
  defaultValue,
  className,
  as = 'span',
  multiline = false,
  rich = false,
  preserveEdgeSpaces = false,
  allowFontPick = false,
  fontAssetKey,
}: EditableTextProps) {
  const { isAdmin } = useAdmin();
  const { value, setValue, reset } = useEditableAsset(assetKey, defaultValue);
  const fontKey = fontAssetKey || `${assetKey}.font.v1`;
  const { value: fontValue, setValue: setFontValue, reset: resetFont } = useEditableAsset(fontKey, 'default');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const Tag = as as any;
  const canPortal = typeof document !== 'undefined';
  const fontClass =
    fontValue === 'serif'
      ? 'font-serif'
      : fontValue === 'mono'
        ? 'font-mono'
        : fontValue === 'italic'
          ? 'italic'
          : '';
  const modal = useMemo(() => {
    if (!open || !canPortal) return null;
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center px-6">
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div
          className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-lg font-semibold text-[#051A24]">Metin düzenle</div>
              <div className="text-xs text-[#051A24]/70 mt-1">{assetKey}</div>
            </div>
            <button
              type="button"
              className="text-[#051A24]/60 hover:text-[#051A24] px-2"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          {allowFontPick ? (
            <div className="mb-3">
              <div className="text-xs font-medium text-[#051A24]/80 mb-2">Font</div>
              <select
                value={fontValue}
                onChange={(e) => setFontValue(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
              >
                <option value="default">Varsayılan</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
                <option value="italic">Italic</option>
              </select>
            </div>
          ) : null}

          {rich ? (
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs font-medium text-[#051A24]/80 mb-2">Kelime bazlı stil</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {(['serif', 'mono', 'italic'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      const el = document.getElementById(`editable-${assetKey}`) as HTMLTextAreaElement | null;
                      if (!el) return;
                      const { next } = wrapSelection(draft, el.selectionStart, el.selectionEnd, t);
                      setDraft(next);
                      // keep focus
                      setTimeout(() => el.focus(), 0);
                    }}
                  >
                    {t === 'serif' ? 'Serif' : t === 'mono' ? 'Mono' : 'Italic'}
                  </button>
                ))}
              </div>
              <textarea
                id={`editable-${assetKey}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={multiline ? 6 : 3}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-y"
                autoFocus
              />
              <div className="text-[11px] text-[#051A24]/60 mt-2">
                Örn: <span className="font-mono">[[serif]]kelime[[/serif]]</span>
              </div>
            </div>
          ) : multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-y"
              autoFocus
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              autoFocus
            />
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
              onClick={() => {
                setValue(draft);
                setOpen(false);
              }}
            >
              Kaydet
            </button>
            <button
              type="button"
              className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
              onClick={() => {
                reset();
                if (allowFontPick) resetFont();
                setOpen(false);
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
              onClick={() => setOpen(false)}
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    );
  }, [allowFontPick, assetKey, canPortal, draft, fontValue, multiline, open, reset, resetFont, setFontValue, setValue]);

  const richParts = rich ? parseRichText(value) : null;
  const displayValue = useMemo(() => {
    if (!preserveEdgeSpaces) return value;
    // Convert edge spaces to NBSP so "I left" vs "I left " stays distinct.
    const s = value ?? '';
    const leading = (s.match(/^\s+/) || [''])[0];
    const trailing = (s.match(/\s+$/) || [''])[0];
    const core = s.slice(leading.length, s.length - trailing.length);
    return `${leading.replace(/ /g, '\u00A0')}${core}${trailing.replace(/ /g, '\u00A0')}`;
  }, [preserveEdgeSpaces, value]);

  return (
    <span className="relative inline-flex group align-baseline">
      <Tag className={[className, allowFontPick ? fontClass : ''].filter(Boolean).join(' ')}>
        {richParts
          ? richParts.map((p, i) => {
              if (typeof p === 'string') return <span key={i}>{p}</span>;
              const cls =
                p.type === 'serif'
                  ? 'font-serif'
                  : p.type === 'mono'
                    ? 'font-mono'
                    : 'italic';
              return (
                <span key={i} className={cls}>
                  {p.text}
                </span>
              );
            })
          : displayValue}
      </Tag>

      {isAdmin ? (
        <>
          <span className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition">
            <span
              role="button"
              tabIndex={0}
              className="cursor-pointer select-none rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium shadow hover:bg-white border border-black/10 inline-flex items-center"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraft(value);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraft(value);
                  setOpen(true);
                }
              }}
            >
              Düzenle
            </span>
          </span>

          {open && canPortal && modal ? createPortal(modal, document.body) : null}
        </>
      ) : null}
    </span>
  );
}

