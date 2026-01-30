/** @type {import('next-intl').NextIntlConfig} */
const { LOCALE_CODES, DEFAULT_LOCALE } = require('./src/lib/locales');

module.exports = async function getRequestConfig({ requestLocale }) {
  const locale = (await requestLocale) || DEFAULT_LOCALE;
  const safeLocale = LOCALE_CODES.includes(locale) ? locale : DEFAULT_LOCALE;

  return {
    locale: safeLocale,
    messages: (await import(`./messages/${safeLocale}.json`)).default
  };
};
