import { useMemo } from 'react';
import { useAdmin } from '../admin/AdminContext';
import { readJsonAsset } from '../admin/assets';
import { normalizeHomeMediaLayout, type HomeMediaBlock } from '../lib/homeMediaLayout';
import { HOMEPAGE_PROJECT_ROWS } from '../lib/defaultSiteMedia';
import { PricingSection } from './PricingSection';
import { TestimonialCarousel } from './TestimonialCarousel';
import { PartnerSection } from './PartnerSection';
import { ProjectMediaRow } from './ProjectsSection';
import { MarqueeStrip } from './MarqueeStrip';
import { SalesBannerSection } from './SalesBannerSection';
import { TrustedLogosSection } from './TrustedLogosSection';
import { FaqSection } from './FaqSection';
import { TestimonialSection } from './TestimonialSection';

const LAYOUT_KEY = 'site.home.mediaLayout';

export function HomeMediaSections() {
  const { assetsVersion } = useAdmin();

  const blocks = useMemo(() => {
    void assetsVersion;
    const raw = readJsonAsset<HomeMediaBlock[]>(LAYOUT_KEY);
    return normalizeHomeMediaLayout(raw);
  }, [assetsVersion]);

  return (
    <>
      {blocks.map((b) => {
        if (b.type === 'marquee') return <MarqueeStrip key={b.id} blockId={b.id} />;
        if (b.type === 'pricing') return <PricingSection key={b.id} />;
        if (b.type === 'carousel') return <TestimonialCarousel key={b.id} />;
        if (b.type === 'partner') return <PartnerSection key={b.id} blockId={b.id} />;
        if (b.type === 'salesBanner') return <SalesBannerSection key={b.id} blockId={b.id} />;
        if (b.type === 'trustedLogos') return <TrustedLogosSection key={b.id} blockId={b.id} />;
        if (b.type === 'faq') return <FaqSection key={b.id} />;
        if (b.type === 'people') return <TestimonialSection key={b.id} />;
        const row = HOMEPAGE_PROJECT_ROWS.find((r) => r.id === b.projectId);
        if (!row) return null;
        return <ProjectMediaRow key={b.id} row={row} />;
      })}
    </>
  );
}
