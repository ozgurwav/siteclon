export const WEDDING_PHOTO_URLS = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1509610973147-e6e0f4be2e56?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1800&q=85',
  'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1800&q=85',
] as const;

export const WEDDING_PORTRAIT_URLS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=85',
] as const;

/** Default media shared by hero playlist, partner effect and marquee strip. */
export const DEFAULT_LOOP_MEDIA_URLS = [...WEDDING_PHOTO_URLS] as const;

export function defaultLoopMediaText() {
  return DEFAULT_LOOP_MEDIA_URLS.join('\n');
}

/** Home page project rows; media is edited through `projects.<title>.image`. */
export const HOMEPAGE_PROJECT_ROWS = [
  {
    id: 'evr',
    title: 'Düğün Hikayeleri',
    description: 'Hazırlık, tören ve kutlama boyunca doğal ışıkta sinematik kareler.',
    defaultImage: WEDDING_PHOTO_URLS[0],
  },
  {
    id: 'automation',
    title: 'Nişan & Save The Date',
    description: 'Çiftlerin enerjisini sade, zarif ve zamansız bir anlatımla yakalayan çekimler.',
    defaultImage: WEDDING_PHOTO_URLS[2],
  },
  {
    id: 'xportfolio',
    title: 'Albüm & Portre',
    description: 'Teslimata hazır seçkiler, retouch ve aile portreleriyle tamamlanan arşiv.',
    defaultImage: WEDDING_PHOTO_URLS[5],
  },
] as const;

export const DEFAULT_SALES_BANNER_MEDIA = WEDDING_PHOTO_URLS[6];
