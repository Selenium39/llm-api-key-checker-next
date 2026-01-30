import { getRequestConfig } from 'next-intl/server';
import { LOCALE_CODES, DEFAULT_LOCALE, isValidLocale } from '@/lib/locales';

export const locales = LOCALE_CODES;
export type Locale = (typeof LOCALE_CODES)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isValidLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
