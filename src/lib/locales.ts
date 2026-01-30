export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'zh-cn', label: '中文' },
  { code: 'zh-tw', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'pl', label: 'Polski' },
  { code: 'ms', label: 'Bahasa Melayu' }
] as const;

export const LOCALE_CODES = LOCALES.map((l) => l.code);

export const DEFAULT_LOCALE = 'en';

export function isValidLocale(locale: string): locale is (typeof LOCALE_CODES)[number] {
  return LOCALE_CODES.includes(locale as any);
}
