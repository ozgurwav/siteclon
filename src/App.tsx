import { useEffect, useMemo, useState } from 'react';
import { HomeMediaSections } from './components/HomeMediaSections.tsx';
import { Footer } from './components/Footer.tsx';
import { CopyrightBar } from './components/CopyrightBar.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { useInViewAnimation } from './hooks/useInViewAnimation.ts';
import { cn } from './lib/utils.ts';
import { AdminWidget } from './admin/AdminWidget.tsx';
import { EditableAsset } from './admin/EditableAsset.tsx';
import { EditableText } from './admin/EditableText.tsx';
import { ResetPasswordPage } from './auth/ResetPasswordPage.tsx';
import { PortfolioGalleryPage } from './portfolio/PortfolioGalleryPage.tsx';
import { InboxPage } from './inbox/InboxPage.tsx';
import { AccountPage } from './account/AccountPage.tsx';
import { PersonProfilePage } from './people/PersonProfilePage.tsx';
import { BookingCalendarPage } from './booking/BookingCalendarPage.tsx';
import { useEditableAsset } from './admin/assets.ts';
import { useAdmin } from './admin/AdminContext.tsx';
import { PaymentSuccessPage } from './payments/PaymentSuccessPage.tsx';
import { PaymentCancelPage } from './payments/PaymentCancelPage.tsx';
import { WEDDING_PHOTO_URLS } from './lib/defaultSiteMedia.ts';
import { PackagesPage } from './packages/PackagesPage.tsx';
import { LegalDocumentPage } from './legal/LegalDocumentPage.tsx';
import { normalizePathname, resolveLegacyRedirect, resolveSiteRoute } from './lib/siteRoutes.ts';

export default function App() {
  const { assetsVersion } = useAdmin();
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? normalizePathname(window.location.pathname) : '/',
  );
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? window.location.search || '' : '',
  );

  useEffect(() => {
    function syncPath() {
      setPathname(normalizePathname(window.location.pathname));
      setSearch(window.location.search || '');
    }
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const redirect = resolveLegacyRedirect(pathname);
    if (!redirect) return;
    const target = redirect.startsWith('/') ? redirect : `/${redirect}`;
    if (`${pathname}${search}` === target) return;
    window.history.replaceState({}, '', target);
    const u = new URL(target, window.location.origin);
    setPathname(normalizePathname(u.pathname));
    setSearch(u.search || '');
  }, [pathname, search]);

  useEffect(() => {
    const follower = document.getElementById('cursor-follower');
    if (!follower) return;

    const moveCursor = (e: MouseEvent) => {
      follower.style.left = `${e.clientX}px`;
      follower.style.top = `${e.clientY}px`;
    };

    window.addEventListener('mousemove', moveCursor);
    return () => window.removeEventListener('mousemove', moveCursor);
  }, []);

  useEffect(() => {
    if (pathname !== '/') return;
    try {
      const raw = window.sessionStorage.getItem('aiag.homeScrollY');
      if (!raw) return;
      window.sessionStorage.removeItem('aiag.homeScrollY');
      const y = Math.max(0, Math.floor(Number(raw) || 0));
      window.setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'instant' as any }), 0);
    } catch {}
  }, [pathname]);

  if (typeof window !== 'undefined' && pathname === '/reset-password') return <ResetPasswordPage />;
  if (typeof window !== 'undefined' && pathname === '/payment/success') return <PaymentSuccessPage />;
  if (typeof window !== 'undefined' && pathname === '/payment/cancel') return <PaymentCancelPage />;

  const route = useMemo(() => {
    if (typeof window === 'undefined') return null;
    void assetsVersion;
    return resolveSiteRoute(pathname, search);
  }, [assetsVersion, pathname, search]);

  if (typeof window !== 'undefined') {
    if (route?.type === 'gallery') {
      return <PortfolioGalleryPage galleryIdOverride={route.galleryId} titleOverride={route.title} />;
    }
    if (route?.type === 'packages') {
      return (
        <PackagesPage
          defaultKind={route.defaultKind}
          title={route.title}
          subtitle={route.subtitle}
          listKey={route.listKey}
          assetPrefix={route.assetPrefix}
        />
      );
    }
    if (route?.type === 'static') {
      switch (route.page) {
        case 'portfolio':
          return <PortfolioGalleryPage />;
        case 'inbox':
          return <InboxPage />;
        case 'account':
          return <AccountPage />;
        case 'person':
          return <PersonProfilePage />;
        case 'calendar':
          return <BookingCalendarPage />;
        case 'packages':
          return <PackagesPage />;
        case 'legal':
          return <LegalDocumentPage slug={route.legalSlug || ''} />;
        default:
          break;
      }
    }
  }

  return (
    <main className="relative min-h-[100dvh] pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
      <AdminWidget />
      {/* 1. HERO SECTION */}
      <section className="relative min-h-[100dvh] flex flex-col items-center justify-center pt-12 md:pt-16 px-6 overflow-hidden">
        {/* Full-screen background media (editable from Admin menu). */}
        <div className="absolute inset-0 z-0">
          <HeroBackgroundMedia />
          <div className="absolute inset-0 bg-black/45 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-white/0 pointer-events-none" />
        </div>

        <div className="relative z-10 w-full flex justify-center">
        <div className="max-w-[560px] w-full text-center flex flex-col items-center">
          <h1 className="font-serif font-semibold text-[32px] md:text-[40px] lg:text-[44px] text-white tracking-tight mb-4 animate-fade-in-up [animation-delay:0.1s]">
            <EditableText assetKey="hero.title" defaultValue="Retro Fotoğraf & Video Atölyesi" as="span" />
          </h1>
          <p className="font-mono text-xs md:text-sm text-white/85 mb-2 animate-fade-in-up [animation-delay:0.2s]">
            <EditableText assetKey="hero.subtitle" defaultValue="The Photograph Studio" as="span" />
          </p>
          <div className="text-[32px] md:text-[40px] lg:text-[44px] leading-[1.1] text-white tracking-tight animate-fade-in-up [animation-delay:0.3s]">
            <EditableText assetKey="hero.line1.prefix" defaultValue="Build the" as="span" />
            {' '}
            <span className="font-serif italic">
              <EditableText assetKey="hero.line1.italic" defaultValue="next wave" as="span" />
            </span>
            <EditableText assetKey="hero.line1.suffix" defaultValue="," as="span" />
            <br />
            <EditableText assetKey="hero.line2.prefix" defaultValue="the" as="span" />
            {' '}
            <span className="font-serif italic">
              <EditableText assetKey="hero.line2.italic" defaultValue="bold way" as="span" />
            </span>
            <EditableText assetKey="hero.line2.suffix" defaultValue="." as="span" />
          </div>
          
          <div className="flex flex-col gap-6 mt-5 md:mt-6 text-sm md:text-base text-white/85 leading-relaxed animate-fade-in-up [animation-delay:0.4s]">
            <p>
              <EditableText
                assetKey="hero.p1"
                defaultValue="I spent seven years at Apple crafting products used by over a billion people. I founded Vortex Studio to bring that same level of thinking to innovators shaping what comes next."
                as="span"
                multiline
              />
            </p>
            <p>
              <EditableText
                assetKey="hero.p2"
                defaultValue="The studio is deliberately small. I guide the creative vision on every project, backed by a veteran design crew that moves fast without cutting corners."
                as="span"
                multiline
              />
            </p>
            <p className="font-medium text-white">
              <EditableText
                assetKey="hero.p3"
                defaultValue="Projects start at $5,000 per month."
                as="span"
              />
            </p>
          </div>
        </div>
        </div>
      </section>

      {/* 2+. Ana sayfa medya blokları (sıra → site.home.mediaLayout) */}
      <HomeMediaSections />

      {/* FOOTER */}
      <Footer />

      {/* COPYRIGHT BAR */}
      <CopyrightBar />

      {/* FIXED BOTTOM NAV */}
      <BottomNav />
    </main>
  );
}

function HeroBackgroundMedia() {
  const { value } = useEditableAsset('hero.backgroundMedia', WEDDING_PHOTO_URLS[1]);
  const { value: playlistRaw } = useEditableAsset('hero.backgroundPlaylist', '');
  const { value: imageSecondsRaw } = useEditableAsset('hero.playlist.imageSeconds', '4');

  const playlist = useMemo(() => {
    const lines = String(playlistRaw || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    return lines;
  }, [playlistRaw]);

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [playlistRaw]);
  const [ready, setReady] = useState(false);
  const imageSeconds = Math.max(1, Math.min(20, Number(imageSecondsRaw || 4) || 4));

  const src = (playlist.length ? playlist[idx % playlist.length] : String(value || '')).trim();
  const isVideo = /^data:video\//i.test(src) || /\.(mp4|webm|ogg)(\?.*)?$/i.test(src);
  const poster = useMemo(() => {
    const fallback = String(value || '').trim();
    const fallbackIsVideo = /^data:video\//i.test(fallback) || /\.(mp4|webm|ogg)(\?.*)?$/i.test(fallback);
    return fallback && !fallbackIsVideo ? fallback : '';
  }, [value]);

  useEffect(() => {
    setReady(false);
  }, [src]);

  useEffect(() => {
    if (!src) return;
    if (!playlist.length) return;
    if (isVideo) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % playlist.length), imageSeconds * 1000);
    return () => window.clearTimeout(t);
  }, [imageSeconds, isVideo, playlist.length, src]);

  const mediaFitClass =
    'absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500';

  if (!src) return null;

  return (
    <div className="w-full h-full bg-black">
      {poster ? (
        <img
          src={poster}
          alt=""
          className={`${mediaFitClass} ${ready ? 'opacity-0' : 'opacity-100'}`}
        />
      ) : null}

      {isVideo ? (
        <video
          key={`${idx}:${src}`}
          src={src}
          className={`${mediaFitClass} ${ready ? 'opacity-100' : 'opacity-0'}`}
          autoPlay
          muted
          playsInline
          preload="auto"
          poster={poster || undefined}
          onLoadedData={() => setReady(true)}
          onCanPlay={() => setReady(true)}
          onEnded={() => {
            if (playlist.length) setIdx((i) => (i + 1) % playlist.length);
          }}
          onError={() => {
            if (playlist.length) setIdx((i) => (i + 1) % playlist.length);
            else setReady(true);
          }}
          loop={!playlist.length}
        />
      ) : (
        <img src={src} alt="" className={`${mediaFitClass} opacity-100`} />
      )}
    </div>
  );
}
