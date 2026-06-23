import { useMemo, useState } from 'react';
import { useInViewAnimation } from '../hooks/useInViewAnimation';
import { Button } from './Button';
import { cn } from '../lib/utils';
import { EditableText } from '../admin/EditableText';
import { fileToDataUrl, readAsset, readJsonAsset, useEditableAsset, writeAsset, writeJsonAsset } from '../admin/assets';
import { useAdmin } from '../admin/AdminContext';
import { SAFE_SITE_LINK_TARGETS, collectNavigableSiteTargets, normalizeSiteHref } from '../lib/siteLinks';
import { waMeDigits, waMeUrl } from '../lib/whatsapp';
import {
  Aperture,
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  Clapperboard,
  Clock,
  Compass,
  Crown,
  Gem,
  Gift,
  Image,
  Instagram,
  Landmark,
  Layers,
  Leaf,
  MessageCircle,
  Mic,
  PartyPopper,
  PenTool,
  Phone,
  Printer,
  ShieldCheck,
  Star,
  Heart,
  Home,
  MapPin,
  ScanFace,
  Sparkles,
  Video,
  Users,
  Baby,
  GraduationCap,
  Plane,
  Pencil,
  X,
} from 'lucide-react';

type ServiceItem = {
  id: string;
  iconId: string;
  customIconKey?: string;
  titleKey: string;
  descKey: string;
  hrefKey: string;
};

const SERVICES_KEY = 'services.items.v1';

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

const ICONS = [
  { id: 'camera', label: 'Kamera', Icon: Camera },
  { id: 'aperture', label: 'Aperture', Icon: Aperture },
  { id: 'image', label: 'Görsel', Icon: Image },
  { id: 'scanFace', label: 'Biyometrik', Icon: ScanFace },
  { id: 'mapPin', label: 'Dış Mekan', Icon: MapPin },
  { id: 'compass', label: 'Lokasyon', Icon: Compass },
  { id: 'leaf', label: 'Doğa', Icon: Leaf },
  { id: 'heart', label: 'Düğün', Icon: Heart },
  { id: 'gift', label: 'Özel gün', Icon: Gift },
  { id: 'party', label: 'Kına/Nişan', Icon: PartyPopper },
  { id: 'home', label: 'Plato', Icon: Home },
  { id: 'layers', label: 'Konsept', Icon: Layers },
  { id: 'users', label: 'Aile/Çift', Icon: Users },
  { id: 'messageCircle', label: 'İletişim', Icon: MessageCircle },
  { id: 'phone', label: 'Telefon', Icon: Phone },
  { id: 'baby', label: 'Yeni Doğan', Icon: Baby },
  { id: 'graduation', label: 'Mezuniyet', Icon: GraduationCap },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'clapperboard', label: 'Klip / Kurgu', Icon: Clapperboard },
  { id: 'mic', label: 'Ses', Icon: Mic },
  { id: 'plane', label: 'Drone', Icon: Plane },
  { id: 'landmark', label: 'Mekan', Icon: Landmark },
  { id: 'sparkles', label: 'Sosyal Medya', Icon: Sparkles },
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'briefcaseBusiness', label: 'Kurumsal', Icon: BriefcaseBusiness },
  { id: 'penTool', label: 'Tasarım', Icon: PenTool },
  { id: 'printer', label: 'Baskı', Icon: Printer },
  { id: 'circleDollarSign', label: 'Fiyat', Icon: CircleDollarSign },
  { id: 'clock', label: 'Hızlı teslim', Icon: Clock },
  { id: 'badgeCheck', label: 'Onaylı', Icon: BadgeCheck },
  { id: 'shieldCheck', label: 'Güven', Icon: ShieldCheck },
  { id: 'star', label: 'Premium', Icon: Star },
  { id: 'crown', label: 'VIP', Icon: Crown },
  { id: 'gem', label: 'Lüks', Icon: Gem },
] as const;

function iconById(id: string) {
  return ICONS.find((x) => x.id === id) || ICONS[0];
}

function customIconAssetKey(serviceId: string) {
  return `services.${serviceId}.icon.custom.v1`;
}

function serviceHrefAssetKey(serviceId: string) {
  return `services.${serviceId}.href`;
}

function slugifyTr(raw: string) {
  return String(raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normalizeServiceHref(raw: string) {
  const t = String(raw || '').trim();
  if (!t) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith('#')) return `/${t.replace(/^#+/, '').replace(/^\/+/, '')}`;
  if (t.startsWith('/') || t.startsWith('?')) return t;
  return `/${t.replace(/^\/+/, '')}`;
}

function defaultServiceHref(service: ServiceItem) {
  const title = readAsset(service.titleKey) || service.id;
  const scope = slugifyTr(title) || service.id;
  return `/packages?scope=${scope}`;
}

function normalizeServices(raw: unknown): ServiceItem[] {
  const fallback: ServiceItem[] = [
    { id: 's1', iconId: 'camera', titleKey: 'services.s1.title', descKey: 'services.s1.desc', hrefKey: 'services.s1.href' },
    { id: 's2', iconId: 'scanFace', titleKey: 'services.s2.title', descKey: 'services.s2.desc', hrefKey: 'services.s2.href' },
    { id: 's3', iconId: 'mapPin', titleKey: 'services.s3.title', descKey: 'services.s3.desc', hrefKey: 'services.s3.href' },
    { id: 's4', iconId: 'heart', titleKey: 'services.s4.title', descKey: 'services.s4.desc', hrefKey: 'services.s4.href' },
    { id: 's5', iconId: 'party', titleKey: 'services.s5.title', descKey: 'services.s5.desc', hrefKey: 'services.s5.href' },
    { id: 's6', iconId: 'home', titleKey: 'services.s6.title', descKey: 'services.s6.desc', hrefKey: 'services.s6.href' },
    { id: 's7', iconId: 'users', titleKey: 'services.s7.title', descKey: 'services.s7.desc', hrefKey: 'services.s7.href' },
    { id: 's8', iconId: 'baby', titleKey: 'services.s8.title', descKey: 'services.s8.desc', hrefKey: 'services.s8.href' },
    { id: 's9', iconId: 'graduation', titleKey: 'services.s9.title', descKey: 'services.s9.desc', hrefKey: 'services.s9.href' },
    { id: 's10', iconId: 'video', titleKey: 'services.s10.title', descKey: 'services.s10.desc', hrefKey: 'services.s10.href' },
    { id: 's11', iconId: 'plane', titleKey: 'services.s11.title', descKey: 'services.s11.desc', hrefKey: 'services.s11.href' },
    { id: 's12', iconId: 'sparkles', titleKey: 'services.s12.title', descKey: 'services.s12.desc', hrefKey: 'services.s12.href' },
  ];

  if (!Array.isArray(raw)) return fallback;
  const out: ServiceItem[] = [];
  const seen = new Set<string>();
  for (const row of raw as any[]) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as any).id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const iconId = String((row as any).iconId || 'camera').trim();
    const customIconKey = String((row as any).customIconKey || '').trim() || undefined;
    const titleKey = String((row as any).titleKey || '').trim() || `services.${id}.title`;
    const descKey = String((row as any).descKey || '').trim() || `services.${id}.desc`;
    const hrefKey = String((row as any).hrefKey || '').trim() || serviceHrefAssetKey(id);
    out.push({ id, iconId, customIconKey, titleKey, descKey, hrefKey });
  }
  return out.length ? out : fallback;
}

export function PricingSection() {
  const { ref, isInView } = useInViewAnimation();
  const { isAdmin, assetsVersion, bumpAssetsVersion } = useAdmin();
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceTitleDraft, setServiceTitleDraft] = useState('');
  const [serviceDescDraft, setServiceDescDraft] = useState('');
  const [serviceIconDraft, setServiceIconDraft] = useState('camera');
  const [serviceCustomIconDraft, setServiceCustomIconDraft] = useState('');
  const [serviceHrefDraft, setServiceHrefDraft] = useState('');

  const { value: primaryHref, setValue: setPrimaryHref } = useEditableAsset('services.cta.primary.href', '/calendar');
  const { value: secondaryHref, setValue: setSecondaryHref } = useEditableAsset('services.cta.secondary.href', '/packages');
  const safeLinkTargets = useMemo(() => {
    void assetsVersion;
    return collectNavigableSiteTargets(readJsonAsset<unknown>('admin.toolbar.buttons'), SAFE_SITE_LINK_TARGETS);
  }, [assetsVersion]);
  const resolveSafeHref = (raw: string, fallback = '/calendar') => {
    const normalized = normalizeSiteHref(raw);
    if (safeLinkTargets.some((x) => x.value === normalized)) return normalized;
    const preferredFallback = normalizeSiteHref(fallback);
    if (safeLinkTargets.some((x) => x.value === preferredFallback)) return preferredFallback;
    const packageChild = safeLinkTargets.find((x) => x.value.startsWith('/packages?'))?.value;
    return packageChild || safeLinkTargets[0]?.value || '/calendar';
  };
  const toNavigationHref = (raw: string, fallback = '/calendar') => {
    const href = resolveSafeHref(raw, fallback);
    if (href !== 'whatsapp') return href;
    const digits = waMeDigits(readAsset('whatsapp.phone') || '905XXXXXXXXX');
    return digits.length >= 8 ? waMeUrl(digits, readAsset('whatsapp.defaultMessage') || 'Merhaba, bilgi almak istiyorum.') : '/';
  };

  const services = useMemo(() => {
    void assetsVersion;
    const raw = readJsonAsset<unknown>(SERVICES_KEY);
    return normalizeServices(raw);
  }, [assetsVersion]);

  const setServices = (fn: (prev: ServiceItem[]) => ServiceItem[]) => {
    const next = fn(services);
    writeJsonAsset(SERVICES_KEY, next);
    bumpAssetsVersion();
  };

  const openServiceEditor = (service: ServiceItem) => {
    const customKey = service.customIconKey || customIconAssetKey(service.id);
    setEditingServiceId(service.id);
    setServiceTitleDraft(readAsset(service.titleKey) || 'Hizmet başlığı');
    setServiceDescDraft(readAsset(service.descKey) || 'Kısa açıklama (1 satır iyi duruyor).');
    setServiceIconDraft(service.iconId || 'camera');
    setServiceCustomIconDraft(readAsset(customKey) || '');
    setServiceHrefDraft(resolveSafeHref(readAsset(service.hrefKey) || defaultServiceHref(service), '/packages'));
  };

  const closeServiceEditor = () => {
    setEditingServiceId(null);
    setServiceTitleDraft('');
    setServiceDescDraft('');
    setServiceIconDraft('camera');
    setServiceCustomIconDraft('');
    setServiceHrefDraft('');
  };

  const saveServiceEditor = () => {
    const service = services.find((x) => x.id === editingServiceId);
    if (!service) return;
    const customKey = service.customIconKey || customIconAssetKey(service.id);
    writeAsset(service.titleKey, serviceTitleDraft.trim() || 'Hizmet başlığı');
    writeAsset(service.descKey, serviceDescDraft.trim() || 'Kısa açıklama (1 satır iyi duruyor).');
    writeAsset(service.hrefKey, resolveSafeHref(serviceHrefDraft || defaultServiceHref(service), '/packages'));
    if (serviceIconDraft === 'custom' && serviceCustomIconDraft) {
      writeAsset(customKey, serviceCustomIconDraft);
    }
    const nextIconId = serviceIconDraft === 'custom' ? 'custom' : serviceIconDraft;
    setServices((prev) =>
      prev.map((x) =>
        x.id === service.id
          ? {
              ...x,
              iconId: nextIconId,
              customIconKey: nextIconId === 'custom' ? customKey : x.customIconKey,
            }
          : x,
      ),
    );
    closeServiceEditor();
  };

  const commonLinks = [
    { id: '/calendar', label: 'Mağaza (#hali)' },
    { id: '/packages', label: 'Paketler (/packages)' },
    { id: '/paketler', label: 'Paketler (/paketler)' },
    { id: '/inbox', label: 'Gelen Kutusu (/inbox)' },
    { id: '/', label: 'Anasayfa (/)' },
    { id: '#', label: 'Kapalı (#)' },
  ];

  return (
    <section className="w-full py-12 px-6" ref={ref}>
      <div className="max-w-6xl mx-auto">
        <div
          className={cn(
            'flex flex-col items-center text-center',
            'transition-all duration-700',
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5',
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs tracking-[0.18em] uppercase text-[#051A24]/70 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#051A24] text-white">
              <Camera className="h-3.5 w-3.5" />
            </span>
            <EditableText assetKey="services.kicker" defaultValue="Hizmetlerimiz" as="span" />
          </div>
          <h2 className="mt-5 text-[34px] sm:text-[44px] leading-[1.06] font-serif font-semibold tracking-tight text-[#051A24]">
            <EditableText assetKey="services.title" defaultValue="Her mekan için ayrı bir dokuma standardı." as="span" />
          </h2>
          <p className="mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-[#051A24]/70">
            <EditableText
              assetKey="services.subtitle"
              defaultValue={'Konseptten teslimata kadar süreç net, görsel dil temiz.\nKısa sürede premium sonuç.'}
              as="span"
              multiline
            />
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Button
              variant="primary"
              className="bg-[#051A24] text-white"
              onClick={() => {
                if (typeof window === 'undefined') return;
                window.location.href = toNavigationHref(primaryHref, '/calendar');
              }}
            >
              <EditableText assetKey="services.cta.primary" defaultValue="Ürünlere Git" as="span" />
            </Button>
            <Button
              variant="secondary"
              className="bg-transparent border border-black/10 text-[#051A24] shadow-none"
              onClick={() => {
                if (typeof window === 'undefined') return;
                window.location.href = toNavigationHref(secondaryHref, '/packages');
              }}
            >
              <EditableText assetKey="services.cta.secondary" defaultValue="Paketler" as="span" />
            </Button>
          </div>

          {isAdmin ? (
            <div className="mt-4 w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(5,26,36,0.06)]">
                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Buton 1 link</div>
                <div className="flex gap-2">
                  <select
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    value={resolveSafeHref(primaryHref, '/calendar')}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') return;
                      setPrimaryHref(v);
                    }}
                  >
                    {safeLinkTargets.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(5,26,36,0.06)]">
                <div className="text-xs font-medium text-[#051A24]/80 mb-2">Buton 2 link</div>
                <div className="flex gap-2">
                  <select
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                    value={resolveSafeHref(secondaryHref, '/packages')}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') return;
                      setSecondaryHref(v);
                    }}
                  >
                    {safeLinkTargets.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="mt-8 flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-[#051A24]">Hizmet kartları</div>
            <button
              type="button"
              className="rounded-full bg-[#051A24] text-white px-5 py-2 text-sm shadow hover:opacity-90 active:scale-95 transition"
              onClick={() => {
                const id = `svc-${newId().slice(0, 8)}`;
                setServices((prev) => [
                  {
                    id,
                    iconId: 'camera',
                    titleKey: `services.${id}.title`,
                    descKey: `services.${id}.desc`,
                    hrefKey: `services.${id}.href`,
                  },
                  ...prev,
                ]);
              }}
            >
              Hizmet ekle
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            'mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4',
            'transition-all duration-700 delay-150',
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5',
          )}
        >
          {services.map((s, idx) => {
            const isCustom = s.iconId === 'custom';
            const cKey = s.customIconKey || customIconAssetKey(s.id);
            const customUrl = isCustom ? readAsset(cKey) : null;
            const serviceHref = toNavigationHref(readAsset(s.hrefKey) || defaultServiceHref(s), '/packages');
            const { Icon } = iconById(s.iconId);
            const accent =
              idx % 4 === 0
                ? 'from-[#051A24] to-[#0b3a4f]'
                : idx % 4 === 1
                  ? 'from-[#7A5C2E] to-[#C78B2C]'
                  : idx % 4 === 2
                    ? 'from-[#0b3a4f] to-[#2a7ca3]'
                    : 'from-[#1a1a1a] to-[#4a4a4a]';
            return (
              <div
                key={s.id}
                role={isAdmin ? undefined : 'link'}
                tabIndex={isAdmin ? undefined : 0}
                onClick={() => {
                  if (isAdmin || typeof window === 'undefined') return;
                  window.location.href = serviceHref;
                }}
                onKeyDown={(e) => {
                  if (isAdmin || typeof window === 'undefined') return;
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  window.location.href = serviceHref;
                }}
                className={cn(
                  'group relative overflow-hidden rounded-3xl bg-white',
                  'border border-black/10',
                  'shadow-[0_10px_30px_rgba(5,26,36,0.06)]',
                  'hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(5,26,36,0.10)] transition',
                  !isAdmin && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#051A24]/20',
                )}
              >
                {isAdmin ? (
                  <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#051A24] shadow hover:bg-black/[0.02] active:scale-95 transition"
                      onClick={() => openServiceEditor(s)}
                      title="Düzenle"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-black/10 bg-white/95 px-2.5 py-1.5 text-[11px] shadow hover:bg-black/[0.02] active:scale-95 transition"
                      onClick={() =>
                        setServices((prev) => {
                          const i = prev.findIndex((x) => x.id === s.id);
                          if (i <= 0) return prev;
                          const next = [...prev];
                          const t = next[i - 1];
                          next[i - 1] = next[i];
                          next[i] = t;
                          return next;
                        })
                      }
                      title="Yukarı"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-black/10 bg-white/95 px-2.5 py-1.5 text-[11px] shadow hover:bg-black/[0.02] active:scale-95 transition"
                      onClick={() =>
                        setServices((prev) => {
                          const i = prev.findIndex((x) => x.id === s.id);
                          if (i < 0 || i >= prev.length - 1) return prev;
                          const next = [...prev];
                          const t = next[i + 1];
                          next[i + 1] = next[i];
                          next[i] = t;
                          return next;
                        })
                      }
                      title="Aşağı"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-900 shadow hover:bg-red-100 active:scale-95 transition"
                      onClick={() => {
                        if (!confirm('Bu hizmet silinsin mi?')) return;
                        setServices((prev) => prev.filter((x) => x.id !== s.id));
                      }}
                      title="Sil"
                    >
                      Sil
                    </button>
                  </div>
                ) : null}

                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition">
                  <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-b from-black/[0.06] to-transparent blur-2xl" />
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'shrink-0 h-11 w-11 rounded-2xl',
                        'bg-gradient-to-b',
                        accent,
                        'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
                        'flex items-center justify-center',
                      )}
                    >
                      {isCustom && customUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={customUrl} alt="" className="h-5 w-5 object-contain" />
                      ) : (
                        <Icon className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm sm:text-[15px] font-semibold tracking-tight text-[#051A24]">
                        {readAsset(s.titleKey) || 'Hizmet başlığı'}
                      </div>
                      <div className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[#051A24]/65">
                        {readAsset(s.descKey) || 'Kısa açıklama (1 satır iyi duruyor).'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={cn(
            'mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#051A24]/60',
            'transition-all duration-700 delay-200',
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5',
          )}
        >
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#051A24]/40" />
            <EditableText assetKey="services.footer.p1" defaultValue="Teslimler net: seçki + retouch." as="span" />
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#051A24]/40" />
            <EditableText assetKey="services.footer.p2" defaultValue="Planlı seçim: net fiyat, net teslimat." as="span" />
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#051A24]/40" />
            <EditableText assetKey="services.footer.p3" defaultValue="Premium ışık + renk standardı." as="span" />
          </span>
        </div>
      </div>

      {isAdmin && editingServiceId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-black/10 overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
              <div>
                <div className="text-base font-semibold text-[#051A24]">Hizmeti düzenle</div>
                <div className="mt-1 text-xs text-[#051A24]/65">Başlık, açıklama ve logo/ikonu buradan yönet.</div>
              </div>
              <button
                type="button"
                className="rounded-full border border-black/10 bg-white p-2 text-[#051A24] hover:bg-black/[0.03] active:scale-95 transition"
                onClick={closeServiceEditor}
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-2 block text-xs font-medium text-[#051A24]/80">Başlık</label>
                <input
                  value={serviceTitleDraft}
                  onChange={(e) => setServiceTitleDraft(e.target.value)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Hizmet başlığı"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-[#051A24]/80">Açıklama</label>
                <textarea
                  value={serviceDescDraft}
                  onChange={(e) => setServiceDescDraft(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Kısa açıklama"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-[#051A24]/80">Kart linki</label>
                <select
                  value={resolveSafeHref(serviceHrefDraft, '/packages')}
                  onChange={(e) => setServiceHrefDraft(e.target.value)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                >
                  {safeLinkTargets.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-[#051A24]/55">
                  Sadece aktif butonlar, açılır menü alt öğeleri, mağaza ve WhatsApp seçilebilir.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-[#051A24]/80">Logo / ikon</label>
                  <select
                    value={serviceIconDraft}
                    onChange={(e) => setServiceIconDraft(e.target.value)}
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#051A24] outline-none focus:ring-2 focus:ring-black/10"
                  >
                    {ICONS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                    <option value="custom">Özel logo yükle</option>
                  </select>

                  {serviceIconDraft === 'custom' ? (
                    <label className="mt-3 block rounded-2xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-3 text-sm cursor-pointer hover:bg-black/[0.03] transition">
                      <div className="font-medium text-[#051A24]">Dosya seç</div>
                      <div className="mt-0.5 text-xs text-[#051A24]/60">
                        SVG / PNG / JPG / WebP. Onerilen ikon/logo: 256x256 px, seffaf PNG veya SVG.
                      </div>
                      <input
                        type="file"
                        accept="image/svg+xml,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setServiceCustomIconDraft(await fileToDataUrl(file));
                          setServiceIconDraft('custom');
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-black/10 bg-[#051A24]/[0.03] p-4 flex items-center justify-center">
                  <div className="h-16 w-16 rounded-3xl bg-[#051A24] text-white flex items-center justify-center">
                    {serviceIconDraft === 'custom' && serviceCustomIconDraft ? (
                      <img src={serviceCustomIconDraft} alt="" className="h-9 w-9 object-contain" />
                    ) : (
                      (() => {
                        const { Icon } = iconById(serviceIconDraft);
                        return <Icon className="h-8 w-8" />;
                      })()
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-4">
              <button
                type="button"
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[#051A24] hover:bg-black/[0.03] active:scale-95 transition"
                onClick={closeServiceEditor}
              >
                İptal
              </button>
              <button
                type="button"
                className="rounded-full bg-[#051A24] px-5 py-2 text-sm text-white shadow hover:opacity-90 active:scale-95 transition"
                onClick={saveServiceEditor}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
