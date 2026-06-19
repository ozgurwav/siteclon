import { ArrowUpRight } from 'lucide-react';
import { FooterMap } from './FooterMap';
import { readJsonAsset } from '../admin/assets';
import { useAdmin } from '../admin/AdminContext';
import type { FooterLinksConfig, FooterLinkItem } from '../lib/footerLinks';
import { footerLinkOpensNewTab, resolveFooterLinkHref } from '../lib/footerLinks';

function filterEnabled(items: FooterLinkItem[] | undefined): FooterLinkItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter((it) => it && it.enabled !== false);
}

function FooterLinkAnchor({ it }: { it: FooterLinkItem }) {
  const href = resolveFooterLinkHref(it);
  const newTab = footerLinkOpensNewTab(it);
  return (
    <a
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className="text-base text-[#051A24] hover:opacity-70 transition-opacity"
    >
      {it.label}
    </a>
  );
}

export function Footer() {
  const { assetsVersion } = useAdmin();

  const columns = (() => {
    void assetsVersion;
    const stored = readJsonAsset<FooterLinksConfig>('footer.links');
    if (stored?.columns?.length) return stored.columns;
    return [
      {
        id: 'primary',
        items: [
          { id: 'services', label: 'Services', href: '#', enabled: true },
          { id: 'work', label: 'Work', href: '#', enabled: true },
          { id: 'about', label: 'About', href: '#', enabled: true },
        ],
      },
      {
        id: 'social',
        items: [
          { id: 'x', label: 'x.com', href: 'https://x.com', enabled: true },
          { id: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com', enabled: true },
        ],
      },
    ] satisfies FooterLinksConfig['columns'];
  })();

  return (
    <footer className="w-full py-12 px-6 max-w-[1200px] mx-auto flex flex-col gap-10">
      <div className="flex flex-col md:flex-row justify-between items-start gap-12 w-full">
        <div className="flex flex-col md:flex-row gap-12 md:gap-24 items-start w-full md:w-auto">
          <ArrowUpRight className="w-6 h-6 text-[#051A24] hidden md:block" />

          {columns
            .filter((c) => c?.items?.some((it) => it && it.enabled !== false))
            .map((col) => (
              <div key={col.id} className="flex flex-col gap-4">
                {filterEnabled(col.items).map((it) => (
                  <FooterLinkAnchor key={it.id} it={it} />
                ))}
              </div>
            ))}

          <FooterMap />
        </div>
      </div>

    </footer>
  );
}
