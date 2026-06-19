import { Trash2 } from 'lucide-react';
import type { FooterLinkItem } from '../lib/footerLinks';
import {
  footerLinkKind,
  isValidLegalSlug,
  resolveFooterLinkHref,
  suggestFooterHref,
  suggestLegalSlug,
} from '../lib/footerLinks';

type Props = {
  item: FooterLinkItem;
  onPatch: (patch: Partial<FooterLinkItem>) => void;
  onRemove: () => void;
};

export function FooterLinkItemEditor({ item, onPatch, onRemove }: Props) {
  const isContract = footerLinkKind(item) === 'contract';
  const slugInvalid =
    isContract && Boolean((item.legalSlug || '').trim()) && !isValidLegalSlug(String(item.legalSlug || '').trim());

  function openPreview() {
    const href = resolveFooterLinkHref(item);
    if (href === '#') return;
    const full = href.startsWith('/') ? `${window.location.origin}${href}` : href;
    window.open(full, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="rounded-xl border border-black/10 p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-[#051A24]/70 inline-flex items-center gap-1.5 select-none shrink-0">
          <input
            type="checkbox"
            checked={item.enabled !== false}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
          />
          Aktif
        </label>
        <select
          value={isContract ? 'contract' : 'url'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'contract') {
              const nextSlug =
                item.legalSlug && isValidLegalSlug(item.legalSlug.trim())
                  ? item.legalSlug.trim()
                  : suggestLegalSlug(item.label, item.id);
              onPatch({ kind: 'contract', legalSlug: nextSlug, href: undefined });
            } else {
              onPatch({
                kind: 'url',
                href: suggestFooterHref(item.label, item.href),
                legalSlug: undefined,
              });
            }
          }}
          className="flex-1 min-w-0 rounded-lg border border-black/10 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/10 bg-white"
        >
          <option value="url">Özel URL</option>
          <option value="contract">Sözleşme</option>
        </select>
        <button
          type="button"
          className="rounded-full bg-white text-[#051A24] p-1.5 border border-black/10 hover:bg-black/[0.02] active:scale-95 transition shrink-0"
          onClick={onRemove}
          title="Sil"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        value={item.label}
        onChange={(e) => {
          const label = e.target.value;
          const patch: Partial<FooterLinkItem> = { label };
          if (footerLinkKind(item) === 'contract') {
            const cur = String(item.legalSlug || '').trim();
            const fromLabel = suggestLegalSlug(label, item.id);
            if (!cur || cur === suggestLegalSlug(item.label, item.id)) {
              patch.legalSlug = fromLabel;
            }
          } else {
            const cur = String(item.href || '').trim();
            const fromLabel = suggestFooterHref(item.label, item.href);
            if (!cur || cur === '#' || cur === fromLabel || cur === suggestFooterHref(item.label)) {
              patch.href = suggestFooterHref(label, item.href);
            }
          }
          onPatch(patch);
        }}
        className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10 mb-2"
        placeholder="Menü metni"
      />

      {isContract ? (
        <>
          <input
            value={item.legalSlug || ''}
            onChange={(e) => onPatch({ legalSlug: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/10 font-mono"
            placeholder="mesafeli-satis"
          />
          {slugInvalid ? (
            <p className="text-[10px] text-red-600 mt-1">Küçük harf, rakam ve tire.</p>
          ) : (
            <p className="text-[10px] text-[#051A24]/50 mt-1 font-mono">/legal/{(item.legalSlug || 'slug').trim() || '…'}</p>
          )}
          <button
            type="button"
            onClick={openPreview}
            disabled={!isValidLegalSlug(String(item.legalSlug || '').trim())}
            className="mt-2 rounded-full bg-[#F4F5F6] text-[#051A24] px-2.5 py-1 text-[10px] border border-black/10 hover:bg-black/[0.04] disabled:opacity-40"
          >
            Önizle
          </button>
        </>
      ) : (
        <input
          value={item.href ?? ''}
          onChange={(e) => onPatch({ href: e.target.value })}
          className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/10 font-mono"
          placeholder="https://instagram.com/…"
        />
      )}
    </div>
  );
}
