import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, LogOut, PanelTop, Plus, Trash2 } from 'lucide-react';
import { useAdmin } from './AdminContext';
import {
  DEFAULT_LOOP_MEDIA_URLS,
  DEFAULT_SALES_BANNER_MEDIA,
  HOMEPAGE_PROJECT_ROWS,
  WEDDING_PHOTO_URLS,
  WEDDING_PORTRAIT_URLS,
} from '../lib/defaultSiteMedia';
import {
  clearAsset,
  fileToDataUrl,
  readAsset,
  readJsonAsset,
  useEditableAsset,
  writeAsset,
  writeJsonAsset,
} from './assets';
import {
  DEFAULT_HOME_MEDIA_LAYOUT,
  newHomeBlockId,
  normalizeHomeMediaLayout,
  type HomeMediaBlock,
} from '../lib/homeMediaLayout';
import { EditableText } from './EditableText';
import type { FooterLinksConfig } from '../lib/footerLinks';
import { FooterLinkItemEditor } from './FooterLinkItemEditor';
import {
  SAFE_SITE_LINK_TARGETS,
  SITE_LINK_TARGETS,
  collectNavigableSiteTargets,
  normalizeSiteHref,
  siteTargetSelectValue,
} from '../lib/siteLinks';
import {
  normalizeNavHref,
  packagesHref,
  resolveToolbarItemsToHref,
  slugifyToolbarScope,
  toolbarSlugFromLabel,
} from '../lib/siteRoutes';
import { waMeDigits, waMeUrl } from '../lib/whatsapp';

type ToolbarLinkItem = {
  id: string;
  type: 'link';
  label: string;
  href: string;
  enabled: boolean;
  /**
   * Optional submenu items attached to a "link button".
   * If empty: behaves like a plain anchor with `href`.
   *
   * If non-empty:
   * - `flat`: keep items only for configuring targets (no submenu UI by default)
   * - `dropdown`: render a submenu
   * - `link`: single-anchor behavior targeting first enabled item unless overridden (`itemsHref`)
   */
  mode?: 'flat' | 'dropdown' | 'link';
  /** Override click target when `mode==='link'` and items exist. */
  itemsHref?: string;
  pageTemplate?: 'portfolio' | 'partners' | 'packages' | 'banner' | 'poster';
  items?: Array<
    | {
        id: string;
        type?: 'link';
        label: string;
        href: string;
        enabled: boolean;
      }
    | {
        id: string;
        type: 'gallery';
        label: string;
        enabled: boolean;
        galleryKind: 'photo' | 'video' | 'mixed';
        galleryLayout?: 'masonry' | 'edge' | 'film';
      }
    | {
        id: string;
        type: 'packages';
        label: string;
        enabled: boolean;
        packagesKind: 'all' | 'banner' | 'poster';
        packagesScope?: string;
      }
  >;
};

type ToolbarMenuItem = {
  id: string;
  type: 'menu';
  label: string;
  enabled: boolean;
  /** Dropdown (default) or behave like a normal button link. */
  mode?: 'dropdown' | 'link';
  /** Used when mode='link'. If empty, we fall back to first enabled item. */
  href?: string;
  items: Array<
    | {
        id: string;
        type?: 'link';
        label: string;
        href: string;
        enabled: boolean;
      }
    | {
        id: string;
        type: 'gallery';
        label: string;
        enabled: boolean;
        galleryKind: 'photo' | 'video' | 'mixed';
        galleryLayout?: 'masonry' | 'edge' | 'film';
      }
    | {
        id: string;
        type: 'packages';
        label: string;
        enabled: boolean;
        packagesKind: 'all' | 'banner' | 'poster';
        packagesScope?: string;
      }
  >;
};

type ToolbarItemConfig = ToolbarLinkItem | ToolbarMenuItem;
type MediaHubSection = 'layout' | 'brand' | 'homeMedia' | 'promo' | 'advanced';

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalizeToolbarPageTemplate(raw: unknown): ToolbarLinkItem['pageTemplate'] | undefined {
  const v = String(raw || '').trim();
  if (v === 'portfolio' || v === 'partners' || v === 'packages') return v;
  if (v === 'banner' || v === 'poster') return 'packages';
  return undefined;
}

function normalizePackagesScope(raw: unknown, label: string): string | undefined {
  const direct = slugifyToolbarScope(String(raw || ''));
  if (direct) return direct;
  const l = String(label || '').trim().toLocaleLowerCase('tr-TR');
  if (!l || ['banner', 'afiş', 'afis', 'banner + afiş', 'banner + afis', 'banner / afiş', 'banner / afis'].includes(l)) {
    return undefined;
  }
  return slugifyToolbarScope(l) || undefined;
}

function collectToolbarHrefs(buttons: ToolbarItemConfig[], excludeId?: string) {
  const hrefs = new Set<string>();
  for (const b of buttons) {
    if (!b || b.id === excludeId) continue;
    if (b.type === 'link') {
      const href = String(b.href || '').trim();
      if (href) hrefs.add(href);
      for (const it of b.items || []) {
        const itemHref = String((it as any).href || '').trim();
        if (itemHref) hrefs.add(itemHref);
      }
    } else if (b.type === 'menu') {
      const href = String(b.href || '').trim();
      if (href) hrefs.add(href);
      for (const it of b.items || []) {
        const itemHref = String((it as any).href || '').trim();
        if (itemHref) hrefs.add(itemHref);
      }
    }
  }
  return hrefs;
}

function makeToolbarHrefFromLabel(label: string, buttons: ToolbarItemConfig[], currentId?: string) {
  const base = `/${toolbarSlugFromLabel(label)}`;
  const used = collectToolbarHrefs(buttons, currentId);
  if (!used.has(base)) return base;
  for (let i = 1; i < 1000; i += 1) {
    const next = `${base}-${i}`;
    if (!used.has(next)) return next;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function labelHomeMediaBlock(block: HomeMediaBlock, projectTitles?: Partial<Record<string, string>>): string {
  switch (block.type) {
    case 'marquee':
      return 'Marquee şeridi';
    case 'pricing':
      return 'Hizmetlerimiz';
    case 'carousel':
      return 'Müşteri yorumları';
    case 'partner':
      return 'Partner bölümü';
    case 'salesBanner':
      return 'Satış banner (medya + metin)';
    case 'trustedLogos':
      return 'Büyük markalar (logo grid/şerit)';
    case 'faq':
      return 'Sık sorulan sorular';
    case 'people':
      return 'Portre / ekip bloğu';
    case 'project': {
      const row = HOMEPAGE_PROJECT_ROWS.find((r) => r.id === block.projectId);
      const title = String(projectTitles?.[String(block.projectId || '')] || row?.title || block.projectId || '').trim();
      return title ? `Büyük proje (${title})` : `Proje (${block.projectId})`;
    }
    default:
      return String((block as { type?: string }).type || 'blok');
  }
}

export function AdminWidget() {
  const { role, isAdmin, login, signupCustomer, logout, adminEnabled, bumpAssetsVersion, assetsVersion } = useAdmin();
  const [open, setOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup' | 'forgot'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupCompany, setSignupCompany] = useState('');
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [footerLinksOpen, setFooterLinksOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [mediaHubOpen, setMediaHubOpen] = useState(false);
  const [mediaHubSection, setMediaHubSection] = useState<MediaHubSection>('layout');
  const [expandedHomeBlockId, setExpandedHomeBlockId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [toolbarError, setToolbarError] = useState<string | null>(null);
  const [expandedToolbarId, setExpandedToolbarId] = useState<string | null>(null);
  const [footerLinksError, setFooterLinksError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [users, setUsers] = useState<
    Array<{ id: number; email: string; name: string; role?: string; company: string | null; created_at: string }>
  >([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { value: authSupportEmail } = useEditableAsset('auth.supportEmail', 'hello@example.com');

  const title = useMemo(() => {
    if (!adminEnabled) return null;
    if (role === 'admin') return 'Yönetici';
    if (role === 'customer') return 'Müşteri';
    return 'Giriş yap / Kayıt ol';
  }, [adminEnabled, role]);

  if (!adminEnabled) return null;

  const pillClass =
    'rounded-full border border-white/18 bg-black/10 px-4 py-2 text-sm leading-none text-white/86 backdrop-blur-md hover:border-white/34 hover:text-white active:scale-95 transition';
  const navActionClass =
    'rounded-full border border-white/18 bg-black/10 px-4 py-2 text-sm leading-none text-white/86 backdrop-blur-md hover:border-white/34 hover:text-white active:scale-95 transition';

  const primaryNavItems = [
    { href: '#ana-sayfa', label: 'ANA SAYFA' },
    { href: '#koleksiyonlar', label: 'KOLEKSIYONLAR' },
    { href: '#halilar', label: 'HALILAR' },
    { href: '#perdeler', label: 'PERDELER' },
    { href: '#iletisim', label: 'ILETISIM' },
  ];

  const { value: calendarUrl } = useEditableAsset('admin.links.calendar', '/calendar');
  const { value: portfolioUrl } = useEditableAsset('admin.links.portfolio', '#');
  const { value: partnersUrl } = useEditableAsset('admin.links.partners', '#');
  // deprecated: kept only for backward compatibility of existing assets
  const { value: authEmailTo } = useEditableAsset('auth.signup.toEmail', 'hello@example.com');
  void authEmailTo;

  const { value: mapLat, setValue: setMapLat } = useEditableAsset('footer.map.lat', '41.0082');
  const { value: mapLng, setValue: setMapLng } = useEditableAsset('footer.map.lng', '28.9784');
  const { value: mapZoom, setValue: setMapZoom } = useEditableAsset('footer.map.zoom', '14');
  const { value: mapTitle, setValue: setMapTitle } = useEditableAsset('footer.map.title', 'Location');
  const { value: mapAddress, setValue: setMapAddress } = useEditableAsset('footer.map.address', '');
  const [mapLatDraft, setMapLatDraft] = useState(mapLat);
  const [mapLngDraft, setMapLngDraft] = useState(mapLng);
  const [mapZoomDraft, setMapZoomDraft] = useState(mapZoom);
  const [mapTitleDraft, setMapTitleDraft] = useState(mapTitle);
  const [mapAddressDraft, setMapAddressDraft] = useState(mapAddress);
  const [mapLinkDraft, setMapLinkDraft] = useState('');
  const [mapError, setMapError] = useState<string | null>(null);

  const { value: heroBgMedia, setValue: setHeroBgMedia, reset: resetHeroBgMedia } = useEditableAsset(
    'hero.backgroundMedia',
    'https://motionsites.ai/assets/hero-space-voyage-preview-eECLH3Yc.gif',
  );
  const [heroBgDraft, setHeroBgDraft] = useState(heroBgMedia);
  const { value: heroBgPlaylist, setValue: setHeroBgPlaylist, reset: resetHeroBgPlaylist } = useEditableAsset(
    'hero.backgroundPlaylist',
    '',
  );
  const [heroBgPlaylistDraft, setHeroBgPlaylistDraft] = useState(heroBgPlaylist);
  const { value: heroPlaylistImageSeconds, setValue: setHeroPlaylistImageSeconds } = useEditableAsset(
    'hero.playlist.imageSeconds',
    '4',
  );
  const [heroPlaylistImageSecondsDraft, setHeroPlaylistImageSecondsDraft] = useState(heroPlaylistImageSeconds);

  const { value: brandLogoUrl, setValue: setBrandLogoUrl, reset: resetBrandLogoUrl } = useEditableAsset(
    'brand.logoUrl',
    '',
  );
  const { value: brandLogoMode, setValue: setBrandLogoMode, reset: resetBrandLogoMode } = useEditableAsset(
    'brand.logoMode',
    'text',
  );
  const { value: brandTitle, setValue: setBrandTitle, reset: resetBrandTitle } = useEditableAsset(
    'brand.title',
    'Retro Fotoğraf & Video Atölyesi',
  );
  const { value: brandTaglineText, setValue: setBrandTaglineText, reset: resetBrandTaglineText } = useEditableAsset(
    'brand.tagline',
    'Wedding • Portrait • Film',
  );
  const [brandLogoDraft, setBrandLogoDraft] = useState(brandLogoUrl);
  const [brandLogoModeDraft, setBrandLogoModeDraft] = useState(brandLogoMode);
  const [brandTitleDraft, setBrandTitleDraft] = useState(brandTitle);
  const [brandTaglineDraft, setBrandTaglineDraft] = useState(brandTaglineText);

  const { value: marqueeUrlsRaw, setValue: setMarqueeUrls, reset: resetMarqueeUrls } = useEditableAsset(
    'app.marquee.urls',
    DEFAULT_LOOP_MEDIA_URLS.join('\n'),
  );
  const [marqueeDraft, setMarqueeDraft] = useState(marqueeUrlsRaw);
  const [marqueeBusy, setMarqueeBusy] = useState(false);

  const {
    value: partnerParticleListRaw,
    setValue: setPartnerParticleListRaw,
    reset: resetPartnerParticleList,
  } = useEditableAsset('partnerSection.particleList', DEFAULT_LOOP_MEDIA_URLS.join('\n'));
  const [partnerParticlesDraft, setPartnerParticlesDraft] = useState(partnerParticleListRaw);
  const [partnerParticlesBusy, setPartnerParticlesBusy] = useState(false);

  const PJ = HOMEPAGE_PROJECT_ROWS;
  const { value: projEvrImg, setValue: setProjEvrImg, reset: resetProjEvrImg } = useEditableAsset(
    `projects.${PJ[0].title}.image`,
    PJ[0].defaultImage,
  );
  const [projEvrDraft, setProjEvrDraft] = useState(projEvrImg);
  const { value: projAutomationImg, setValue: setProjAutomationImg, reset: resetProjAutomationImg } =
    useEditableAsset(`projects.${PJ[1].title}.image`, PJ[1].defaultImage);
  const [projAutomationDraft, setProjAutomationDraft] = useState(projAutomationImg);
  const { value: projXpImg, setValue: setProjXpImg, reset: resetProjXpImg } = useEditableAsset(
    `projects.${PJ[2].title}.image`,
    PJ[2].defaultImage,
  );
  const [projXpDraft, setProjXpDraft] = useState(projXpImg);
  const [projHomeUploadBusy, setProjHomeUploadBusy] = useState(false);

  const [homeMediaLayoutDraft, setHomeMediaLayoutDraft] = useState<HomeMediaBlock[]>(DEFAULT_HOME_MEDIA_LAYOUT);

  const { value: projEvrTitleLive } = useEditableAsset(`projects.${PJ[0].title}.title`, PJ[0].title);
  const { value: projAutomationTitleLive } = useEditableAsset(`projects.${PJ[1].title}.title`, PJ[1].title);
  const { value: projXpTitleLive } = useEditableAsset(`projects.${PJ[2].title}.title`, PJ[2].title);
  const projectBlockTitles = useMemo(
    () => ({
      [PJ[0].id]: projEvrTitleLive || PJ[0].title,
      [PJ[1].id]: projAutomationTitleLive || PJ[1].title,
      [PJ[2].id]: projXpTitleLive || PJ[2].title,
    }),
    [projAutomationTitleLive, projEvrTitleLive, projXpTitleLive],
  );

  const { value: salesBannerMedia, setValue: setSalesBannerMedia, reset: resetSalesBannerMedia } = useEditableAsset(
    'site.salesBanner.media',
    DEFAULT_SALES_BANNER_MEDIA,
  );
  const { value: salesBannerText, setValue: setSalesBannerText, reset: resetSalesBannerText } = useEditableAsset(
    'site.salesBanner.text',
    'Kısa bir alt metin yaz (fiyat/teklif/garanti gibi).',
  );
  const { value: salesBannerWidth, setValue: setSalesBannerWidth, reset: resetSalesBannerWidth } = useEditableAsset(
    'site.salesBanner.width',
    'contained',
  );
  const { value: salesBannerHeightPx, setValue: setSalesBannerHeightPx, reset: resetSalesBannerHeightPx } = useEditableAsset(
    'site.salesBanner.heightPx',
    '360',
  );
  const { value: salesBannerCorners, setValue: setSalesBannerCorners, reset: resetSalesBannerCorners } = useEditableAsset(
    'site.salesBanner.corners',
    'soft',
  );
  const { value: salesBannerOverlayPos, setValue: setSalesBannerOverlayPos, reset: resetSalesBannerOverlayPos } = useEditableAsset(
    'site.salesBanner.overlay.position',
    'center-left',
  );
  const { value: salesBannerOverlayColor, setValue: setSalesBannerOverlayColor, reset: resetSalesBannerOverlayColor } = useEditableAsset(
    'site.salesBanner.overlay.color',
    'light',
  );
  const { value: salesBannerCtaEnabled, setValue: setSalesBannerCtaEnabled, reset: resetSalesBannerCtaEnabled } = useEditableAsset(
    'site.salesBanner.cta.enabled',
    '0',
  );
  const { value: salesBannerCtaHref, setValue: setSalesBannerCtaHref, reset: resetSalesBannerCtaHref } = useEditableAsset(
    'site.salesBanner.cta.href',
    '#',
  );
  const [salesBannerMediaDraft, setSalesBannerMediaDraft] = useState(salesBannerMedia);
  const [salesBannerTextDraft, setSalesBannerTextDraft] = useState(salesBannerText);
  const [salesBannerWidthDraft, setSalesBannerWidthDraft] = useState(salesBannerWidth);
  const [salesBannerHeightPxDraft, setSalesBannerHeightPxDraft] = useState(salesBannerHeightPx);
  const [salesBannerCornersDraft, setSalesBannerCornersDraft] = useState(salesBannerCorners);
  const [salesBannerOverlayPosDraft, setSalesBannerOverlayPosDraft] = useState(salesBannerOverlayPos);
  const [salesBannerOverlayColorDraft, setSalesBannerOverlayColorDraft] = useState(salesBannerOverlayColor);
  const [salesBannerCtaEnabledDraft, setSalesBannerCtaEnabledDraft] = useState(salesBannerCtaEnabled);
  const [salesBannerCtaHrefDraft, setSalesBannerCtaHrefDraft] = useState(salesBannerCtaHref);
  const [salesBannerBusy, setSalesBannerBusy] = useState(false);

  const { value: trustedLogosRaw, setValue: setTrustedLogosRaw, reset: resetTrustedLogosRaw } = useEditableAsset(
    'site.trustedLogos.logos',
    '',
  );
  const { value: trustedLogosLayout, setValue: setTrustedLogosLayout, reset: resetTrustedLogosLayout } = useEditableAsset(
    'site.trustedLogos.layout',
    'grid',
  );
  const { value: trustedLogosTone, setValue: setTrustedLogosTone, reset: resetTrustedLogosTone } = useEditableAsset(
    'site.trustedLogos.tone',
    'mono-dim',
  );
  const [trustedLogosDraft, setTrustedLogosDraft] = useState(trustedLogosRaw);
  const [trustedLogosItemsDraft, setTrustedLogosItemsDraft] = useState<string[]>(
    String(trustedLogosRaw || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const [trustedLogosLayoutDraft, setTrustedLogosLayoutDraft] = useState(trustedLogosLayout);
  const [trustedLogosToneDraft, setTrustedLogosToneDraft] = useState(trustedLogosTone);
  const [trustedLogosBusy, setTrustedLogosBusy] = useState(false);

  const syncMarqueeSlotsToAssets = (raw: string) => {
    const lines = raw
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    lines.forEach((line, i) => {
      writeAsset(`app.marquee.${i}`, line);
    });
    for (let j = lines.length; j < 64; j++) {
      clearAsset(`app.marquee.${j}`);
    }
    bumpAssetsVersion();
  };

  const mediaLines = (raw: string) =>
    String(raw || '').trim()
      ? String(raw || '')
      .split('\n')
      .map((x) => x.trim())
      : [];

  const updateMediaLineDraft = (raw: string, setter: (v: string) => void, index: number, value: string) => {
    const lines = mediaLines(raw);
    lines[index] = value;
    setter(lines.join('\n'));
  };

  const moveMediaLineDraft = (raw: string, setter: (v: string) => void, index: number, dir: -1 | 1) => {
    const lines = mediaLines(raw);
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= lines.length) return;
    [lines[index], lines[nextIndex]] = [lines[nextIndex], lines[index]];
    setter(lines.join('\n'));
  };

  const removeMediaLineDraft = (raw: string, setter: (v: string) => void, index: number) => {
    const lines = mediaLines(raw);
    lines.splice(index, 1);
    setter(lines.join('\n'));
  };

  const appendMediaLineDraft = (raw: string, setter: (v: string) => void) => {
    setter([...mediaLines(raw), ''].join('\n'));
  };

  const renderMediaRows = (raw: string, setter: (v: string) => void, emptyLabel = 'Henuz medya yok.') => {
    const rows = mediaLines(raw);
    return (
      <div className="space-y-2">
        {rows.length ? (
          rows.map((url, idx) => {
            const isVideo =
              String(url).toLowerCase().startsWith('data:video/') || /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(url));
            return (
              <div key={idx} className="rounded-xl border border-black/10 bg-white p-2">
                <div className="flex items-center gap-2">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-black/10 bg-black/[0.03]">
                    {!url.trim() ? (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-[#051A24]/45">Bos</div>
                    ) : isVideo ? (
                      <video src={url} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <input
                    value={url}
                    onChange={(e) => updateMediaLineDraft(raw, setter, idx, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/10 font-mono"
                    placeholder="https://... veya data:..."
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="rounded-lg border border-black/10 px-2 py-1.5 text-xs disabled:opacity-35"
                      disabled={idx === 0}
                      onClick={() => moveMediaLineDraft(raw, setter, idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-black/10 px-2 py-1.5 text-xs disabled:opacity-35"
                      disabled={idx >= rows.length - 1}
                      onClick={() => moveMediaLineDraft(raw, setter, idx, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800"
                      onClick={() => removeMediaLineDraft(raw, setter, idx)}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/65">
            {emptyLabel}
          </div>
        )}
        <button
          type="button"
          className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
          onClick={() => appendMediaLineDraft(raw, setter)}
        >
          + Medya satiri ekle
        </button>
      </div>
    );
  };

  const renderAssetTextField = (assetKey: string, label: string, fallback: string, multiline = false) => {
    const value = readAsset(assetKey) ?? fallback;
    const commonClass =
      'w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white';
    const onChange = (next: string) => {
      writeAsset(assetKey, next);
      bumpAssetsVersion();
    };

    return (
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium text-[#051A24]/70">{label}</span>
        {multiline ? (
          <textarea
            value={value}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            className={`${commonClass} min-h-[84px] resize-y leading-relaxed`}
          />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} className={commonClass} />
        )}
      </label>
    );
  };

  const renderSafeLinkSelect = (assetKey: string, label: string, fallback = '/calendar') => {
    const raw = readAsset(assetKey) ?? fallback;
    const selected = normalizeSiteHref(raw);
    const value = safeSiteTargets.some((opt) => opt.value === selected) ? selected : fallback;
    return (
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium text-[#051A24]/70">{label}</span>
        <select
          value={value}
          onChange={(e) => {
            writeAsset(assetKey, e.target.value);
            bumpAssetsVersion();
          }}
          className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
        >
          {safeSiteTargets.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const scopedBlockAssetKey = (block: HomeMediaBlock, suffix: string) => {
    if (block.type === 'marquee' && block.id === 'hm-marquee' && suffix === 'marquee.urls') return 'app.marquee.urls';
    if (block.type === 'partner' && block.id === 'hm-partner' && suffix === 'partner.particles') return 'partnerSection.particleList';
    if (block.type === 'salesBanner' && block.id === 'hm-sales') return `site.salesBanner.${suffix}`;
    if (block.type === 'trustedLogos' && block.id === 'hm-trustedLogos') return `site.trustedLogos.${suffix}`;
    return `site.home.blocks.${block.id}.${suffix}`;
  };

  const renderPersistedMediaRows = (assetKey: string, fallback: string, emptyLabel: string) => {
    const raw = readAsset(assetKey) ?? fallback;
    const setRaw = (next: string) => {
      writeAsset(assetKey, next);
      bumpAssetsVersion();
    };
    return renderMediaRows(raw, setRaw, emptyLabel);
  };

  const renderBlockTextEditors = (block: HomeMediaBlock) => {
    if (block.type === 'marquee') {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/65">
            Bu marquee bloğunun medyaları sadece bu bloğa aittir. Aynı bloktan ikinci kez eklersen ayrı düzenlenir.
          </div>
          {renderPersistedMediaRows(
            scopedBlockAssetKey(block, 'marquee.urls'),
            block.id === 'hm-marquee' ? marqueeDraft : DEFAULT_LOOP_MEDIA_URLS.join('\n'),
            'Bu marquee icin medya ekle.',
          )}
        </div>
      );
    }

    if (block.type === 'pricing') {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField('services.kicker', 'Etiket', 'Hizmetlerimiz')}
            {renderAssetTextField('services.title', 'Baslik', 'Her çekim için ayrı bir kalite standardı.')}
          </div>
          {renderAssetTextField(
            'services.subtitle',
            'Aciklama',
            'Konseptten teslimata kadar surec net, hizli ve kaliteli ilerler.',
            true,
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField('services.cta.primary', 'Buton 1 yazisi', 'Takvime Git')}
            {renderAssetTextField('services.cta.secondary', 'Buton 2 yazisi', 'Paketler')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {renderAssetTextField('services.footer.p1', 'Alt not 1', 'Teslimler net: seçki + retouch.')}
            {renderAssetTextField('services.footer.p2', 'Alt not 2', 'Planlı çekim: zaman kaybı yok.')}
            {renderAssetTextField('services.footer.p3', 'Alt not 3', 'Premium ışık + renk standardı.')}
          </div>
        </div>
      );
    }

    if (block.type === 'carousel') {
      return (
        <div className="space-y-3">
          {renderAssetTextField('testimonialCarousel.title', 'Baslik', 'Müşteriler ne söylüyor?')}
          <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/65">
            Yorum ekleme, silme ve yorum karti metinleri bu blok ana sayfada gorunurken kendi yonetim butonlariyla duzenlenir.
          </div>
        </div>
      );
    }

    if (block.type === 'project') {
      const row = HOMEPAGE_PROJECT_ROWS.find((r) => r.id === block.projectId) || HOMEPAGE_PROJECT_ROWS[0];
      return (
        <div className="space-y-3">
          {renderAssetTextField(`projects.${row.title}.image`, 'Medya URL', row.defaultImage)}
          {renderAssetTextField(`projects.${row.title}.title`, 'Baslik', row.title)}
          {renderAssetTextField(`projects.${row.title}.description`, 'Aciklama', row.description, true)}
        </div>
      );
    }

    if (block.type === 'partner') {
      const particleKey = scopedBlockAssetKey(block, 'partner.particles');
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField('partnerSection.title.prefix', 'Baslik ilk parca', 'Partner with ')}
            {renderAssetTextField('partnerSection.title.italic', 'Baslik vurgulu parca', 'us')}
          </div>
          {renderAssetTextField('partnerSection.cta', 'Buton yazisi', 'Bizimle birlikte çalış')}
          {renderAssetTextField('whatsapp.phone', 'WhatsApp numarasi', '905XXXXXXXXX')}
          {renderAssetTextField('whatsapp.defaultMessage', 'WhatsApp varsayilan mesaj', 'Merhaba, bilgi almak istiyorum.', true)}
          <div>
            <div className="mb-2 text-[11px] font-medium text-[#051A24]/70">Fare efekti medyaları</div>
            {renderPersistedMediaRows(
              particleKey,
              block.id === 'hm-partner' ? partnerParticlesDraft : DEFAULT_LOOP_MEDIA_URLS.join('\n'),
              'Bu partner efekti icin medya ekle.',
            )}
          </div>
        </div>
      );
    }

    if (block.type === 'salesBanner') {
      const base = (suffix: string) => scopedBlockAssetKey(block, suffix);
      return (
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-[11px] font-medium text-[#051A24]/70">Banner medya URL</div>
            {renderAssetTextField(base('media'), 'Medya', block.id === 'hm-sales' ? salesBannerMedia : DEFAULT_SALES_BANNER_MEDIA)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField(base('overlay.title'), 'Baslik', 'Master Your Craft')}
            {renderAssetTextField(base('overlay.subtitle'), 'Alt baslik', 'Join over 500,000 students')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField(base('cta.label'), 'Buton yazisi', 'Browse collections')}
            {renderSafeLinkSelect(base('cta.href'), 'Buton yonlendirmesi', '/calendar')}
          </div>
          {renderAssetTextField(base('text'), 'Alt metin', 'Kısa bir alt metin yaz (fiyat/teklif/garanti gibi).', true)}
        </div>
      );
    }

    if (block.type === 'trustedLogos') {
      const logoKey = scopedBlockAssetKey(block, 'logos');
      const logoTextKey = (suffix: string) => scopedBlockAssetKey(block, suffix);
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField(logoTextKey('kicker'), 'Etiket', 'Trusted by')}
            {renderAssetTextField(logoTextKey('title'), 'Baslik', 'Çalıştığımız büyük markalar')}
          </div>
          {renderAssetTextField(
            logoTextKey('subtitle'),
            'Aciklama',
            'Seçili örnekler - tüm referansları istersen ayrıca paylaşırız.',
            true,
          )}
          <div>
            <div className="mb-2 text-[11px] font-medium text-[#051A24]/70">Logo medyaları</div>
            {renderPersistedMediaRows(logoKey, block.id === 'hm-trustedLogos' ? trustedLogosDraft : '', 'Bu blok icin logo ekle.')}
          </div>
        </div>
      );
    }

    if (block.type === 'faq') {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAssetTextField('site.faq.kicker', 'Etiket', 'Sık sorulanlar')}
            {renderAssetTextField('site.faq.title', 'Baslik', 'Çekim öncesi aklındaki sorular')}
          </div>
          {renderAssetTextField(
            'site.faq.subtitle',
            'Aciklama',
            'Planlama, teslim ve ödeme hakkında en çok sorulan soruları burada toparladık.',
            true,
          )}
          <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/65">
            Soru-cevap kartlarini ekleme, siralama ve silme islemleri bu blok ana sayfada gorunurken kendi yonetim butonlariyla yapilir.
          </div>
        </div>
      );
    }

    if (block.type === 'people') {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {renderAssetTextField('testimonialSectionStatic.title.prefix', 'Baslik ilk parca', 'Anılarınız ')}
            {renderAssetTextField('testimonialSectionStatic.title.italic', 'Vurgulu parca', 'bizimle ')}
            {renderAssetTextField('testimonialSectionStatic.title.suffix', 'Baslik son parca', 'ölümsüzleşir.')}
          </div>
          {renderAssetTextField('testimonialSectionStatic.author', 'Imza / alt metin', 'Retro Fotoğraf & Video Atölyesi')}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {renderAssetTextField('testimonialSection.badge1', 'Kelime 1', 'Düğün')}
            {renderAssetTextField('testimonialSection.badge2', 'Kelime 2', 'Portre')}
            {renderAssetTextField('testimonialSection.badge3', 'Kelime 3', 'Film')}
          </div>
        </div>
      );
    }

    return null;
  };

  const applyWeddingPresentationMedia = () => {
    const marquee = WEDDING_PHOTO_URLS.join('\n');
    setMarqueeUrls(marquee);
    setMarqueeDraft(marquee);
    syncMarqueeSlotsToAssets(marquee);

    HOMEPAGE_PROJECT_ROWS.forEach((row, idx) => {
      writeAsset(`projects.${row.title}.title`, row.title);
      writeAsset(`projects.${row.title}.description`, row.description);
      writeAsset(`projects.${row.title}.image`, WEDDING_PHOTO_URLS[idx === 0 ? 0 : idx === 1 ? 2 : 5]);
    });

    writeAsset('hero.backgroundMedia', WEDDING_PHOTO_URLS[1]);
    writeAsset('hero.backgroundPlaylist', WEDDING_PHOTO_URLS.join('\n'));
    writeAsset('site.salesBanner.media', WEDDING_PHOTO_URLS[6]);
    writeAsset('site.salesBanner.width', 'full');
    writeAsset('site.salesBanner.heightPx', '420');
    writeAsset('site.salesBanner.overlay.position', 'center-left');
    writeAsset('site.salesBanner.overlay.color', 'light');
    writeAsset('site.salesBanner.overlay.title', 'Düğün Hikayenizi Birlikte Yazalım');
    writeAsset('site.salesBanner.overlay.subtitle', 'Fotoğraf • Video • Albüm');
    writeAsset('site.salesBanner.cta.enabled', '1');
    writeAsset('site.salesBanner.cta.href', '/calendar');
    writeAsset('site.salesBanner.cta.label', 'Randevu al');

    writeAsset('testimonialSectionStatic.title.prefix', 'Anılarınız ');
    writeAsset('testimonialSectionStatic.title.italic', 'bizimle ');
    writeAsset('testimonialSectionStatic.title.suffix', 'ölümsüzleşir.');
    writeAsset('testimonialSectionStatic.author', 'Retro Fotoğraf & Video Atölyesi');
    writeAsset('testimonialSection.badge1', 'Düğün');
    writeAsset('testimonialSection.badge2', 'Portre');
    writeAsset('testimonialSection.badge3', 'Film');

    const people = WEDDING_PORTRAIT_URLS.map((url, idx) => {
      const id = `demo-person-${idx + 1}`;
      const keyBase = `people.${id}`;
      writeAsset(`${keyBase}.portrait`, url);
      writeAsset(`${keyBase}.author`, ['Elif', 'Mert', 'Derya', 'Can'][idx] || `Kişi ${idx + 1}`);
      writeAsset(`${keyBase}.label`, ['Gelin', 'Damat', 'Portre', 'Ekip'][idx] || 'Portre');
      writeAsset(`${keyBase}.extra`, 'Doğal ışıkta, zamansız ve samimi bir portre anlatımı.');
      writeAsset(`${keyBase}.motivation`, 'En güzel anlar, fark ettirmeden yakalananlardır.');
      writeAsset(`${keyBase}.bio`, 'Sunum için örnek portre alanı.');
      return { id, keyBase, imageDefault: url };
    });
    writeJsonAsset('peopleCarousel.items', people);

    writeJsonAsset('site.home.mediaLayout', [
      { id: 'hm-marquee', type: 'marquee' },
      { id: 'hm-pricing', type: 'pricing' },
      { id: 'hm-carousel', type: 'carousel' },
      { id: 'hm-proj-evr', type: 'project', projectId: 'evr' },
      { id: 'hm-proj-automation', type: 'project', projectId: 'automation' },
      { id: 'hm-proj-xportfolio', type: 'project', projectId: 'xportfolio' },
      { id: 'hm-sales', type: 'salesBanner' },
      { id: 'hm-people', type: 'people' },
      { id: 'hm-partner', type: 'partner' },
      { id: 'hm-faq', type: 'faq' },
    ]);
    setHomeMediaLayoutDraft(normalizeHomeMediaLayout(readJsonAsset<HomeMediaBlock[]>('site.home.mediaLayout')));
    bumpAssetsVersion();
  };

  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportMode, setSupportMode] = useState<'outbox' | 'smtp'>('outbox');
  const [supportBaseUrl, setSupportBaseUrl] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [outboxRows, setOutboxRows] = useState<
    Array<{ id: number; to_email: string; subject: string; body: string; status: string; created_at: string; error?: string | null }>
  >([]);

  const [inboxThreads, setInboxThreads] = useState<any[]>([]);
  const [inboxSelectedId, setInboxSelectedId] = useState<number | null>(null);
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [inboxAttachments, setInboxAttachments] = useState<any[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxSubjectDraft, setInboxSubjectDraft] = useState('');
  const [inboxBodyDraft, setInboxBodyDraft] = useState('');

  function tryParseGoogleMaps(input: string): { lat: number; lng: number; zoom?: number } | null {
    const raw = (input || '').trim();
    if (!raw) return null;

    const tryLatLng = (a: string, b: string) => {
      const lat = Number(a);
      const lng = Number(b);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };

    // Accept plain "lat,lng"
    const plain = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (plain) return tryLatLng(plain[1], plain[2]);

    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      // Maybe missing protocol
      try {
        url = new URL(`https://${raw}`);
      } catch {
        return null;
      }
    }

    const u = url;
    const path = decodeURIComponent(u.pathname || '');
    const hash = decodeURIComponent(u.hash || '');

    // Pattern: /@lat,lng,zoomz
    const at = (path + hash).match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)z/);
    if (at) {
      const ll = tryLatLng(at[1], at[2]);
      if (!ll) return null;
      const zoom = Number(at[3]);
      return { ...ll, zoom: Number.isFinite(zoom) ? zoom : undefined };
    }

    // Pattern: !3dLAT!4dLNG
    const bang = (path + hash).match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (bang) {
      const ll = tryLatLng(bang[1], bang[2]);
      if (!ll) return null;
      const z = u.searchParams.get('z');
      const zoom = z ? Number(z) : undefined;
      return { ...ll, zoom: Number.isFinite(zoom) ? zoom : undefined };
    }

    // Query: q=lat,lng or query=lat,lng or ll=lat,lng or center=lat,lng
    const q =
      u.searchParams.get('q') ||
      u.searchParams.get('query') ||
      u.searchParams.get('ll') ||
      u.searchParams.get('center');
    if (q) {
      const m = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        const ll = tryLatLng(m[1], m[2]);
        if (!ll) return null;
        const z = u.searchParams.get('z');
        const zoom = z ? Number(z) : undefined;
        return { ...ll, zoom: Number.isFinite(zoom) ? zoom : undefined };
      }
    }

    return null;
  }

  useEffect(() => {
    if (!mapOpen) return;
    setMapLatDraft(mapLat);
    setMapLngDraft(mapLng);
    setMapZoomDraft(mapZoom);
    setMapTitleDraft(mapTitle);
    setMapAddressDraft(mapAddress);
    setMapLinkDraft('');
    setMapError(null);
  }, [mapAddress, mapLat, mapLng, mapOpen, mapTitle, mapZoom]);

  useEffect(() => {
    if (!mediaHubOpen) return;
    setHeroBgDraft(heroBgMedia);
    setBrandLogoDraft(brandLogoUrl);
    setBrandLogoModeDraft(brandLogoMode);
    setBrandTitleDraft(brandTitle);
    setBrandTaglineDraft(brandTaglineText);
    setHeroBgPlaylistDraft(heroBgPlaylist);
    setHeroPlaylistImageSecondsDraft(heroPlaylistImageSeconds);
    setMarqueeDraft(marqueeUrlsRaw);
    setPartnerParticlesDraft(partnerParticleListRaw);
    setProjEvrDraft(projEvrImg);
    setProjAutomationDraft(projAutomationImg);
    setProjXpDraft(projXpImg);
    setSalesBannerMediaDraft(salesBannerMedia);
    setSalesBannerTextDraft(salesBannerText);
    setSalesBannerWidthDraft(salesBannerWidth);
    setSalesBannerHeightPxDraft(salesBannerHeightPx);
    setSalesBannerCornersDraft(salesBannerCorners);
    setSalesBannerOverlayPosDraft(salesBannerOverlayPos);
    setSalesBannerOverlayColorDraft(salesBannerOverlayColor);
    setSalesBannerCtaEnabledDraft(salesBannerCtaEnabled);
    setSalesBannerCtaHrefDraft(salesBannerCtaHref);
    setTrustedLogosDraft(trustedLogosRaw);
    setTrustedLogosItemsDraft(
      String(trustedLogosRaw || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    );
    setTrustedLogosLayoutDraft(trustedLogosLayout);
    setTrustedLogosToneDraft(trustedLogosTone);
    setHomeMediaLayoutDraft(normalizeHomeMediaLayout(readJsonAsset<HomeMediaBlock[]>('site.home.mediaLayout')));
  }, [
    assetsVersion,
    brandLogoUrl,
    brandLogoMode,
    brandTaglineText,
    brandTitle,
    heroBgMedia,
    heroBgPlaylist,
    heroPlaylistImageSeconds,
    mediaHubOpen,
    marqueeUrlsRaw,
    partnerParticleListRaw,
    projAutomationImg,
    projEvrImg,
    projXpImg,
    salesBannerMedia,
    salesBannerText,
    salesBannerWidth,
    salesBannerHeightPx,
    salesBannerCorners,
    salesBannerOverlayPos,
    salesBannerOverlayColor,
    salesBannerCtaEnabled,
    salesBannerCtaHref,
    trustedLogosRaw,
    trustedLogosLayout,
    trustedLogosTone,
  ]);

  useEffect(() => {
    if (!open) return;
    setAuthTab('login');
    setLoginEmail('');
    setLoginPassword('');
    setError(null);
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupCompany('');
  }, [open]);

  useEffect(() => {
    const onOpenAuth = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: 'login' | 'signup' | 'forgot' }>).detail?.tab;
      setAuthTab(tab === 'signup' ? tab : 'login');
      setOpen(true);
      setMenuOpen(false);
      setCustomerMenuOpen(false);
    };
    window.addEventListener('aiag:open-auth', onOpenAuth);
    return () => window.removeEventListener('aiag:open-auth', onOpenAuth);
  }, []);

  const loadInboxThreads = async () => {
    setInboxLoading(true);
    setInboxError(null);
    try {
      const res = await fetch('/api/inbox/threads');
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error('Gelen kutusu alınamadı (giriş gerekli).');
      setInboxThreads(data.threads || []);
    } catch (e: any) {
      setInboxError(e?.message || 'Hata');
    } finally {
      setInboxLoading(false);
    }
  };

  const loadInboxThread = async (id: number) => {
    setInboxLoading(true);
    setInboxError(null);
    try {
      const res = await fetch(`/api/inbox/threads/${id}`);
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.ok) throw new Error('Konuşma alınamadı.');
      setInboxSelectedId(id);
      setInboxMessages(data.messages || []);
      setInboxAttachments(data.attachments || []);
    } catch (e: any) {
      setInboxError(e?.message || 'Hata');
    } finally {
      setInboxLoading(false);
    }
  };

  const defaultButtons = useMemo<ToolbarItemConfig[]>(
    () => [
      { id: 'portfolio', type: 'link', label: 'Portfolyo', href: portfolioUrl || '#', enabled: true },
      { id: 'partners', type: 'link', label: 'İş birliklerimiz', href: partnersUrl || '#', enabled: true },
    ],
    [calendarUrl, partnersUrl, portfolioUrl],
  );

  const normalizeToolbar = (raw: unknown): ToolbarItemConfig[] | null => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out: ToolbarItemConfig[] = [];
    const normalizeSubItems = (items: any[]): ToolbarMenuItem['items'] =>
      items
        .filter((x) => x && typeof x === 'object')
        .map((x) => {
          const subId = String((x as any).id || '').trim() || newId();
          const subEnabled = Boolean((x as any).enabled !== false);
          const subType = String((x as any).type || '').toLowerCase();

          if (subType === 'gallery') {
            const k = String((x as any).galleryKind || (x as any).kind || 'mixed').toLowerCase();
            const galleryKind = (k === 'photo' || k === 'video' || k === 'mixed') ? (k as any) : 'mixed';
            const l = String((x as any).galleryLayout || (x as any).layout || 'masonry').toLowerCase();
            const galleryLayout = (l === 'masonry' || l === 'edge' || l === 'film') ? l : 'masonry';
            return {
              id: subId,
              type: 'gallery' as const,
              label: String((x as any).label || 'Galeri'),
              enabled: subEnabled,
              galleryKind,
              galleryLayout,
            };
          }

          if (subType === 'packages') {
            const k = String((x as any).packagesKind || (x as any).kind || 'banner').toLowerCase();
            const packagesKind = k === 'all' || k === 'hepsi' ? ('all' as const) : k === 'poster' || k === 'afis' ? ('poster' as const) : ('banner' as const);
            const label = String((x as any).label || (packagesKind === 'all' ? 'Banner + Afiş' : packagesKind === 'banner' ? 'Banner' : 'Afiş'));
            return {
              id: subId,
              type: 'packages' as const,
              label,
              enabled: subEnabled,
              packagesKind,
              packagesScope: normalizePackagesScope((x as any).packagesScope || (x as any).scope, label),
            };
          }

          // default: link (supports legacy schema without `type`)
          return {
            id: subId,
            type: 'link' as const,
            label: String((x as any).label || 'Link'),
            href: String((x as any).href || '#'),
            enabled: subEnabled,
          };
        });
    for (const item of raw as any[]) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as any).id || '').trim() || newId();
      const enabled = Boolean((item as any).enabled !== false);
      const type = (item as any).type;

      // Old schema migration: {id,label,href,enabled}
      if (!type && 'href' in item) {
        out.push({
          id,
          type: 'link',
          label: String((item as any).label || 'Buton'),
          href: String((item as any).href || '#'),
          enabled,
        });
        continue;
      }

      if (type === 'link') {
        const items = Array.isArray((item as any).items) ? ((item as any).items as any[]) : [];
        const parsedItemsList = normalizeSubItems(items);
        const modeStored = String((item as any).mode || '').trim().toLowerCase();
        const mode =
          modeStored === 'dropdown'
            ? ('dropdown' as const)
            : modeStored === 'link'
              ? ('link' as const)
              : modeStored === 'flat'
                ? ('flat' as const)
                : parsedItemsList.length
                  ? ('dropdown' as const)
                  : undefined;
        const itemsHref = String((item as any).itemsHref || (item as any).mainHref || '').trim() || undefined;
        let parsedItems = parsedItemsList;
        const label = String((item as any).label || 'Buton');
        if (!parsedItems.length) {
          const tmpl = normalizeToolbarPageTemplate((item as any).pageTemplate || (item as any).template);
          if (tmpl === 'portfolio') {
            parsedItems = [
              { id: newId(), type: 'gallery', label, enabled: true, galleryKind: 'mixed', galleryLayout: 'masonry' },
            ];
          } else if (tmpl === 'partners') {
            parsedItems = [
              {
                id: newId(),
                type: 'packages',
                label,
                enabled: true,
                packagesKind: 'all',
                packagesScope: 'isbirliklerimiz',
              },
            ];
          } else if (tmpl === 'packages') {
            parsedItems = [{ id: newId(), type: 'packages', label, enabled: true, packagesKind: 'all' }];
          }
        }
        const linkOut: ToolbarLinkItem = {
          id,
          type: 'link',
          label,
          href: String((item as any).href || '#'),
          enabled,
          mode,
          itemsHref,
        };
        if (parsedItems.length) linkOut.items = parsedItems;
        out.push(linkOut);
        continue;
      }

      if (type === 'menu') {
        const items = Array.isArray((item as any).items) ? ((item as any).items as any[]) : [];
        out.push({
          id,
          type: 'menu',
          label: String((item as any).label || 'Menü'),
          enabled,
          mode: 'dropdown',
          items: normalizeSubItems(items),
        });
      }
    }
    return out.length ? out : null;
  };

  const [toolbarButtons, setToolbarButtons] = useState<ToolbarItemConfig[]>(() => {
    const stored = readJsonAsset<unknown>('admin.toolbar.buttons');
    const normalized = normalizeToolbar(stored);
    if (normalized?.length) return normalized;
    return defaultButtons;
  });
  const [toolbarSavedNote, setToolbarSavedNote] = useState<string | null>(null);
  const safeSiteTargets = useMemo(
    () => collectNavigableSiteTargets(toolbarButtons, SAFE_SITE_LINK_TARGETS),
    [toolbarButtons],
  );

  const persistToolbarButtons = (nextButtons: ToolbarItemConfig[]) => {
    const safeToolbarHref = (href: unknown, fallback = '/') => {
      const normalized = normalizeToolbarHref(String(href || '').trim());
      if (isBrokenToolbarHref(normalized)) return fallback;
      if (/^(https?:|mailto:|tel:)/i.test(normalized)) return fallback;
      return normalized;
    };
    const mapSubItems = (itemsRaw: unknown) =>
      (Array.isArray(itemsRaw) ? (itemsRaw as any[]) : []).map((it: any) => {
        const subType = String(it?.type || '').toLowerCase();
        if (subType === 'gallery') {
          const k = String(it?.galleryKind || 'mixed').toLowerCase();
          const galleryKind = k === 'photo' || k === 'video' || k === 'mixed' ? (k as 'photo' | 'video' | 'mixed') : 'mixed';
          const l = String(it?.galleryLayout || 'masonry').toLowerCase();
          const galleryLayout = l === 'masonry' || l === 'edge' || l === 'film' ? (l as 'masonry' | 'edge' | 'film') : 'masonry';
          return {
            id: it.id || newId(),
            type: 'gallery' as const,
            label: (it.label || '').trim() || 'Galeri',
            enabled: Boolean(it.enabled),
            galleryKind,
            galleryLayout,
          };
        }
        if (subType === 'packages') {
          const k = String(it?.packagesKind || 'banner').toLowerCase();
          const packagesKind = k === 'all' ? ('all' as const) : k === 'poster' ? ('poster' as const) : ('banner' as const);
          const label =
            (it.label || '').trim() ||
            (packagesKind === 'all' ? 'Banner + Afiş' : packagesKind === 'banner' ? 'Banner' : 'Afiş');
          return {
            id: it.id || newId(),
            type: 'packages' as const,
            label,
            enabled: Boolean(it.enabled),
            packagesKind,
            packagesScope: normalizePackagesScope(it.packagesScope || it.scope, label),
          };
        }
        return {
          id: it.id || newId(),
          type: 'link' as const,
          label: (it.label || '').trim() || 'Link',
          href: safeToolbarHref(it.href),
          enabled: Boolean(it.enabled),
        };
      });

    const next = nextButtons.map((b) => {
      if (b.type === 'menu') {
        return {
          id: b.id || newId(),
          type: 'menu' as const,
          label: (b.label || '').trim() || 'Menü',
          enabled: Boolean(b.enabled),
          mode: 'dropdown' as const,
          items: mapSubItems(b.items),
        };
      }

      const bl = b as ToolbarLinkItem;
      const persisted: Record<string, unknown> = {
        id: bl.id || newId(),
        type: 'link' as const,
        label: (bl.label || '').trim() || 'Buton',
        href: safeToolbarHref(bl.href),
        enabled: Boolean(bl.enabled),
      };
      if (bl.mode) {
        persisted.mode = bl.mode === 'link' ? 'link' : bl.mode === 'dropdown' ? 'dropdown' : 'flat';
      }
      if (bl.pageTemplate) persisted.pageTemplate = bl.pageTemplate;
      if ((bl.itemsHref || '').trim()) persisted.itemsHref = (bl.itemsHref || '').trim();
      if ((bl.items || []).length) persisted.items = mapSubItems(bl.items);
      return persisted as any;
    });
    writeJsonAsset('admin.toolbar.buttons', next);
    bumpAssetsVersion();
  };

  // Auto-save toolbar while editing so reorders "just work".
  useEffect(() => {
    if (!toolbarOpen) return;
    const t = window.setTimeout(() => {
      try {
        persistToolbarButtons(toolbarButtons);
      } catch {
        // ignore
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [toolbarButtons, toolbarOpen]);

  // Keep defaults in sync for first-time users (but never overwrite a saved config).
  useEffect(() => {
    const stored = readJsonAsset<unknown>('admin.toolbar.buttons');
    const normalized = normalizeToolbar(stored);
    if (normalized?.length) return;
    setToolbarButtons(defaultButtons);
  }, [defaultButtons]);

  const calendarHrefResolved = useMemo(
    () => (calendarUrl || '/calendar').trim() || '/calendar',
    [calendarUrl],
  );

  function isBrokenToolbarHref(h: string) {
    const t = (h || '').trim();
    return !t || t === '#' || /^javascript:/i.test(t);
  }

  function normalizeToolbarHref(href: string) {
    return normalizeNavHref(href);
  }

  const resolvedButtons = useMemo(() => {
    return toolbarButtons
      .filter((b) => b && b.enabled !== false && b.id !== 'calendar')
      .map((b) => {
        if (b.type === 'link' && Array.isArray((b as any).items)) {
          return {
            ...b,
            items: ((b as any).items as any[]).map((it) => {
              const row = it as { id?: string; type?: string; href?: string };
              if (row && row.type !== 'gallery' && row.type !== 'packages' && row.id === 'calendar') {
                const href = isBrokenToolbarHref(String(row.href || '')) ? calendarHrefResolved : normalizeToolbarHref(String(row.href || ''));
                return { ...it, href } as any;
              }
              return it;
            }),
          };
        }
        if (b.type === 'menu' && Array.isArray(b.items)) {
          return {
            ...b,
            items: b.items.map((it) => {
              const row = it as { id?: string; type?: string; href?: string };
              if (row && row.type !== 'gallery' && row.id === 'calendar') {
                const href = isBrokenToolbarHref(String(row.href || '')) ? calendarHrefResolved : normalizeToolbarHref(String(row.href || ''));
                return { ...it, href } as (typeof b.items)[number];
              }
              return it;
            }),
          };
        }
        return b;
      });
  }, [toolbarButtons, calendarHrefResolved]);

  function resolveSubmenuHref(directHref: string | undefined, items: ToolbarMenuItem['items']) {
    const direct = String(directHref || '').trim();
    if (direct && !isBrokenToolbarHref(direct)) return normalizeToolbarHref(direct);
    return resolveToolbarItemsToHref(items);
  }

  function resolveMenuLinkHref(b: ToolbarMenuItem): string {
    return resolveSubmenuHref(b.href, b.items || []);
  }

  const [openToolbarMenuId, setOpenToolbarMenuId] = useState<string | null>(null);

  const defaultFooterLinks = useMemo<FooterLinksConfig>(
    () => ({
      columns: [
        {
          id: 'primary',
          items: [
            { id: 'services', label: 'Services', href: '#', enabled: true, kind: 'url' },
            { id: 'work', label: 'Work', href: '#', enabled: true, kind: 'url' },
            { id: 'about', label: 'About', href: '#', enabled: true, kind: 'url' },
          ],
        },
        {
          id: 'social',
          items: [
            { id: 'x', label: 'x.com', href: 'https://x.com', enabled: true, kind: 'url' },
            { id: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com', enabled: true, kind: 'url' },
          ],
        },
      ],
    }),
    [],
  );

  const [footerLinks, setFooterLinks] = useState<FooterLinksConfig>(() => {
    const stored = readJsonAsset<FooterLinksConfig>('footer.links');
    if (stored?.columns?.length) return stored;
    return defaultFooterLinks;
  });

  useEffect(() => {
    if (!footerLinksOpen) return;
    const stored = readJsonAsset<FooterLinksConfig>('footer.links');
    setFooterLinks(stored?.columns?.length ? stored : defaultFooterLinks);
    setFooterLinksError(null);
  }, [defaultFooterLinks, footerLinksOpen]);

  const toolbarLinkProps = (href: string) => {
    const normalizedHref = normalizeToolbarHref(href);
    if (!normalizedHref || normalizedHref === '#') return { href: '#' as const };
    if (normalizedHref === 'whatsapp') {
      const digits = waMeDigits(readAsset('whatsapp.phone') || '905XXXXXXXXX');
      const waHref = digits.length >= 8 ? waMeUrl(digits, readAsset('whatsapp.defaultMessage') || 'Merhaba, bilgi almak istiyorum.') : '#';
      return { href: waHref, target: '_blank' as const, rel: 'noopener noreferrer' as const };
    }
    if (normalizedHref.startsWith('#')) return { href: normalizedHref };
    if (/^https?:/i.test(normalizedHref)) {
      return { href: normalizedHref, target: '_blank' as const, rel: 'noopener noreferrer' as const };
    }
    return { href: normalizedHref };
  };

  useEffect(() => {
    if (!menuOpen && !customerMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setCustomerMenuOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = menuRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) {
        setMenuOpen(false);
        setCustomerMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [customerMenuOpen, menuOpen]);

  useEffect(() => {
    if (!openToolbarMenuId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenToolbarMenuId(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = menuRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) setOpenToolbarMenuId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openToolbarMenuId]);

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-[60] px-4 pt-[max(0.9rem,env(safe-area-inset-top,0px))] sm:px-6 lg:px-9" ref={menuRef}>
        <div className="mx-auto grid w-full max-w-[1360px] grid-cols-[auto_1fr_auto] items-center gap-4 text-white max-lg:grid-cols-[auto_auto] max-lg:justify-between">
          <a
            href="/"
            className="relative min-h-11 max-w-[360px] overflow-hidden py-1 text-white max-sm:max-w-[min(72vw,330px)]"
            aria-label="Anasayfa"
            title="Anasayfa"
          >
            <span className="relative flex min-h-7 flex-col justify-center leading-tight">
              <span className="text-[21px] font-semibold uppercase tracking-[0.13em] text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)] md:text-[23px]">
                EZGI HALI PERDE
              </span>
              <span className="mt-1 text-[9px] font-mono uppercase tracking-[0.26em] text-white/58">
                PREMIUM HALI • PERDE • DOKUMA
              </span>
            </span>
          </a>

          <nav className="hidden min-w-0 items-center justify-center gap-8 lg:flex">
            {primaryNavItems.map((item, idx) => (
              <a
                key={item.href}
                href={item.href}
                className={`text-[13px] font-semibold uppercase tracking-[0.12em] transition hover:text-white ${
                  idx === 0 ? 'text-white' : 'text-white/58'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 items-center justify-end gap-2 max-md:max-w-[calc(100vw-2rem)] max-md:overflow-x-auto max-md:pb-1">
          <div className="hidden">
          <a className={pillClass} {...toolbarLinkProps(calendarHrefResolved)} aria-label="Takvim" title="Takvim">
            Takvim
          </a>
          {resolvedButtons.map((b) => {
            if (b.type === 'link') {
              const bl = b as ToolbarLinkItem;
              const visibleItems = (bl.items || []).filter((x) => x && x.enabled !== false);
              const wantDropdown = visibleItems.length > 1;

              // Plain anchor (no submenu) OR submenu forced into "single link button" behavior
              if (!wantDropdown) {
                const href = visibleItems.length
                  ? resolveToolbarItemsToHref(bl.items || [])
                  : normalizeToolbarHref(bl.href || '#');
                return (
                  <a key={bl.id} className={pillClass} {...toolbarLinkProps(href)} aria-label={bl.label} title={bl.label}>
                    {bl.label}
                  </a>
                );
              }

              const isOpen = openToolbarMenuId === bl.id;
              return (
                <div key={bl.id} className="relative">
                  <button
                    type="button"
                    className={pillClass}
                    onClick={() => setOpenToolbarMenuId((cur) => (cur === bl.id ? null : bl.id))}
                    aria-expanded={isOpen}
                    aria-label={bl.label}
                  >
                    <span className="inline-flex items-center gap-2">
                      {bl.label}
                      <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-[0_16px_60px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)] overflow-hidden">
                      {visibleItems.length ? (
                        visibleItems.map((it, idx) => {
                          if ((it as any).type === 'gallery') {
                            const g = it as any as { id: string; label: string };
                            return (
                              <a
                                key={g.id}
                                className={`block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition ${
                                  idx ? 'border-t border-black/10' : ''
                                }`}
                                href={`/portfolio?g=${encodeURIComponent(g.id)}`}
                                onClick={() => setOpenToolbarMenuId(null)}
                              >
                                {g.label}
                              </a>
                            );
                          }
                          if ((it as any).type === 'packages') {
                            const p = it as any as { id: string; label: string; packagesKind: 'all' | 'banner' | 'poster'; packagesScope?: string };
                            const href = packagesHref(p.packagesKind || 'banner', p.packagesScope);
                            return (
                              <a
                                key={p.id}
                                className={`block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition ${
                                  idx ? 'border-t border-black/10' : ''
                                }`}
                                href={href}
                                onClick={() => setOpenToolbarMenuId(null)}
                              >
                                {p.label}
                              </a>
                            );
                          }

                          const l = it as any as { id: string; label: string; href: string };
                          return (
                            <a
                              key={l.id}
                              className={`block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition ${
                                idx ? 'border-t border-black/10' : ''
                              }`}
                              {...toolbarLinkProps(l.href)}
                              onClick={() => setOpenToolbarMenuId(null)}
                            >
                              {l.label}
                            </a>
                          );
                        })
                      ) : (
                        <div className="px-4 py-3 text-sm text-[#051A24]/60">Menü boş</div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            }

            const visibleItems = (b.items || []).filter((x) => x && x.enabled !== false);
            const isOpen = openToolbarMenuId === b.id;
            return (
              <div key={b.id} className="relative">
                <button
                  type="button"
                  className={navActionClass}
                  onClick={() => setOpenToolbarMenuId((cur) => (cur === b.id ? null : b.id))}
                  aria-expanded={isOpen}
                  aria-label={b.label}
                >
                  <span className="inline-flex items-center gap-2">
                    {b.label}
                    <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {isOpen ? (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-[0_16px_60px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)] overflow-hidden">
                    {visibleItems.length ? (
                      visibleItems.map((it, idx) => {
                        if ((it as any).type === 'gallery') {
                          const g = it as any as { id: string; label: string };
                          return (
                            <a
                              key={g.id}
                              className={`block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition ${
                                idx ? 'border-t border-black/10' : ''
                              }`}
                              href={`/portfolio?g=${encodeURIComponent(g.id)}`}
                              onClick={() => setOpenToolbarMenuId(null)}
                            >
                              {g.label}
                            </a>
                          );
                        }
                        if ((it as any).type === 'packages') {
                          const p = it as any as { id: string; label: string; packagesKind: 'all' | 'banner' | 'poster'; packagesScope?: string };
                          const href = packagesHref(p.packagesKind || 'banner', p.packagesScope);
                          return (
                            <a
                              key={p.id}
                              className={`block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition ${
                                idx ? 'border-t border-black/10' : ''
                              }`}
                              href={href}
                              onClick={() => setOpenToolbarMenuId(null)}
                            >
                              {p.label}
                            </a>
                          );
                        }

                        const l = it as any as { id: string; label: string; href: string };
                        return (
                          <a
                            key={l.id}
                            className={`block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition ${
                              idx ? 'border-t border-black/10' : ''
                            }`}
                            {...toolbarLinkProps(l.href)}
                            onClick={() => setOpenToolbarMenuId(null)}
                          >
                            {l.label}
                          </a>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-[#051A24]/60">Menü boş</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          </div>

          {role === 'guest' ? (
            <button type="button" onClick={() => setOpen(true)} className={navActionClass}>
              {title}
            </button>
          ) : role === 'customer' ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  className={navActionClass}
                  onClick={() => setCustomerMenuOpen((v) => !v)}
                  aria-expanded={customerMenuOpen}
                  aria-label="Müşteri menü"
                >
                  <span className="inline-flex items-center gap-2">
                    {title}
                    <ChevronDown className={`h-4 w-4 transition ${customerMenuOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {customerMenuOpen ? (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-[0_16px_60px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)] overflow-hidden">
                    <a
                      className="block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition"
                      {...toolbarLinkProps(calendarHrefResolved)}
                      onClick={() => setCustomerMenuOpen(false)}
                    >
                      Takvim — randevu
                    </a>
                    <a
                      className="block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                      href="/inbox"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setCustomerMenuOpen(false)}
                    >
                      Gelen kutusu
                    </a>
                    <a
                      className="block w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                      href="/account"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setCustomerMenuOpen(false)}
                    >
                      Hesap ayarları
                    </a>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={navActionClass}
                onClick={logout}
                aria-label="Çıkış"
                title="Çıkış"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="relative">
                <button
                  type="button"
                  className={navActionClass}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-label="Yönetici menü"
                >
                  <span className="inline-flex items-center gap-2">
                    <PanelTop className="h-4 w-4" />
                    {title}
                    <ChevronDown className={`h-4 w-4 transition ${menuOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {menuOpen ? (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-[0_16px_60px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)] overflow-hidden">
                    <button
                      type="button"
                      className="hidden"
                      onClick={() => {
                        setToolbarError(null);
                        setToolbarOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      Toolbar düzenle
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                      onClick={() => {
                        setFooterLinksOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      Footer linkleri
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                      onClick={() => {
                        setMapOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      Harita ayarları
                    </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                    onClick={() => {
                      setMediaHubOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    Site medyaları
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                    onClick={() => {
                      setUsersOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    Kullanıcı yönetimi
                  </button>
                  <button
                    type="button"
                    className="hidden"
                    onClick={() => {
                      setSupportOpen(false);
                      setMenuOpen(false);
                    }}
                  >
                    Yardım & Kontrol
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-sm text-left hover:bg-black/[0.02] transition border-t border-black/10"
                    onClick={() => {
                      window.open('/inbox', '_blank', 'noreferrer');
                      setMenuOpen(false);
                    }}
                  >
                    Gelen kutusu
                  </button>
                  </div>
                ) : null}
              </div>

              <button type="button" className={navActionClass} onClick={logout} aria-label="Çıkış" title="Çıkış">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
          </div>
        </div>
      </div>

      {toolbarOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setToolbarOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-black/10 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Toolbar ayarları</div>
                <div className="text-xs text-white/58 mt-1">
                  Butonları buradan ekleyip silebilirsin. Değişiklikler sadece admin modda görünür.
                </div>
              </div>
              <button
                type="button"
                className="text-[#051A24]/60 hover:text-[#051A24] px-2"
                onClick={() => setToolbarOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <div className="space-y-3">
              {toolbarButtons.filter((b) => b.id !== 'calendar').map((b) => {
                const expanded = expandedToolbarId === b.id;
                const kindLabel =
                  b.type === 'menu'
                    ? (b as any).mode === 'link'
                      ? 'Açılır menü'
                      : 'Açılır menü'
                    : 'Buton';
                const itemCount =
                  b.type === 'menu' || b.type === 'link' ? (b.items || []).length : 0;
                return (
                <div key={b.id} className="rounded-2xl border border-black/10 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#051A24] truncate">{b.label || 'Adsız öğe'}</div>
                      <div className="text-[11px] text-[#051A24]/55 mt-0.5">
                        {kindLabel}
                        {itemCount ? ` · ${itemCount} alt öğe` : ''}
                        {!b.enabled ? ' · pasif' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#051A24]/70 inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setToolbarButtons((s) => s.map((x) => (x.id === b.id ? { ...x, enabled: checked } : x)));
                          }}
                        />
                        Aktif
                      </label>
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                        onClick={() => setExpandedToolbarId((cur) => (cur === b.id ? null : b.id))}
                      >
                        {expanded ? 'Kapat' : 'Düzenle'}
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                        onClick={() => {
                          setToolbarButtons((s) => s.filter((x) => x.id !== b.id));
                          setExpandedToolbarId((cur) => (cur === b.id ? null : cur));
                        }}
                        aria-label="Sil"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                        Sil
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Başlık</div>
                      <input
                        value={b.label}
                        onChange={(e) => {
                          const v = e.target.value;
                          setToolbarButtons((s) =>
                            s.map((x) => {
                              if (x.id !== b.id) return x;
                              if (x.type !== 'link') return { ...x, label: v };
                              const xl = x as ToolbarLinkItem;
                              const items = xl.items?.length
                                ? xl.items.map((it, i) => (i === 0 && xl.items!.length === 1 ? { ...it, label: v } : it))
                                : xl.items;
                              return { ...xl, label: v, items };
                            }),
                          );
                        }}
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                        placeholder="Örn: Takvim"
                      />
                    </div>

                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Tür</div>
                      <select
                        value={b.type === 'menu' ? 'menu' : 'link'}
                        onChange={(e) => {
                          const nextType = e.target.value as 'link' | 'menu';
                          setToolbarButtons((s) =>
                            s.map((x: ToolbarItemConfig) => {
                              if (x.id !== b.id) return x;
                              if (nextType === 'link') {
                                if (x.type === 'link') return x;
                                if (x.type === 'menu') {
                                  const xm = x as ToolbarMenuItem;
                                  return {
                                    id: xm.id,
                                    type: 'link',
                                    label: xm.label,
                                    href: '#',
                                    enabled: xm.enabled,
                                    items: xm.items.slice(),
                                  } as ToolbarLinkItem;
                                }
                                return x;
                              }

                              if (x.type === 'menu') return { ...x, mode: 'dropdown' };
                              if (x.type === 'link') {
                                const xl = x as ToolbarLinkItem;
                                return {
                                  id: xl.id,
                                  type: 'menu',
                                  label: xl.label,
                                  enabled: xl.enabled,
                                  mode: 'dropdown',
                                  href: undefined,
                                  items: Array.isArray(xl.items) ? xl.items.slice() : [],
                                };
                              }
                              return x;
                            }),
                          );
                        }}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                      >
                        <option value="link">Buton (link)</option>
                        <option value="menu">Açılır menü</option>
                      </select>
                    </div>
                  </div>

                  {b.type === 'menu' || b.type === 'link' ? (
                    <div className="mt-3 rounded-2xl border border-black/10 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-sm font-medium text-[#051A24]">
                          {b.type === 'menu' ? 'Menü öğeleri' : 'Buton hedefi'}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                            onClick={() => {
                              try {
                                persistToolbarButtons(toolbarButtons);
                                setToolbarSavedNote('Kaydedildi.');
                                window.setTimeout(() => setToolbarSavedNote(null), 1200);
                              } catch {
                                setToolbarSavedNote('Kaydedilemedi.');
                                window.setTimeout(() => setToolbarSavedNote(null), 2000);
                              }
                            }}
                            title="Sıralamayı kaydet"
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                            onClick={() => {
                              setToolbarButtons((s) =>
                                s.map((x) => {
                                  if (x.id !== b.id || x.type !== b.type) return x;
                                  const items = Array.isArray((x as ToolbarMenuItem).items) ? (x as ToolbarMenuItem).items : [];
                                  return {
                                    ...x,
                                    items: [
                                      ...items,
                                      { id: newId(), type: 'link', label: 'Yeni öğe', href: '/', enabled: true },
                                    ],
                                  };
                                }),
                              );
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Öğe ekle
                          </button>
                        </div>
                      </div>
                      {toolbarSavedNote ? <div className="text-[11px] text-[#051A24]/60 mb-2">{toolbarSavedNote}</div> : null}

                      <div className="hidden">
                        <div>
                          <div className="text-xs font-medium text-[#051A24]/80 mb-2">Davranış</div>
                          <select
                            value={(b as any).mode === 'link' ? 'link' : 'dropdown'}
                            onChange={(e) => {
                              const v = e.target.value === 'link' ? 'link' : 'dropdown';
                              setToolbarButtons((s) => s.map((x) => (x.id === b.id && x.type === 'menu' ? { ...x, mode: v } : x)));
                            }}
                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                          >
                            <option value="dropdown">Açılır menü</option>
                            <option value="link">Normal buton gibi (link)</option>
                          </select>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[#051A24]/80 mb-2">Buton linki</div>
                          <select
                            value={siteTargetSelectValue(String((b as any).href || ''))}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '__custom__') return;
                              setToolbarButtons((s) => s.map((x) => (x.id === b.id && x.type === 'menu' ? { ...x, href: v } : x)));
                            }}
                            className="mb-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                          >
                            {SITE_LINK_TARGETS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={String((b as any).href || '')}
                            onChange={(e) => {
                              const v = e.target.value;
                              setToolbarButtons((s) => s.map((x) => (x.id === b.id && x.type === 'menu' ? { ...x, href: v } : x)));
                            }}
                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="Boş bırak: ilk aktif öğeye gider"
                          />
                          <div className="text-[11px] text-[#051A24]/60 mt-1">
                            Boş bırakırsan: menüdeki ilk aktif öğeye yönlendirir.
                          </div>
                        </div>
                      </div>

                      {(b.items || []).length ? (
                        <div className="space-y-2">
                          {(b.items || []).map((it, idx) => (
                            <div key={it.id} className="rounded-2xl border border-black/10 p-3">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <label className="text-xs text-[#051A24]/70 inline-flex items-center gap-2 select-none">
                                  <input
                                    type="checkbox"
                                    checked={it.enabled}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setToolbarButtons((s) =>
                                        s.map((x) => {
                                          if (x.id !== b.id || x.type !== b.type) return x;
                                          const items = (x.items || []).slice();
                                          items[idx] = { ...items[idx], enabled: checked };
                                          return { ...x, items };
                                        }),
                                      );
                                    }}
                                  />
                                  Aktif
                                </label>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2 disabled:opacity-40"
                                    disabled={idx === 0}
                                    onClick={() => {
                                      if (idx === 0) return;
                                      setToolbarButtons((s) =>
                                        s.map((x) => {
                                          if (x.id !== b.id || x.type !== b.type) return x;
                                          const items = (x.items || []).slice();
                                          const tmp = items[idx - 1];
                                          items[idx - 1] = items[idx];
                                          items[idx] = tmp;
                                          return { ...x, items };
                                        }),
                                      );
                                    }}
                                    title="Yukarı"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2 disabled:opacity-40"
                                    disabled={idx === (b.items || []).length - 1}
                                    onClick={() => {
                                      if (idx >= b.items.length - 1) return;
                                      setToolbarButtons((s) =>
                                        s.map((x) => {
                                          if (x.id !== b.id || x.type !== b.type) return x;
                                          const items = (x.items || []).slice();
                                          const tmp = items[idx + 1];
                                          items[idx + 1] = items[idx];
                                          items[idx] = tmp;
                                          return { ...x, items };
                                        }),
                                      );
                                    }}
                                    title="Aşağı"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                                    onClick={() => {
                                      setToolbarButtons((s) =>
                                        s.map((x) => {
                                          if (x.id !== b.id || x.type !== b.type) return x;
                                          const items = (x.items || []).slice();
                                          items.splice(idx, 1);
                                          return { ...x, items };
                                        }),
                                      );
                                    }}
                                    title="Sil"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Sil
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input
                                  value={it.label}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setToolbarButtons((s) =>
                                      s.map((x) => {
                                        if (x.id !== b.id || x.type !== b.type) return x;
                                        const items = (x.items || []).slice() as any[];
                                        const currentHref = String(items[idx]?.href || '').trim();
                                        const oldBase = `/${toolbarSlugFromLabel(String(items[idx]?.label || ''))}`;
                                        const shouldAutoUpdate =
                                          !currentHref || currentHref === '#' || currentHref === oldBase || currentHref.startsWith(`${oldBase}-`);
                                        items[idx] = {
                                          ...items[idx],
                                          label: v,
                                          href: shouldAutoUpdate ? makeToolbarHrefFromLabel(v, s) : items[idx].href,
                                        };
                                        return { ...x, items };
                                      }),
                                    );
                                  }}
                                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                  placeholder="Başlık"
                                />
                                <select
                                  value={(it as any).type === 'gallery' ? 'gallery' : (it as any).type === 'packages' ? 'packages' : 'link'}
                                  onChange={(e) => {
                                    const nextType = e.target.value as 'link' | 'gallery' | 'packages';
                                    setToolbarButtons((s) =>
                                      s.map((x) => {
                                        if (x.id !== b.id || x.type !== b.type) return x;
                                        const items = (x.items || []).slice() as any[];
                                        const cur = items[idx] || {};
                                        if (nextType === 'gallery') {
                                          items[idx] = {
                                            id: cur.id || newId(),
                                            type: 'gallery',
                                            label: String(cur.label || 'Galeri'),
                                            enabled: Boolean(cur.enabled !== false),
                                            galleryKind: cur.galleryKind || 'mixed',
                                            galleryLayout: cur.galleryLayout || 'masonry',
                                          };
                                        } else if (nextType === 'packages') {
                                          const k = String(cur.packagesKind || 'banner').toLowerCase();
                                          const packagesKind = k === 'all' ? 'all' : k === 'poster' ? 'poster' : 'banner';
                                          items[idx] = {
                                            id: cur.id || newId(),
                                            type: 'packages',
                                            label: String(cur.label || (packagesKind === 'all' ? 'Banner + Afiş' : packagesKind === 'banner' ? 'Banner' : 'Afiş')),
                                            enabled: Boolean(cur.enabled !== false),
                                            packagesKind,
                                            packagesScope: normalizePackagesScope(cur.packagesScope || cur.scope, cur.label || ''),
                                          };
                                        } else {
                                          items[idx] = {
                                            id: cur.id || newId(),
                                            type: 'link',
                                            label: String(cur.label || 'Link'),
                                            href: cur.href || '/',
                                            enabled: Boolean(cur.enabled !== false),
                                          };
                                        }
                                        return { ...x, items };
                                      }),
                                    );
                                  }}
                                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                                >
                                  <option value="link">Link</option>
                                  <option value="gallery">Galeri (şablon)</option>
                                  <option value="packages">Banner / Afiş</option>
                                </select>

                                {(it as any).type === 'gallery' ? (
                                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <select
                                      value={(it as any).galleryKind || 'mixed'}
                                      onChange={(e) => {
                                        const v = e.target.value as 'photo' | 'video' | 'mixed';
                                        setToolbarButtons((s) =>
                                          s.map((x) => {
                                            if (x.id !== b.id || x.type !== b.type) return x;
                                            const items = (x.items || []).slice() as any[];
                                            items[idx] = { ...items[idx], galleryKind: v };
                                            return { ...x, items };
                                          }),
                                        );
                                      }}
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                                    >
                                      <option value="photo">Fotoğraf</option>
                                      <option value="video">Video</option>
                                      <option value="mixed">Karışık</option>
                                    </select>

                                    <select
                                      value={(it as any).galleryLayout || 'masonry'}
                                      onChange={(e) => {
                                        const v = e.target.value as 'masonry' | 'edge' | 'film';
                                        setToolbarButtons((s) =>
                                          s.map((x) => {
                                            if (x.id !== b.id || x.type !== b.type) return x;
                                            const items = (x.items || []).slice() as any[];
                                            items[idx] = { ...items[idx], galleryLayout: v };
                                            return { ...x, items };
                                          }),
                                        );
                                      }}
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                                    >
                                      <option value="masonry">Masonry</option>
                                      <option value="edge">Edge-to-edge</option>
                                      <option value="film">Film strip</option>
                                    </select>
                                  </div>
                                ) : (it as any).type === 'packages' ? (
                                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <select
                                      value={(it as any).packagesKind || 'banner'}
                                      onChange={(e) => {
                                        const v = e.target.value as 'all' | 'banner' | 'poster';
                                        setToolbarButtons((s) =>
                                          s.map((x) => {
                                            if (x.id !== b.id || x.type !== b.type) return x;
                                            const items = (x.items || []).slice() as any[];
                                            items[idx] = { ...items[idx], packagesKind: v };
                                            const labelFallback = v === 'all' ? 'Banner + Afiş' : v === 'banner' ? 'Banner' : 'Afiş';
                                            if (!String(items[idx].label || '').trim()) {
                                              items[idx] = { ...items[idx], label: labelFallback };
                                            }
                                            return { ...x, items };
                                          }),
                                        );
                                      }}
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                                    >
                                      <option value="all">Banner + Afiş (Hepsi)</option>
                                      <option value="banner">Banner</option>
                                      <option value="poster">Afiş</option>
                                    </select>
                                    <input
                                      value={(it as any).packagesScope || ''}
                                      onChange={(e) => {
                                        const v = slugifyToolbarScope(e.target.value);
                                        setToolbarButtons((s) =>
                                          s.map((x) => {
                                            if (x.id !== b.id || x.type !== b.type) return x;
                                            const items = (x.items || []).slice() as any[];
                                            items[idx] = { ...items[idx], packagesScope: v };
                                            return { ...x, items };
                                          }),
                                        );
                                      }}
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                      placeholder="Sayfa anahtarı: dugun, instagram..."
                                    />
                                  </div>
                                ) : (
                                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2">
                                    <select
                                      value={
                                        safeSiteTargets.some((opt) => opt.value === normalizeSiteHref((it as any).href || ''))
                                          ? normalizeSiteHref((it as any).href || '')
                                          : '/'
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setToolbarButtons((s) =>
                                          s.map((x) => {
                                            if (x.id !== b.id || x.type !== b.type) return x;
                                            const items = (x.items || []).slice() as any[];
                                            items[idx] = { ...items[idx], href: v };
                                            return { ...x, items };
                                          }),
                                        );
                                      }}
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                                    >
                                      {safeSiteTargets.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/60">
                                      Manuel link yok; hedefler site listesinden secilir.
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-[#051A24]/60">Henüz öğe yok.</div>
                      )}
                    </div>
                  ) : null}
                    </>
                  ) : null}
                </div>
                );
              })}
              </div>

            {toolbarError ? <div className="text-xs text-red-600 mt-2">{toolbarError}</div> : null}

            <div className="mt-4 border-t border-black/10 pt-4">
              <div className="text-xs font-medium text-[#051A24]/70 mb-2">Yeni öğe ekle</div>
              <div className="flex flex-wrap gap-2 justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                    onClick={() => {
                      const id = newId();
                      const subId = newId();
                      setToolbarButtons((s) => [
                        ...s,
                        {
                          id,
                          type: 'link',
                          label: 'Yeni buton',
                          href: '#',
                          enabled: true,
                          items: [
                            {
                              id: subId,
                              type: 'gallery',
                              label: 'Yeni buton',
                              enabled: true,
                              galleryKind: 'mixed',
                              galleryLayout: 'masonry',
                            },
                          ],
                        },
                      ]);
                      setExpandedToolbarId(id);
                      setToolbarError(null);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Buton
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-2"
                    onClick={() => {
                      const id = newId();
                      setToolbarButtons((s) => [
                        ...s,
                        {
                          id,
                          type: 'menu',
                          label: 'Yeni menü',
                          enabled: true,
                          mode: 'dropdown',
                          items: [{ id: newId(), type: 'link', label: 'Yeni öğe', href: '/', enabled: true }],
                        },
                      ]);
                      setExpandedToolbarId(id);
                      setToolbarError(null);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Açılır menü
                  </button>
                  <button
                    type="button"
                    className="hidden"
                    onClick={() => {
                      const id = newId();
                      setToolbarButtons((s) => [
                        ...s,
                        {
                          id,
                          type: 'menu',
                          label: 'Yeni buton',
                          enabled: true,
                          mode: 'link',
                          href: '/',
                          items: [{ id: newId(), type: 'link', label: 'Yeni öğe', href: '/', enabled: true }],
                        },
                      ]);
                      setExpandedToolbarId(id);
                      setToolbarError(null);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Buton + öğeler
                  </button>
                </div>

              <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => {
                  setToolbarButtons(defaultButtons);
                  setToolbarError(null);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                onClick={() => {
                  try {
                    persistToolbarButtons(toolbarButtons);
                    setToolbarOpen(false);
                  } catch (e: any) {
                    setToolbarError(e?.message || 'Kaydetme hatası.');
                  }
                }}
              >
                Kaydet
              </button>
              </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {mediaHubOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMediaHubOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-black/10 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Site medyaları</div>
                <div className="text-xs text-[#051A24]/70 mt-1">Logo, ana sayfa görselleri ve blok sırası.</div>
              </div>
              <button
                type="button"
                className="text-[#051A24]/60 hover:text-[#051A24] px-2"
                onClick={() => setMediaHubOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="hidden">
                <div className="text-xs font-semibold text-[#051A24]">Site medya merkezi</div>
                <div className="hidden">
                  Logo, hero, marquee içeriği, partner efekti ve ana sayfa büyük projeler dahil içerikler bu panelde.
                  Ana sayfadaki blok sırası bir alttaki &quot;Ana sayfa blok sırası&quot;ndan düzenlenir ve kaydedilir.
                </div>
              </div>

              <div className="hidden">
                <div className="text-xs font-semibold text-[#051A24] mb-2">Bolum sec</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    ['layout', 'Blok sirasi'],
                    ['brand', 'Logo & hero'],
                    ['homeMedia', 'Ana medya'],
                    ['promo', 'Banner & logo'],
                    ['advanced', 'Efektler'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`rounded-xl px-3 py-2 text-xs border transition ${
                        mediaHubSection === id
                          ? 'bg-[#051A24] text-white border-[#051A24]'
                          : 'bg-white text-[#051A24] border-black/10 hover:bg-black/[0.03]'
                      }`}
                      onClick={() => setMediaHubSection(id as MediaHubSection)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hidden">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#051A24]">Hızlı başlangıç</div>
                    <div className="text-xs text-[#051A24]/70 mt-1">
                      Sunum için düğün/fotoğrafçılık görsellerini otomatik doldurabilir, sonra aşağıdan tek tek düzenleyebilirsin.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="hidden rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={applyWeddingPresentationMedia}
                  >
                    Düğün temalı medyaları uygula
                  </button>
                </div>
              </div>

              <div className={`${mediaHubSection === 'layout' ? '' : 'hidden'} rounded-2xl border border-black/10 p-4 space-y-3`}>
                <div className="text-sm font-semibold text-[#051A24]">Ana sayfa blok sırası</div>
                <p className="text-xs text-[#051A24]/70">
                  Hero’dan sonra: marquee, fiyat, yorum carousel’i, büyük proje satırları ve partner. Sırayı değiştir, yeni blok
                  ekle veya satırı sil; medya URL’leri aşağıdaki bölümlerde aynı kalır.
                </p>
                <div className="space-y-2 max-h-[min(40vh,320px)] overflow-y-auto pr-1">
                  {homeMediaLayoutDraft.map((block, idx) => (
                    <div
                      key={block.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-sm"
                    >
                      <button
                        type="button"
                        className="flex flex-1 min-w-0 items-center text-left text-[#051A24]"
                        onClick={() => setExpandedHomeBlockId((cur) => (cur === block.id ? null : block.id))}
                        aria-expanded={expandedHomeBlockId === block.id}
                      >
                        <ChevronDown
                          className={`mr-2 h-4 w-4 shrink-0 text-[#051A24]/60 transition ${
                            expandedHomeBlockId === block.id ? 'rotate-180' : ''
                          }`}
                        />
                        <span className="text-[#051A24]/55 text-xs mr-2 tabular-nums">{idx + 1}.</span>
                        <span className="font-medium">{labelHomeMediaBlock(block, projectBlockTitles)}</span>
                        <span className="ml-2 text-[11px] text-[#051A24]/45">Metinleri duzenle</span>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          className="p-2 rounded-lg border border-black/10 hover:bg-white disabled:opacity-35 disabled:pointer-events-none"
                          disabled={idx === 0}
                          onClick={() =>
                            setHomeMediaLayoutDraft((prev) => {
                              const next = [...prev];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              return next;
                            })
                          }
                          aria-label="Yukarı taşı"
                        >
                          <ArrowUp className="w-4 h-4 text-[#051A24]" />
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-lg border border-black/10 hover:bg-white disabled:opacity-35 disabled:pointer-events-none"
                          disabled={idx >= homeMediaLayoutDraft.length - 1}
                          onClick={() =>
                            setHomeMediaLayoutDraft((prev) => {
                              const next = [...prev];
                              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                              return next;
                            })
                          }
                          aria-label="Aşağı taşı"
                        >
                          <ArrowDown className="w-4 h-4 text-[#051A24]" />
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-lg border border-black/10 hover:bg-red-50 text-red-700/90"
                          onClick={() => setHomeMediaLayoutDraft((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {expandedHomeBlockId === block.id ? (
                        <div className="w-full border-t border-black/10 bg-white p-3">{renderBlockTextEditors(block)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-medium text-[#051A24]/80 mb-2">Blok ekle</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'marquee' }])
                      }
                    >
                      + Marquee
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'pricing' }])
                      }
                    >
                      + Fiyatlar
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'carousel' }])
                      }
                    >
                      + Yorum carousel
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'partner' }])
                      }
                    >
                      + Partner
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'salesBanner' }])
                      }
                    >
                      + Satış banner
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'trustedLogos' }])
                      }
                    >
                      + Büyük markalar
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'faq' }])
                      }
                    >
                      + SSS
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [...prev, { id: newHomeBlockId('hm'), type: 'people' }])
                      }
                    >
                      + Portre/ekip
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-3 py-1.5 text-xs border border-black/10 hover:bg-black/[0.03] active:scale-95 transition"
                      onClick={() =>
                        setHomeMediaLayoutDraft((prev) => [
                          ...prev,
                          { id: newHomeBlockId('hm'), type: 'project', projectId: PJ[0].id },
                        ])
                      }
                    >
                      + Büyük proje
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => {
                      writeJsonAsset('site.home.mediaLayout', homeMediaLayoutDraft);
                      bumpAssetsVersion();
                    }}
                  >
                    Sıralamayı kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      clearAsset('site.home.mediaLayout');
                      bumpAssetsVersion();
                      setHomeMediaLayoutDraft(normalizeHomeMediaLayout(null));
                    }}
                  >
                    Varsayılan sıraya dön
                  </button>
                </div>
              </div>

              <div className={`${mediaHubSection === 'promo' ? '' : 'hidden'} rounded-2xl border border-black/10 p-4`}>
                <div className="text-sm font-semibold text-[#051A24] mb-1">Satış banner (büyük görsel/video + alt metin)</div>
                <div className="text-xs text-[#051A24]/70 mb-3">
                  Bu içerik şu an ana sayfada görünmez; satış/landing sayfalarında kullanmak için hazırlar.
                </div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs font-semibold text-[#051A24]">Önerilen medya</div>
                  <div className="text-xs text-[#051A24]/70 mt-1">
                    {String(salesBannerWidthDraft || 'contained') === 'full' ? (
                      <>
                        Tam genişlik için: Görsel <span className="font-medium text-[#051A24]">2400×900+</span> (8:3) veya{' '}
                        <span className="font-medium text-[#051A24]">2560×960+</span> (ultra-wide). Video{' '}
                        <span className="font-medium text-[#051A24]">MP4 (H.264)</span> /{' '}
                        <span className="font-medium text-[#051A24]">WebM</span> · 5–12sn döngü.
                      </>
                    ) : (
                      <>
                        Container için: Görsel <span className="font-medium text-[#051A24]">2000×750+</span> (8:3) veya{' '}
                        <span className="font-medium text-[#051A24]">2400×900+</span> (daha keskin). Video{' '}
                        <span className="font-medium text-[#051A24]">MP4 (H.264)</span> /{' '}
                        <span className="font-medium text-[#051A24]">WebM</span> · 5–12sn döngü.
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 overflow-hidden bg-black/[0.02] mb-3">
                  {String(salesBannerMedia || '').toLowerCase().startsWith('data:video/') ||
                  /\.(mp4|webm|ogg)(\\?|#|$)/i.test(String(salesBannerMedia || '')) ? (
                    <video src={salesBannerMedia} className="w-full h-[200px] object-cover" autoPlay muted loop playsInline />
                  ) : (
                    <img src={salesBannerMedia} alt="" className="w-full h-[200px] object-cover" />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Genişlik</div>
                    <select
                      value={salesBannerWidthDraft}
                      onChange={(e) => setSalesBannerWidthDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="contained">Container (max genişlik)</option>
                      <option value="full">Tam genişlik</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Yükseklik (px)</div>
                    <input
                      type="number"
                      min={140}
                      max={900}
                      value={Number(salesBannerHeightPxDraft) || 360}
                      onChange={(e) => setSalesBannerHeightPxDraft(String(e.target.value))}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    />
                    <div className="text-[11px] text-[#051A24]/55 mt-1">Örn: 280 (kısa), 360 (orta), 520 (büyük)</div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-xs font-medium text-[#051A24]/80 mb-2">Köşeler</div>
                  <select
                    value={salesBannerCornersDraft}
                    onChange={(e) => setSalesBannerCornersDraft(e.target.value)}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                  >
                    <option value="soft">Yumuşak (rounded)</option>
                    <option value="sharp">Keskin (premium)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Overlay pozisyon</div>
                    <select
                      value={salesBannerOverlayPosDraft}
                      onChange={(e) => setSalesBannerOverlayPosDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="top-left">Üst sol</option>
                      <option value="top-center">Üst orta</option>
                      <option value="top-right">Üst sağ</option>
                      <option value="center-left">Orta sol</option>
                      <option value="center">Orta</option>
                      <option value="center-right">Orta sağ</option>
                      <option value="bottom-left">Alt sol</option>
                      <option value="bottom-center">Alt orta</option>
                      <option value="bottom-right">Alt sağ</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Overlay renk</div>
                    <select
                      value={salesBannerOverlayColorDraft}
                      onChange={(e) => setSalesBannerOverlayColorDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="light">Açık (beyaz yazı)</option>
                      <option value="dark">Koyu (siyah yazı)</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs font-semibold text-[#051A24]">Overlay metinleri</div>
                  <div className="text-xs text-[#051A24]/70 mt-1">
                    Başlık/alt başlık ve buton yazısı sayfanın üstünde “Düzenle” ile de değiştirilebilir. Buradan sadece
                    konum/renk ve buton linkini ayarlıyoruz.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">CTA (buton)</div>
                    <select
                      value={salesBannerCtaEnabledDraft}
                      onChange={(e) => setSalesBannerCtaEnabledDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="0">Kapalı</option>
                      <option value="1">Açık</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">CTA link (href)</div>
                    <select
                      value={safeSiteTargets.some((opt) => opt.value === normalizeSiteHref(salesBannerCtaHrefDraft)) ? normalizeSiteHref(salesBannerCtaHrefDraft) : '/calendar'}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSalesBannerCtaHrefDraft(v);
                      }}
                      className="mb-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      {safeSiteTargets.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Banner medya URL</div>
                <input
                  value={salesBannerMediaDraft}
                  onChange={(e) => setSalesBannerMediaDraft(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 font-mono"
                  placeholder="https://... veya data:..."
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => setSalesBannerMedia(salesBannerMediaDraft.trim() || DEFAULT_SALES_BANNER_MEDIA)}
                  >
                    Medyayı kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => {
                      const w = String(salesBannerWidthDraft || 'contained').trim().toLowerCase();
                      setSalesBannerWidth(w === 'full' ? 'full' : 'contained');
                      const n = Number(salesBannerHeightPxDraft);
                      const clamped = Number.isFinite(n) ? Math.min(900, Math.max(140, Math.floor(n))) : 360;
                      setSalesBannerHeightPx(String(clamped));
                      const c = String(salesBannerCornersDraft || 'soft').trim().toLowerCase();
                      setSalesBannerCorners(c === 'sharp' ? 'sharp' : 'soft');
                      const pos = String(salesBannerOverlayPosDraft || 'center-left').trim().toLowerCase();
                      setSalesBannerOverlayPos(pos);
                      const col = String(salesBannerOverlayColorDraft || 'light').trim().toLowerCase();
                      setSalesBannerOverlayColor(col === 'dark' ? 'dark' : 'light');
                      const enabled = String(salesBannerCtaEnabledDraft || '0').trim() === '1' ? '1' : '0';
                      setSalesBannerCtaEnabled(enabled);
                      setSalesBannerCtaHref(String(salesBannerCtaHrefDraft || '#').trim() || '#');
                    }}
                  >
                    Boyutu kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetSalesBannerMedia();
                      setSalesBannerMediaDraft(DEFAULT_SALES_BANNER_MEDIA);
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetSalesBannerWidth();
                      resetSalesBannerHeightPx();
                      resetSalesBannerCorners();
                      resetSalesBannerOverlayPos();
                      resetSalesBannerOverlayColor();
                      resetSalesBannerCtaEnabled();
                      resetSalesBannerCtaHref();
                      setSalesBannerWidthDraft('contained');
                      setSalesBannerHeightPxDraft('360');
                      setSalesBannerCornersDraft('soft');
                      setSalesBannerOverlayPosDraft('center-left');
                      setSalesBannerOverlayColorDraft('light');
                      setSalesBannerCtaEnabledDraft('0');
                      setSalesBannerCtaHrefDraft('#');
                    }}
                  >
                    Boyutu reset
                  </button>
                  <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                    {salesBannerBusy ? 'Yükleniyor…' : 'Dosya yükle'}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      disabled={salesBannerBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setSalesBannerBusy(true);
                        try {
                          const dataUrl = await fileToDataUrl(file);
                          setSalesBannerMedia(dataUrl);
                          setSalesBannerMediaDraft(dataUrl);
                        } finally {
                          setSalesBannerBusy(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-medium text-[#051A24]/80 mb-2">Alt metin</div>
                  <textarea
                    value={salesBannerTextDraft}
                    onChange={(e) => setSalesBannerTextDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-y"
                    placeholder="Örn: Paketi bugün al, portrelerini 10× daha hızlı teslim et."
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                      onClick={() => setSalesBannerText(salesBannerTextDraft)}
                    >
                      Metni kaydet
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                      onClick={() => {
                        resetSalesBannerText();
                        setSalesBannerTextDraft('Kısa bir alt metin yaz (fiyat/teklif/garanti gibi).');
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              <div className={`${mediaHubSection === 'promo' ? '' : 'hidden'} rounded-2xl border border-black/10 p-4`}>
                <div className="text-sm font-semibold text-[#051A24] mb-1">Büyük markalar (Trusted by)</div>
                <div className="text-xs text-[#051A24]/70 mb-3">
                  Premium güven bölümü: 6–12 logo idealdir. Logolar PNG/SVG (tercihen transparan) veya düz beyaz zeminli olursa daha iyi.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Layout</div>
                    <select
                      value={trustedLogosLayoutDraft}
                      onChange={(e) => setTrustedLogosLayoutDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="grid">Grid (kartlı)</option>
                      <option value="strip">Şerit (minimal)</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Görünüm</div>
                    <select
                      value={trustedLogosToneDraft}
                      onChange={(e) => setTrustedLogosToneDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="mono-dim">Mono + Dim (premium)</option>
                      <option value="mono">Mono (daha belirgin)</option>
                      <option value="color">Renkli</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Önerilen boyut</div>
                    <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/70">
                      Logo görseli: <span className="font-medium text-[#051A24]">en az 400×160</span> (tercihen 800×320) ·{" "}
                      <span className="font-medium text-[#051A24]">SVG</span> en iyisi.
                    </div>
                  </div>
                </div>

                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Logolar</div>
                {trustedLogosItemsDraft.length ? (
                  <div className="space-y-2">
                    {trustedLogosItemsDraft.map((src, idx) => (
                      <div
                        key={`tlogo-${idx}`}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 flex items-center gap-2"
                      >
                        <div className="w-14 h-10 rounded-lg border border-black/10 bg-black/[0.02] flex items-center justify-center overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
                          <img src={src} alt="" className="max-w-full max-h-full object-contain opacity-80" />
                        </div>
                        <input
                          value={src}
                          onChange={(e) =>
                            setTrustedLogosItemsDraft((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                          }
                          className="flex-1 min-w-0 rounded-lg border border-black/10 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black/10 font-mono"
                          placeholder="https://.../logo.svg"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            className="p-2 rounded-lg border border-black/10 hover:bg-black/[0.03] disabled:opacity-35 disabled:pointer-events-none"
                            disabled={idx === 0}
                            onClick={() =>
                              setTrustedLogosItemsDraft((prev) => {
                                const next = [...prev];
                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                return next;
                              })
                            }
                            aria-label="Yukarı"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg border border-black/10 hover:bg-black/[0.03] disabled:opacity-35 disabled:pointer-events-none"
                            disabled={idx === trustedLogosItemsDraft.length - 1}
                            onClick={() =>
                              setTrustedLogosItemsDraft((prev) => {
                                const next = [...prev];
                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                return next;
                              })
                            }
                            aria-label="Aşağı"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => setTrustedLogosItemsDraft((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-[#051A24]/70">
                    Henüz logo yok. “Logo ekle” ile başlayabilirsin.
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => setTrustedLogosItemsDraft((prev) => [...prev, ''])}
                  >
                    + Logo ekle (URL)
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => {
                      const l = String(trustedLogosLayoutDraft || 'grid').trim().toLowerCase();
                      setTrustedLogosLayout(l === 'strip' ? 'strip' : 'grid');
                      const cleaned = trustedLogosItemsDraft.map((x) => x.trim()).filter(Boolean);
                      const joined = cleaned.join('\n');
                      setTrustedLogosRaw(joined);
                      setTrustedLogosDraft(joined);
                      const t = String(trustedLogosToneDraft || 'mono-dim').trim().toLowerCase();
                      setTrustedLogosTone(t === 'color' ? 'color' : t === 'mono' ? 'mono' : 'mono-dim');
                    }}
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetTrustedLogosRaw();
                      resetTrustedLogosLayout();
                      resetTrustedLogosTone();
                      setTrustedLogosDraft('');
                      setTrustedLogosItemsDraft([]);
                      setTrustedLogosLayoutDraft('grid');
                      setTrustedLogosToneDraft('mono-dim');
                    }}
                  >
                    Reset
                  </button>
                  <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                    {trustedLogosBusy ? 'Yükleniyor…' : 'Logo yükle'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={trustedLogosBusy}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setTrustedLogosBusy(true);
                        try {
                          const urls: string[] = [];
                          for (const f of files) {
                            // eslint-disable-next-line no-await-in-loop
                            urls.push(await fileToDataUrl(f));
                          }
                          setTrustedLogosItemsDraft((prev) => [...prev.filter((x) => x.trim()), ...urls]);
                        } finally {
                          setTrustedLogosBusy(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 p-4">
                <div className="text-sm font-semibold text-[#051A24] mb-3">Sol üst marka / logo</div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs font-semibold text-[#051A24]">Önerilen logo</div>
                  <div className="text-xs text-[#051A24]/70 mt-1">
                    Format: <span className="font-medium text-[#051A24]">SVG</span> veya{" "}
                    <span className="font-medium text-[#051A24]">şeffaf PNG</span> · Yükseklik:{" "}
                    <span className="font-medium text-[#051A24]">36–48px</span> · Maks genişlik:{" "}
                    <span className="font-medium text-[#051A24]">~220px</span>. Yazı arkası modunda sade monogram/ikon daha iyi durur.
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Görünüm</div>
                    <select
                      value={brandLogoModeDraft}
                      onChange={(e) => setBrandLogoModeDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                    >
                      <option value="text">Sadece yazı</option>
                      <option value="behindText">Logo yazının arkasında</option>
                      <option value="logo">Sadece logo</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Başlık</div>
                    <input
                      value={brandTitleDraft}
                      onChange={(e) => setBrandTitleDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      placeholder="Retro Fotoğraf & Video Atölyesi"
                    />
                  </div>
                </div>
                <div className="text-xs font-medium text-[#051A24]/80 mt-3 mb-2">Alt metin</div>
                <input
                  value={brandTaglineDraft}
                  onChange={(e) => setBrandTaglineDraft(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Wedding • Portrait • Film"
                />
                <div className="text-xs font-medium text-[#051A24]/80 mt-3 mb-2">Logo URL (SVG/PNG önerilir)</div>
                <input
                  value={brandLogoDraft}
                  onChange={(e) => setBrandLogoDraft(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="https://... (svg/png/webp)"
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => {
                      const mode =
                        brandLogoModeDraft === 'logo' || brandLogoModeDraft === 'behindText' ? brandLogoModeDraft : 'text';
                      setBrandLogoMode(mode);
                      setBrandTitle(brandTitleDraft.trim() || 'Retro Fotoğraf & Video Atölyesi');
                      setBrandTaglineText(brandTaglineDraft.trim());
                      setBrandLogoUrl(brandLogoDraft.trim());
                    }}
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetBrandLogoUrl();
                      resetBrandLogoMode();
                      resetBrandTitle();
                      resetBrandTaglineText();
                      setBrandLogoDraft('');
                      setBrandLogoModeDraft('text');
                      setBrandTitleDraft('Retro Fotoğraf & Video Atölyesi');
                      setBrandTaglineDraft('Wedding • Portrait • Film');
                    }}
                  >
                    Reset
                  </button>
                  <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                    Dosya yükle
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await fileToDataUrl(file);
                        setBrandLogoDraft(dataUrl);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 p-4">
                <div className="text-sm font-semibold text-[#051A24] mb-3">Hero playlist (foto + video)</div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs text-[#051A24]/70">
                    Her satıra 1 URL. Fotoğraf/gif anında görünür; video’lar sırayla oynar. Hepsi bitince başa döner.
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs font-semibold text-[#051A24]">Önerilen medya</div>
                  <div className="text-xs text-[#051A24]/70 mt-1">
                    Video: <span className="font-medium text-[#051A24]">MP4 (H.264)</span> veya{" "}
                    <span className="font-medium text-[#051A24]">WebM</span> · Çözünürlük:{" "}
                    <span className="font-medium text-[#051A24]">1920×1080+</span> · Süre:{" "}
                    <span className="font-medium text-[#051A24]">3–10sn</span> · Bitrate:{" "}
                    <span className="font-medium text-[#051A24]">~6–12 Mbps</span>
                    <br />
                    Görsel: <span className="font-medium text-[#051A24]">WebP/JPG</span> ·{" "}
                    <span className="font-medium text-[#051A24]">2000px+</span> genişlik · (ilk satıra görsel koymak
                    açılışı çok stabil yapar)
                  </div>
                </div>
                <div className="mb-3 rounded-xl border border-black/10 bg-white p-3">
                  <div className="text-xs font-semibold text-[#051A24] mb-3">Hero metinleri</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {renderAssetTextField('hero.title', 'Ana baslik', 'Retro Fotoğraf & Video Atölyesi')}
                    {renderAssetTextField('hero.subtitle', 'Kucuk alt baslik', 'The Photograph Studio')}
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {renderAssetTextField('hero.line1.prefix', 'Vurgu satiri 1', 'Aşkın En Güzel ')}
                    {renderAssetTextField('hero.line1.italic', 'Vurgulu kelime 1', 'Anılarıyla')}
                    {renderAssetTextField('hero.line2.prefix', 'Vurgu satiri 2', 'Baş Başa Kalın')}
                    {renderAssetTextField('hero.line2.suffix', 'Satir sonu', '...')}
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {renderAssetTextField('hero.p1', 'Paragraf 1', 'Anılarınızı sonsuzlukla taçlandırmak için, 10 yıl aşkın süredir hizmetinizde olmaktan gurur duyuyoruz.', true)}
                    {renderAssetTextField('hero.p2', 'Paragraf 2', 'En mutlu anlarınızda, ana odaklanmanız için her geçen gün kendimizi geliştiriyoruz.', true)}
                    {renderAssetTextField('hero.p3', 'Paragraf 3', 'Projeleri Bütçelerinize Bakarak Değil, Geleceğinizle Şekillendiriyoruz.', true)}
                  </div>
                </div>
                {renderMediaRows(heroBgPlaylistDraft, setHeroBgPlaylistDraft, 'Hero playlist icin medya ekle.')}
                <details className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                  <summary className="cursor-pointer text-xs font-medium text-[#051A24]/75">Gelismis URL listesi</summary>
                  <textarea
                    value={heroBgPlaylistDraft}
                    onChange={(e) => setHeroBgPlaylistDraft(e.target.value)}
                    rows={4}
                    className="mt-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-y"
                    placeholder="https://.../poster.webp\nhttps://.../video1.mp4\nhttps://.../video2.mp4"
                  />
                </details>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-[#051A24]/80 mb-2">Foto/gif süresi (sn)</div>
                    <input
                      value={heroPlaylistImageSecondsDraft}
                      onChange={(e) => setHeroPlaylistImageSecondsDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      placeholder="4"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => {
                      setHeroBgPlaylist(heroBgPlaylistDraft.trim());
                      setHeroPlaylistImageSeconds(heroPlaylistImageSecondsDraft.trim() || '4');
                    }}
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetHeroBgPlaylist();
                      setHeroBgPlaylistDraft('');
                    }}
                  >
                    Reset
                  </button>
                  <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                    Video yükle (ekle)
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        const urls: string[] = [];
                        for (const f of files) {
                          // eslint-disable-next-line no-await-in-loop
                          urls.push(await fileToDataUrl(f));
                        }
                        const existing = (heroBgPlaylistDraft || '').trim();
                        const next = [existing, ...urls].filter(Boolean).join('\n');
                        setHeroBgPlaylistDraft(next);
                        setHeroBgPlaylist(next.trim());
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Hero arkaplan medya URL</div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs text-[#051A24]/70">
                    Tek medya kullanacaksan: Video için <span className="font-medium text-[#051A24]">MP4/WebM</span>, görsel
                    için <span className="font-medium text-[#051A24]">WebP/JPG</span>. Önerilen:{" "}
                    <span className="font-medium text-[#051A24]">1920×1080+</span>, 3–10sn loop.
                  </div>
                </div>
                <input
                  value={heroBgDraft}
                  onChange={(e) => setHeroBgDraft(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="https://... (mp4/webm veya görsel/gif)"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                  onClick={() => setHeroBgMedia(heroBgDraft.trim())}
                >
                  Kaydet
                </button>
                <button
                  type="button"
                  className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                  onClick={() => {
                    resetHeroBgMedia();
                    setHeroBgDraft('');
                  }}
                >
                  Reset
                </button>
                <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                  Dosya yükle
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      setHeroBgMedia(dataUrl);
                      setHeroBgDraft(dataUrl);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className={`${mediaHubSection === 'homeMedia' ? '' : 'hidden'} rounded-2xl border border-black/10 p-4`}>
                <div className="text-sm font-semibold text-[#051A24] mb-1">Marquee şeridi</div>
                <div className="text-xs text-[#051A24]/70 mb-3">
                  Ana sayfadaki yatay sonsuz şerit. Her satır bir medya; sıra soldan sağa kullanılır (gif/mp4/webp).
                </div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-3">
                  <div className="text-xs font-semibold text-[#051A24]">Önerilen medya</div>
                  <div className="text-xs text-[#051A24]/70 mt-1">
                    Şeritte her öğe sabit{" "}
                    <span className="font-medium text-[#051A24]">~280px (mobil) / ~500px (masaüstü)</span> yükseklikte
                    gösterilir; genişlik dosyanın oranına göre otomatik ayarlanır, taşan kısımlar kırpılabilir.
                    <br />
                    Dikey / “kart” görünümü (telefon mockup, poster): oran{" "}
                    <span className="font-medium text-[#051A24]">3:4</span>,{" "}
                    <span className="font-medium text-[#051A24]">4:5</span> veya{" "}
                    <span className="font-medium text-[#051A24]">9:16</span> — kaynak örneği{" "}
                    <span className="font-medium text-[#051A24]">1080×1350</span> veya{" "}
                    <span className="font-medium text-[#051A24]">1200×1500</span> (retina için yükseklik{" "}
                    <span className="font-medium text-[#051A24]">1000px+</span>).
                    <br />
                    Kare: <span className="font-medium text-[#051A24]">1000×1000</span> veya{" "}
                    <span className="font-medium text-[#051A24]">1200×1200</span>. Yatay vitrin:{" "}
                    <span className="font-medium text-[#051A24]">1600×900</span> (16:9) veya{" "}
                    <span className="font-medium text-[#051A24]">1920×1080</span>; şeritte daha geniş bir karo oluşur.
                    <br />
                    Video: <span className="font-medium text-[#051A24]">MP4 (H.264)</span> veya{" "}
                    <span className="font-medium text-[#051A24]">WebM</span>, kısa döngü{" "}
                    <span className="font-medium text-[#051A24]">3–12 sn</span>, bitrate{" "}
                    <span className="font-medium text-[#051A24]">~5–10 Mbps</span>. Görsel / gif:{" "}
                    <span className="font-medium text-[#051A24]">WebP</span>,{" "}
                    <span className="font-medium text-[#051A24]">JPG</span>,{" "}
                    <span className="font-medium text-[#051A24]">GIF</span>. Çok farklı oranları aynı şeritte
                    karıştırabilirsin; görsel ritim için 2–4 öğede benzer yükseklik/oran tutmak daha düzenli durur.
                  </div>
                </div>
                {renderMediaRows(marqueeDraft, setMarqueeDraft, 'Marquee icin medya ekle.')}
                <details className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                  <summary className="cursor-pointer text-xs font-medium text-[#051A24]/75">Gelismis URL listesi</summary>
                  <textarea
                    value={marqueeDraft}
                    onChange={(e) => setMarqueeDraft(e.target.value)}
                    rows={5}
                    className="mt-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-y font-mono"
                    placeholder="https://...\nhttps://..."
                  />
                </details>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => {
                      const t = marqueeDraft.trim();
                      setMarqueeUrls(t);
                      syncMarqueeSlotsToAssets(t);
                    }}
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetMarqueeUrls();
                      const d = DEFAULT_LOOP_MEDIA_URLS.join('\n');
                      setMarqueeDraft(d);
                      syncMarqueeSlotsToAssets(d);
                    }}
                  >
                    Reset
                  </button>
                  <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                    {marqueeBusy ? 'Yükleniyor…' : 'Dosya ekle'}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      disabled={marqueeBusy}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setMarqueeBusy(true);
                        try {
                          const urls: string[] = [];
                          for (const f of files) {
                            // eslint-disable-next-line no-await-in-loop
                            urls.push(await fileToDataUrl(f));
                          }
                          const next = [marqueeDraft.trim(), ...urls].filter(Boolean).join('\n');
                          setMarqueeDraft(next);
                          setMarqueeUrls(next);
                          syncMarqueeSlotsToAssets(next);
                        } finally {
                          setMarqueeBusy(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className={`${mediaHubSection === 'homeMedia' ? '' : 'hidden'} rounded-2xl border border-black/10 p-4`}>
                <div className="text-sm font-semibold text-[#051A24] mb-1">Ana sayfa — Projeler (büyük medya)</div>
                <div className="text-xs text-[#051A24]/70 mb-3">
                  Her blok için alt medya buradan; kart başlığını sayfada değiştirirsen aşağıdaki etiketler de güncellenir.
                </div>
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 mb-4">
                  <div className="text-xs font-semibold text-[#051A24]">Önerilen medya (tüm büyük proje kartları)</div>
                  <div className="text-xs text-[#051A24]/70 mt-1">
                    Sayfada tam genişlik, yaklaşık{" "}
                    <span className="font-medium text-[#051A24]">300px (mobil) / 600px (masaüstü)</span> yükseklikte gösterilir;
                    medya alanı doldurulurken taşan kısımlar kırpılır — geniş yatay görseller en iyi sonucu verir.
                    <br />
                    Video: <span className="font-medium text-[#051A24]">MP4 (H.264)</span> veya{" "}
                    <span className="font-medium text-[#051A24]">WebM</span> · Çözünürlük:{" "}
                    <span className="font-medium text-[#051A24]">1920×1080</span> veya üzeri (16:9 veya daha geniş panorama) ·
                    Süre: <span className="font-medium text-[#051A24]">5–20 sn</span> döngü için uygun · Bitrate:{" "}
                    <span className="font-medium text-[#051A24]">~6–12 Mbps</span>
                    <br />
                    Görsel / animasyonlu gif: <span className="font-medium text-[#051A24]">WebP</span>,{" "}
                    <span className="font-medium text-[#051A24]">JPG</span> veya{" "}
                    <span className="font-medium text-[#051A24]">GIF</span> · Genişlik:{" "}
                    <span className="font-medium text-[#051A24]">2400px+</span> (retina için) · Oran: yaklaşık{" "}
                    <span className="font-medium text-[#051A24]">2:1</span> ile <span className="font-medium text-[#051A24]">21:9</span>{" "}
                    arası yatay; dikey veya kare kaynaklar üst/alt kırpılabilir.
                    <br />
                    Dosya boyutu: mümkünse video başına{" "}
                    <span className="font-medium text-[#051A24]">~5–15 MB</span> altı; çok büyük dosyalar ilk yüklemede geciktirir.
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-black/10 p-3 bg-black/[0.02]">
                    <div className="text-xs font-semibold text-[#051A24] mb-2">{projEvrTitleLive || PJ[0].title}</div>
                    <input
                      value={projEvrDraft}
                      onChange={(e) => setProjEvrDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 font-mono"
                      placeholder={PJ[0].defaultImage}
                    />
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {renderAssetTextField(`projects.${PJ[0].title}.title`, 'Baslik', PJ[0].title)}
                      {renderAssetTextField(`projects.${PJ[0].title}.description`, 'Aciklama', PJ[0].description, true)}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                        onClick={() => setProjEvrImg(projEvrDraft.trim())}
                      >
                        Kaydet
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                        onClick={() => {
                          resetProjEvrImg();
                          setProjEvrDraft(PJ[0].defaultImage);
                        }}
                      >
                        Reset
                      </button>
                      <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                        {projHomeUploadBusy ? 'Yükleniyor…' : 'Dosya yükle'}
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          disabled={projHomeUploadBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setProjHomeUploadBusy(true);
                            try {
                              const dataUrl = await fileToDataUrl(file);
                              setProjEvrImg(dataUrl);
                              setProjEvrDraft(dataUrl);
                            } finally {
                              setProjHomeUploadBusy(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-black/10 p-3 bg-black/[0.02]">
                    <div className="text-xs font-semibold text-[#051A24] mb-2">{projAutomationTitleLive || PJ[1].title}</div>
                    <input
                      value={projAutomationDraft}
                      onChange={(e) => setProjAutomationDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 font-mono"
                      placeholder={PJ[1].defaultImage}
                    />
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {renderAssetTextField(`projects.${PJ[1].title}.title`, 'Baslik', PJ[1].title)}
                      {renderAssetTextField(`projects.${PJ[1].title}.description`, 'Aciklama', PJ[1].description, true)}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                        onClick={() => setProjAutomationImg(projAutomationDraft.trim())}
                      >
                        Kaydet
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                        onClick={() => {
                          resetProjAutomationImg();
                          setProjAutomationDraft(PJ[1].defaultImage);
                        }}
                      >
                        Reset
                      </button>
                      <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                        {projHomeUploadBusy ? 'Yükleniyor…' : 'Dosya yükle'}
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          disabled={projHomeUploadBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setProjHomeUploadBusy(true);
                            try {
                              const dataUrl = await fileToDataUrl(file);
                              setProjAutomationImg(dataUrl);
                              setProjAutomationDraft(dataUrl);
                            } finally {
                              setProjHomeUploadBusy(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-black/10 p-3 bg-black/[0.02]">
                    <div className="text-xs font-semibold text-[#051A24] mb-2">{projXpTitleLive || PJ[2].title}</div>
                    <input
                      value={projXpDraft}
                      onChange={(e) => setProjXpDraft(e.target.value)}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 font-mono"
                      placeholder={PJ[2].defaultImage}
                    />
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {renderAssetTextField(`projects.${PJ[2].title}.title`, 'Baslik', PJ[2].title)}
                      {renderAssetTextField(`projects.${PJ[2].title}.description`, 'Aciklama', PJ[2].description, true)}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                        onClick={() => setProjXpImg(projXpDraft.trim())}
                      >
                        Kaydet
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                        onClick={() => {
                          resetProjXpImg();
                          setProjXpDraft(PJ[2].defaultImage);
                        }}
                      >
                        Reset
                      </button>
                      <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                        {projHomeUploadBusy ? 'Yükleniyor…' : 'Dosya yükle'}
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          disabled={projHomeUploadBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setProjHomeUploadBusy(true);
                            try {
                              const dataUrl = await fileToDataUrl(file);
                              setProjXpImg(dataUrl);
                              setProjXpDraft(dataUrl);
                            } finally {
                              setProjHomeUploadBusy(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${mediaHubSection === 'advanced' ? '' : 'hidden'} rounded-2xl border border-black/10 p-4`}>
                <div className="text-sm font-semibold text-[#051A24] mb-1">Partner with us — fare efekti</div>
                <div className="text-xs text-[#051A24]/70 mb-3">
                  Fareyi kutuda gezdirince “dökülen” küçük kart medyaları. Her satır bir URL.
                </div>
                {renderMediaRows(partnerParticlesDraft, setPartnerParticlesDraft, 'Partner efekti icin medya ekle.')}
                <details className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                  <summary className="cursor-pointer text-xs font-medium text-[#051A24]/75">Gelismis URL listesi</summary>
                  <textarea
                    value={partnerParticlesDraft}
                    onChange={(e) => setPartnerParticlesDraft(e.target.value)}
                    rows={5}
                    className="mt-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-y font-mono"
                    placeholder="https://...\nhttps://..."
                  />
                </details>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                    onClick={() => setPartnerParticleListRaw(partnerParticlesDraft.trim())}
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={() => {
                      resetPartnerParticleList();
                      const d = DEFAULT_LOOP_MEDIA_URLS.join('\n');
                      setPartnerParticlesDraft(d);
                    }}
                  >
                    Reset
                  </button>
                  <label className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition cursor-pointer">
                    {partnerParticlesBusy ? 'Yükleniyor…' : 'Dosya ekle'}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      disabled={partnerParticlesBusy}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setPartnerParticlesBusy(true);
                        try {
                          const urls: string[] = [];
                          for (const f of files) {
                            // eslint-disable-next-line no-await-in-loop
                            urls.push(await fileToDataUrl(f));
                          }
                          const next = [partnerParticlesDraft.trim(), ...urls].filter(Boolean).join('\n');
                          setPartnerParticlesDraft(next);
                          setPartnerParticleListRaw(next);
                        } finally {
                          setPartnerParticlesBusy(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {footerLinksOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFooterLinksOpen(false)} />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-black/10 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Footer linkleri</div>
                <div className="text-xs text-[#051A24]/70 mt-1">
                  Her link: <strong className="font-medium">Özel URL</strong> (Instagram vb.) veya{' '}
                  <strong className="font-medium">Sözleşme</strong>.
                </div>
              </div>
              <button
                type="button"
                className="text-[#051A24]/60 hover:text-[#051A24] px-2"
                onClick={() => setFooterLinksOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {footerLinks.columns.map((col, colIdx) => (
                  <div key={col.id} className="rounded-xl border border-black/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-[#051A24]">Kolon {colIdx + 1}</div>
                      <button
                        type="button"
                        className="rounded-full bg-white text-[#051A24] px-2.5 py-1 text-xs border border-black/10 hover:bg-black/[0.02] active:scale-95 transition inline-flex items-center gap-1.5"
                        onClick={() => {
                          const id = newId();
                          setFooterLinks((s) => {
                            const next = structuredClone(s) as FooterLinksConfig;
                            next.columns[colIdx].items.push({
                              id,
                              label: 'Yeni link',
                              href: 'https://',
                              enabled: true,
                              kind: 'url',
                            });
                            return next;
                          });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ekle
                      </button>
                    </div>

                    <div className="space-y-2">
                      {col.items.map((it, itemIdx) => (
                        <FooterLinkItemEditor
                          key={it.id}
                          item={it}
                          onPatch={(patch) => {
                            setFooterLinks((s) => {
                              const next = structuredClone(s) as FooterLinksConfig;
                              Object.assign(next.columns[colIdx].items[itemIdx], patch);
                              return next;
                            });
                          }}
                          onRemove={() => {
                            setFooterLinks((s) => {
                              const next = structuredClone(s) as FooterLinksConfig;
                              next.columns[colIdx].items.splice(itemIdx, 1);
                              return next;
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {footerLinksError ? <div className="text-xs text-red-600 mt-2">{footerLinksError}</div> : null}
            </div>

            <div className="p-5 border-t border-black/10 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => {
                  writeJsonAsset('footer.links', defaultFooterLinks);
                  bumpAssetsVersion();
                  setFooterLinks(defaultFooterLinks);
                  setFooterLinksError(null);
                  setFooterLinksOpen(false);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                onClick={() => {
                  try {
                    if (!footerLinks.columns?.length) throw new Error('Kolon bulunamadı.');
                    const toSave = { columns: footerLinks.columns };
                    writeJsonAsset('footer.links', toSave);
                    bumpAssetsVersion();
                    setFooterLinksOpen(false);
                  } catch (e: any) {
                    setFooterLinksError(e?.message || 'Kaydetme hatası.');
                  }
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mapOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMapOpen(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Harita ayarları</div>
                <div className="text-xs text-[#051A24]/70 mt-1">
                  Footer’daki haritanın lokasyonunu buradan değiştir.
                </div>
              </div>
              <button
                type="button"
                className="text-[#051A24]/60 hover:text-[#051A24] px-2"
                onClick={() => setMapOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Başlık</div>
                <input
                  value={mapTitleDraft}
                  onChange={(e) => setMapTitleDraft(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Örn: Location"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Adres</div>
                <div className="flex gap-2">
                  <input
                    value={mapAddressDraft}
                    onChange={(e) => setMapAddressDraft(e.target.value)}
                    className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    placeholder="Örn: İstiklal Cd. Beyoğlu İstanbul"
                  />
                  <button
                    type="button"
                    className={
                      'rounded-xl bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition'
                    }
                    onClick={() => {
                      const q = mapAddressDraft.trim();
                      if (!q) {
                        setMapError('Lütfen bir adres gir.');
                        return;
                      }
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
                        '_blank',
                        'noopener,noreferrer',
                      );
                    }}
                  >
                    Google’da ara
                  </button>
                </div>
                <div className="mt-3">
                  <div className="text-xs font-medium text-[#051A24]/80 mb-2">Google Maps linki</div>
                  <div className="flex gap-2">
                    <input
                      value={mapLinkDraft}
                      onChange={(e) => setMapLinkDraft(e.target.value)}
                      className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      placeholder="Google Maps paylaşım linkini yapıştır"
                    />
                    <button
                      type="button"
                      className="rounded-xl bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                      onClick={() => {
                        const parsed = tryParseGoogleMaps(mapLinkDraft);
                        if (!parsed) {
                          setMapError('Linkten konum okunamadı. Google Maps’ten “Paylaş” linkini yapıştırmayı dene.');
                          return;
                        }
                        setMapLatDraft(String(parsed.lat));
                        setMapLngDraft(String(parsed.lng));
                        if (typeof parsed.zoom === 'number' && Number.isFinite(parsed.zoom)) {
                          setMapZoomDraft(String(Math.round(parsed.zoom)));
                        }
                        setMapError(null);
                      }}
                    >
                      Linkten al
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[#051A24]/60">
                    Bu yöntem Google’dan veri çekmez; sadece yapıştırdığın linkin içindeki koordinatı okur. API key gerektirmez.
                  </div>
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Zoom (2–19)</div>
                <input
                  value={mapZoomDraft}
                  onChange={(e) => setMapZoomDraft(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="14"
                />
              </div>
            </div>

            {mapError ? <div className="text-xs text-red-600 mt-2">{mapError}</div> : null}

            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={() => setMapOpen(false)}
              >
                İptal
              </button>
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                onClick={() => {
                  const lat = Number(String(mapLatDraft).trim().replace(',', '.'));
                  const lng = Number(String(mapLngDraft).trim().replace(',', '.'));
                  const zoom = Number(String(mapZoomDraft).trim().replace(',', '.'));
                  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) {
                    setMapError('Önce bir adres seç (veya koordinatları doldurulmuş olmalı). Zoom sayısal olmalı.');
                    return;
                  }
                  if (zoom < 2 || zoom > 19) {
                    setMapError('Zoom 2 ile 19 arasında olmalı.');
                    return;
                  }
                  setMapTitle(mapTitleDraft.trim() || 'Location');
                  setMapLat(String(lat));
                  setMapLng(String(lng));
                  setMapZoom(String(Math.round(zoom)));
                  setMapAddress(mapAddressDraft.trim());
                  setMapOpen(false);
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/78 backdrop-blur-md" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-[8px] border border-white/12 bg-[#050505] text-white shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
            <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold tracking-[0.08em] uppercase text-white">Ezgi Halı Perde</div>
                <div className="text-xs text-white/58 mt-1">Premium koleksiyon giris sablonu.</div>
                <div className="text-xs text-[#051A24]/70 mt-1">Giriş yapınca rolüne göre üst menü aktif olur.</div>
              </div>
              <button
                type="button"
                className="text-white/55 hover:text-white px-2"
                onClick={() => setOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="inline-flex w-full rounded-full bg-white/[0.06] p-1 border border-white/10 mb-4">
                <button
                  type="button"
                  className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
                    authTab === 'login' || authTab === 'forgot'
                      ? 'bg-white text-black shadow'
                      : 'text-white/62 hover:text-white'
                  }`}
                  onClick={() => {
                    setAuthTab('login');
                    setError(null);
                  }}
                >
                  Giriş yap
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
                    authTab === 'signup' ? 'bg-white text-black shadow' : 'text-white/62 hover:text-white'
                  }`}
                  onClick={() => {
                    setAuthTab('signup');
                    setError(null);
                  }}
                >
                  Kayıt ol
                </button>
              </div>

              {authTab === 'login' ? (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs font-medium text-white/72 mb-2">E-posta</div>
                      <input
                        value={loginEmail}
                        onChange={(e) => {
                          setLoginEmail(e.target.value);
                          setError(null);
                        }}
                        type="email"
                        placeholder="yonetici@mail.com"
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                        autoFocus
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Şifre</div>
                      <input
                        value={loginPassword}
                        onChange={(e) => {
                          setLoginPassword(e.target.value);
                          setError(null);
                        }}
                        type="password"
                        placeholder="1234"
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                      />
                    </div>
                  </div>

                  {error ? <div className="text-xs text-red-600 mt-2">{error}</div> : null}

                  <div className="hidden">
                    <button
                      type="button"
                      className="text-[11px] text-[#051A24]/70 hover:text-[#051A24] underline underline-offset-4"
                      onClick={() => {
                        setAuthTab('forgot');
                        setError(null);
                      }}
                    >
                      Şifremi unuttum
                    </button>
                    <div className="flex-1" />
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await login(loginEmail, loginPassword);
                        if (!ok) {
                          setError('Giriş başarısız.');
                          return;
                        }
                        setOpen(false);
                      }}
                      className="flex-1 rounded-full bg-white px-4 py-2 text-sm text-black shadow hover:bg-white/90 active:scale-95 transition"
                    >
                      Devam et
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-full border border-white/14 bg-white/[0.06] px-4 py-2 text-sm text-white/72 hover:text-white active:scale-95 transition"
                    >
                      İptal
                    </button>
                  </div>
                </>
              ) : authTab === 'forgot' ? (
                <>
                  <div className="text-xs font-medium text-[#051A24]/80 mb-2">Şifre sıfırlama</div>
                  <div className="text-xs text-[#051A24]/70 mb-3">
                    E‑postanı gir. Eğer bu e‑posta kayıtlıysa, şifre sıfırlama linki gönderilir.
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs font-medium text-white/72 mb-2">E-posta</div>
                      <input
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        type="email"
                        placeholder="name@company.com"
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="flex-1 text-center rounded-full bg-white px-4 py-2 text-sm text-black shadow hover:bg-white/90 active:scale-95 transition"
                      onClick={async () => {
                        try {
                          setError(null);
                          await fetch('/api/auth/forgot', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: loginEmail }),
                          });
                          setError('Eğer e‑posta kayıtlıysa, şifre sıfırlama linki gönderildi.');
                        } catch {
                          setError('Bir hata oluştu. Tekrar deneyin.');
                        }
                      }}
                    >
                      Link gönder
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-white/14 bg-white/[0.06] px-4 py-2 text-sm text-white/72 hover:text-white active:scale-95 transition"
                      onClick={() => setAuthTab('login')}
                    >
                      Geri dön
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">İsim</div>
                      <input
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                        placeholder="Ad Soyad"
                        autoFocus
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-white/72 mb-2">E-posta</div>
                      <input
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                        placeholder="name@company.com"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Şifre</div>
                      <input
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="w-full rounded-[8px] border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/34 focus:border-white/34"
                        placeholder="En az 6 karakter"
                        type="password"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Şirket (opsiyonel)</div>
                      <input
                        value={signupCompany}
                        onChange={(e) => setSignupCompany(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="Company"
                      />
                    </div>
                  </div>

                  <div className="hidden">
                    Kayıt olunca hesabın veritabanına kaydedilir. Admin rolü “Kullanıcı yönetimi” ekranından görüntüleyebilir.
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      className="flex-1 text-center rounded-full bg-white px-4 py-2 text-sm text-black shadow hover:bg-white/90 active:scale-95 transition"
                      onClick={async () => {
                        setError(null);
                        const ok = await signupCustomer({
                          name: signupName,
                          email: signupEmail,
                          password: signupPassword,
                          company: signupCompany || undefined,
                        });
                        if (!ok) {
                          setError('Kayıt başarısız. E-posta kullanımda olabilir veya şifre zayıf.');
                          return;
                        }
                        setOpen(false);
                      }}
                    >
                      Kayıt ol
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-full border border-white/14 bg-white/[0.06] px-4 py-2 text-sm text-white/72 hover:text-white active:scale-95 transition"
                    >
                      Kapat
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {supportOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSupportOpen(false)} />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-black/10 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Yardım & Kontrol</div>
                <div className="text-xs text-[#051A24]/70 mt-1">
                  Şifre sıfırlama mail otomasyonunu buradan yönetebilirsin. Mail yoksa outbox modunda çalışır.
                </div>
              </div>
              <button
                type="button"
                className="text-[#051A24]/60 hover:text-[#051A24] px-2"
                onClick={() => setSupportOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-sm font-semibold text-[#051A24] mb-3">Mail ayarları</div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Mod</div>
                      <select
                        value={supportMode}
                        onChange={(e) => setSupportMode(e.target.value as any)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
                      >
                        <option value="outbox">Outbox (prototip)</option>
                        <option value="smtp">SMTP (otomatik)</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-[#051A24]/80 mb-2">Base URL</div>
                      <input
                        value={supportBaseUrl}
                        onChange={(e) => setSupportBaseUrl(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="https://site.com"
                      />
                      <div className="text-[11px] text-[#051A24]/60 mt-1">Reset linki bu URL ile oluşturulur.</div>
                    </div>

                    {supportMode === 'smtp' ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-medium text-[#051A24]/80 mb-2">Host</div>
                            <input
                              value={smtpHost}
                              onChange={(e) => setSmtpHost(e.target.value)}
                              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                              placeholder="smtp.gmail.com"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-[#051A24]/80 mb-2">Port</div>
                            <input
                              value={smtpPort}
                              onChange={(e) => setSmtpPort(e.target.value)}
                              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                              placeholder="587"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[#051A24]/80 mb-2">User</div>
                          <input
                            value={smtpUser}
                            onChange={(e) => setSmtpUser(e.target.value)}
                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="user@example.com"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[#051A24]/80 mb-2">Pass</div>
                          <input
                            value={smtpPass}
                            onChange={(e) => setSmtpPass(e.target.value)}
                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="********"
                            type="password"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[#051A24]/80 mb-2">From</div>
                          <input
                            value={smtpFrom}
                            onChange={(e) => setSmtpFrom(e.target.value)}
                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="no-reply@domain.com"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>

              <div className="rounded-2xl border border-black/10 p-4">
                  <div className="text-sm font-semibold text-[#051A24] mb-3">Outbox (son 50)</div>
                  <button
                    type="button"
                    className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                    onClick={async () => {
                      setSupportLoading(true);
                      setSupportError(null);
                      try {
                        const res = await fetch('/api/admin/outbox');
                        const data = (await res.json().catch(() => null)) as any;
                        if (!res.ok || !data?.ok) throw new Error('Outbox alınamadı.');
                        setOutboxRows(data.rows || []);
                      } catch (e: any) {
                        setSupportError(e?.message || 'Hata');
                      } finally {
                        setSupportLoading(false);
                      }
                    }}
                  >
                    {supportLoading ? 'Yükleniyor…' : 'Yenile'}
                  </button>

                  {supportError ? <div className="text-xs text-red-600 mt-3">{supportError}</div> : null}

                  <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl border border-black/10">
                    {outboxRows.length ? (
                      <div className="divide-y divide-black/10">
                        {outboxRows.map((r) => (
                          <div key={r.id} className="p-3 text-xs">
                            <div className="text-[#051A24] font-medium">{r.subject}</div>
                            <div className="text-[#051A24]/70 mt-1">{r.to_email}</div>
                            <div className="text-[#051A24]/60 mt-1">{r.status}{r.error ? ` • ${r.error}` : ''}</div>
                            <button
                              type="button"
                              className="mt-2 text-[#051A24]/70 hover:text-[#051A24] underline underline-offset-4"
                              onClick={() => navigator.clipboard?.writeText(r.body)}
                            >
                              Body kopyala
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-sm text-[#051A24]/60">Henüz mail yok.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-black/10 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={async () => {
                  setSupportLoading(true);
                  setSupportError(null);
                  try {
                    const res = await fetch('/api/admin/support');
                    const data = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !data?.ok) throw new Error('Ayarlar alınamadı.');
                    const s = data.settings || {};
                    setSupportMode(s.mode || 'outbox');
                    setSupportBaseUrl(s.baseUrl || '');
                    setSmtpHost(s.smtp?.host || '');
                    setSmtpPort(String(s.smtp?.port || '587'));
                    setSmtpUser(s.smtp?.user || '');
                    setSmtpPass(s.smtp?.pass || '');
                    setSmtpFrom(s.smtp?.from || '');
                  } catch (e: any) {
                    setSupportError(e?.message || 'Hata');
                  } finally {
                    setSupportLoading(false);
                  }
                }}
              >
                Ayarları yükle
              </button>
              <button
                type="button"
                className="rounded-full bg-[#051A24] text-white px-4 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
                onClick={async () => {
                  setSupportLoading(true);
                  setSupportError(null);
                  try {
                    const payload = {
                      mode: supportMode,
                      baseUrl: supportBaseUrl,
                      smtp: { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: smtpFrom },
                    };
                    const res = await fetch('/api/admin/support', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !data?.ok) throw new Error('Kaydedilemedi.');
                  } catch (e: any) {
                    setSupportError(e?.message || 'Hata');
                  } finally {
                    setSupportLoading(false);
                  }
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {usersOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUsersOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-black/10 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[#051A24]">Kullanıcı yönetimi</div>
                <div className="text-xs text-[#051A24]/70 mt-1">Kayıtlı kullanıcılar (son 200).</div>
              </div>
              <button
                type="button"
                className="text-[#051A24]/60 hover:text-[#051A24] px-2"
                onClick={() => setUsersOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              <button
                type="button"
                className="rounded-full bg-white text-[#051A24] px-4 py-2 text-sm border border-black/10 hover:bg-black/[0.02] active:scale-95 transition"
                onClick={async () => {
                  setUsersLoading(true);
                  setUsersError(null);
                  try {
                    const res = await fetch('/api/admin/users');
                    const data = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !data?.ok) throw new Error('Liste alınamadı (admin giriş gerekli).');
                    setUsers(data.users || []);
                  } catch (e: any) {
                    setUsersError(e?.message || 'Hata');
                  } finally {
                    setUsersLoading(false);
                  }
                }}
              >
                {usersLoading ? 'Yükleniyor…' : 'Yenile'}
              </button>

              {usersError ? <div className="text-xs text-red-600 mt-3">{usersError}</div> : null}

              <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-2xl border border-black/10">
                {users.length ? (
                  <div className="divide-y divide-black/10">
                    {users.map((u) => (
                      <div key={u.id} className="p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-[#051A24]">{u.name}</div>
                            <div className="text-[#051A24]/70 text-xs mt-0.5">
                              {u.email}
                              {u.company ? <span className="ml-2">• {u.company}</span> : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={u.role || 'customer'}
                              onChange={async (e) => {
                                const nextRole = e.target.value;
                                try {
                                  const res = await fetch(`/api/admin/users/${u.id}/role`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ role: nextRole }),
                                  });
                                  const data = (await res.json().catch(() => null)) as any;
                                  if (!res.ok || !data?.ok) throw new Error('Kaydedilemedi.');
                                  setUsers((s) => s.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
                                } catch (err: any) {
                                  setUsersError(err?.message || 'Rol güncelleme hatası');
                                }
                              }}
                              className="rounded-xl border border-black/10 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10 bg-white"
                              title="Rol"
                            >
                              <option value="admin">Yönetici</option>
                              <option value="customer">Müşteri</option>
                            </select>

                            <button
                              type="button"
                              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/[0.02] active:scale-95 transition"
                              onClick={async () => {
                                const pw = window.prompt('Yeni şifre (en az 6 karakter):');
                                if (!pw) return;
                                try {
                                  const res = await fetch(`/api/admin/users/${u.id}/password`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ password: pw }),
                                  });
                                  const data = (await res.json().catch(() => null)) as any;
                                  if (!res.ok || !data?.ok) throw new Error('Şifre güncellenemedi.');
                                } catch (err: any) {
                                  setUsersError(err?.message || 'Şifre güncelleme hatası');
                                }
                              }}
                              title="Kullanıcıya yeni şifre ata"
                            >
                              Yeni şifre
                            </button>

                            <button
                              type="button"
                              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50 active:scale-95 transition"
                              onClick={async () => {
                                const ok = window.confirm(`${u.name} (${u.email}) silinsin mi? Bu işlem geri alınamaz.`);
                                if (!ok) return;
                                try {
                                  const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                  const data = (await res.json().catch(() => null)) as any;
                                  if (!res.ok || !data?.ok) throw new Error('Silinemedi.');
                                  setUsers((s) => s.filter((x) => x.id !== u.id));
                                } catch (err: any) {
                                  setUsersError(err?.message || 'Silme hatası');
                                }
                              }}
                              title="Kullanıcıyı sil"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-[#051A24]/60">Henüz kullanıcı yok veya “Yenile”ye bas.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
