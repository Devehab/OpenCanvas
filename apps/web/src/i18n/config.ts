/** Locale configuration shared by server and client code (no React here). */
export type Locale = 'en' | 'ar';
export const LOCALES: readonly Locale[] = ['en', 'ar'];
export const LOCALE_COOKIE = 'oc-locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar';
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
