export const CALENDAR_CONFIG_KEY = 'site.calendar.config';

export type CalendarThemeFont = 'serif' | 'sans' | 'mono';

export type CalendarTexts = {
  pageTitle: string;
  pageSubtitle: string;
  backLink: string;
  formSectionTitle: string;
  dateSelectedPrefix: string;
  selectDayHint: string;
  slotsLabel: string;
  loadingAvailability: string;
  labelName: string;
  labelEmail: string;
  labelPhone: string;
  labelNote: string;
  phName: string;
  phEmail: string;
  phPhone: string;
  phNote: string;
  submitButton: string;
  submitLoading: string;
  msgSuccess: string;
  msgSelectSlot: string;
  msgGenericError: string;
  msgSlotTaken: string;
  msgNetwork: string;
  msgDayFull: string;
  adminTitle: string;
  adminRefresh: string;
  adminEmpty: string;
  thDate: string;
  thTime: string;
  thName: string;
  thEmail: string;
  thStatus: string;
  thActions: string;
  approve: string;
  cancel: string;
  settingsTitle: string;
  settingsSave: string;
  settingsSaved: string;
  maxPerDayLabel: string;
  maxPerDayHint: string;
  fontTitleLabel: string;
  fontSubtitleLabel: string;
  fontLabelLabel: string;
  fontBodyLabel: string;
};

export type CalendarTheme = {
  titleFont: CalendarThemeFont;
  subtitleFont: CalendarThemeFont;
  labelFont: CalendarThemeFont;
  bodyFont: CalendarThemeFont;
};

export type CalendarConfig = {
  texts: CalendarTexts;
  theme: CalendarTheme;
};

const FONT_SET = new Set<CalendarThemeFont>(['serif', 'sans', 'mono']);

export function fontToClass(f: unknown): string {
  const v = String(f || '').toLowerCase();
  if (v === 'serif') return 'font-serif';
  if (v === 'mono') return 'font-mono';
  return 'font-sans';
}

export const DEFAULT_CALENDAR_TEXTS: CalendarTexts = {
  pageTitle: 'Randevu planla',
  pageSubtitle:
    'Uygun günü ve saati seç, iletişim bilgilerini bırak. Ekibimiz talebini onaylamak için sana döner.',
  backLink: 'Ana sayfa',
  formSectionTitle: 'Saat & bilgiler',
  dateSelectedPrefix: 'Seçilen gün:',
  selectDayHint: 'Takvimden bir gün seç.',
  slotsLabel: 'Müsait saatler',
  loadingAvailability: 'Uygunluk güncelleniyor…',
  labelName: 'Ad Soyad',
  labelEmail: 'E-posta',
  labelPhone: 'Telefon (isteğe bağlı)',
  labelNote: 'Not (isteğe bağlı)',
  phName: 'Örn. Ayşe Yılmaz',
  phEmail: 'ornek@email.com',
  phPhone: '05xx xxx xx xx',
  phNote: 'Kısaca ne konuşmak istediğini yaz.',
  submitButton: 'Randevu talebi gönder',
  submitLoading: 'Gönderiliyor…',
  msgSuccess: 'Randevun kaydedildi. En kısa sürede onay için seninle iletişime geçeceğiz.',
  msgSelectSlot: 'Önce gün ve saat seç.',
  msgGenericError: 'Gönderilemedi. Bilgileri kontrol et.',
  msgSlotTaken: 'Bu saat dolu. Başka bir slot dene.',
  msgNetwork: 'Ağ hatası. Tekrar dene.',
  msgDayFull: 'Bu gün için kontenjan doldu. Başka bir gün seç.',
  adminTitle: 'Gelen randevular',
  adminRefresh: 'Yenile',
  adminEmpty: 'Kayıtlı randevu yok veya liste yüklenemedi.',
  thDate: 'Tarih',
  thTime: 'Saat',
  thName: 'Ad',
  thEmail: 'E-posta',
  thStatus: 'Durum',
  thActions: 'İşlem',
  approve: 'Onayla',
  cancel: 'İptal',
  settingsTitle: 'Takvim içeriği ve tipografi',
  settingsSave: 'Ayarları kaydet',
  settingsSaved: 'Kaydedildi.',
  maxPerDayLabel: 'Gün başına en fazla randevu',
  maxPerDayHint: 'Bu güne ait onaylı veya bekleyen tüm randevular bu sayıya ulaşınca yeni talep alınmaz (1–100).',
  fontTitleLabel: 'Ana başlıklar (serif önerilir)',
  fontSubtitleLabel: 'Üst açıklama',
  fontLabelLabel: 'Küçük etiketler / saatler',
  fontBodyLabel: 'Gövde, form, tablo',
};

export const DEFAULT_CALENDAR_THEME: CalendarTheme = {
  titleFont: 'serif',
  subtitleFont: 'mono',
  labelFont: 'mono',
  bodyFont: 'sans',
};

/** Tek seçimle ana sayfaya yakın kombinasyonlar */
export const CALENDAR_FONT_PRESETS = {
  home: DEFAULT_CALENDAR_THEME,
  allSans: { titleFont: 'sans', subtitleFont: 'sans', labelFont: 'sans', bodyFont: 'sans' } satisfies CalendarTheme,
  allSerif: { titleFont: 'serif', subtitleFont: 'serif', labelFont: 'serif', bodyFont: 'serif' } satisfies CalendarTheme,
} as const;

export type CalendarFontPresetId = keyof typeof CALENDAR_FONT_PRESETS | 'custom';

export function matchCalendarFontPreset(theme: CalendarTheme): CalendarFontPresetId {
  const keys = Object.keys(CALENDAR_FONT_PRESETS) as (keyof typeof CALENDAR_FONT_PRESETS)[];
  for (const k of keys) {
    const p = CALENDAR_FONT_PRESETS[k];
    if (
      p.titleFont === theme.titleFont &&
      p.subtitleFont === theme.subtitleFont &&
      p.labelFont === theme.labelFont &&
      p.bodyFont === theme.bodyFont
    ) {
      return k;
    }
  }
  return 'custom';
}

export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = {
  texts: DEFAULT_CALENDAR_TEXTS,
  theme: DEFAULT_CALENDAR_THEME,
};

function pickFont(v: unknown, fallback: CalendarThemeFont): CalendarThemeFont {
  const s = String(v || '').toLowerCase();
  return FONT_SET.has(s as CalendarThemeFont) ? (s as CalendarThemeFont) : fallback;
}

export function normalizeCalendarConfig(raw: unknown): CalendarConfig {
  if (!raw || typeof raw !== 'object')
    return { texts: { ...DEFAULT_CALENDAR_TEXTS }, theme: { ...DEFAULT_CALENDAR_THEME } };
  const o = raw as Record<string, unknown>;
  const textsIn = (o.texts && typeof o.texts === 'object' ? o.texts : {}) as Record<string, string>;
  const themeIn = (o.theme && typeof o.theme === 'object' ? o.theme : {}) as Record<string, unknown>;
  const texts = { ...DEFAULT_CALENDAR_TEXTS };
  for (const k of Object.keys(DEFAULT_CALENDAR_TEXTS) as (keyof CalendarTexts)[]) {
    if (typeof textsIn[k] === 'string' && textsIn[k].trim()) (texts as any)[k] = textsIn[k].trim();
  }
  const theme: CalendarTheme = {
    titleFont: pickFont(themeIn.titleFont, DEFAULT_CALENDAR_THEME.titleFont),
    subtitleFont: pickFont(themeIn.subtitleFont, DEFAULT_CALENDAR_THEME.subtitleFont),
    labelFont: pickFont(themeIn.labelFont, DEFAULT_CALENDAR_THEME.labelFont),
    bodyFont: pickFont(themeIn.bodyFont, DEFAULT_CALENDAR_THEME.bodyFont),
  };
  return { texts, theme };
}
