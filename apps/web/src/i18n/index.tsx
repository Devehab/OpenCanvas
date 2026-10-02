'use client';

/**
 * Lightweight i18n: typed dictionaries, `{var}` interpolation, Intl-based
 * number/date formatting, and RTL support via <html dir>.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { ar } from './ar';
import { directionOf, isLocale, LOCALE_COOKIE, LOCALES, type Locale } from './config';
import { type Dictionary, en } from './en';

export { directionOf, isLocale, LOCALE_COOKIE, LOCALES, type Locale };

const dictionaries: Record<Locale, Dictionary> = { en, ar };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];
export type MessageKey = Paths<Dictionary>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>))
      node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = lookup(dictionaries[locale], key) ?? lookup(en, key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: MessageKey | (string & {}), vars?: Record<string, string | number>) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
  formatRelative: (timestamp: number) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const setLocale = useCallback((next: Locale) => {
    // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie read by the root layout
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = directionOf(next);
    window.location.reload();
  }, []);

  const value = useMemo<I18nValue>(() => {
    const numberFormat = new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en');
    const relative = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
      numeric: 'auto',
    });
    return {
      locale,
      dir: directionOf(locale),
      t: (key, vars) => translate(locale, key, vars),
      formatNumber: (n, options) =>
        options
          ? new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', options).format(n)
          : numberFormat.format(n),
      formatRelative: (timestamp) => {
        const seconds = Math.round((timestamp - Date.now()) / 1000);
        const abs = Math.abs(seconds);
        if (abs < 60) return relative.format(Math.round(seconds), 'second');
        if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
        if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
        if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), 'day');
        return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
          dateStyle: 'medium',
        }).format(timestamp);
      },
      setLocale,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
