import type { GetRequestConfigParams } from 'next-intl/server';
import { isValidLocale, DEFAULT_LOCALE } from './src/lib/locales';

export default async function getRequestConfig({ requestLocale }: GetRequestConfigParams) {
  const locale = (await requestLocale) || DEFAULT_LOCALE;

  const safeLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;

  return {
    locale: safeLocale,
    messages: (await import(`./messages/${safeLocale}.json`)).default
  };
}
