'use client';

import { Search } from 'lucide-react';
import { useI18n } from '@/i18n';

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <label className="relative block w-full max-w-xl">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('home.searchPlaceholder')}
        aria-label={t('home.searchPlaceholder')}
        data-testid="search-designs"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

/** Case- and diacritic-insensitive match (works for Arabic and Latin titles). */
export function matchesQuery(title: string, query: string): boolean {
  // NFKD splits accented letters and hamza/madda carriers (أ → ا + ٔ), so
  // dropping combining marks folds Latin accents, harakat and alef variants.
  const fold = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/\p{M}|\u0640/gu, '') // combining marks and tatweel
      .replace(/\u0671/g, '\u0627') // ٱ → ا
      .replace(/\u0649/g, '\u064A') // ى → ي
      .replace(/\u0629/g, '\u0647') // ة → ه
      .toLowerCase();
  return fold(title).includes(fold(query.trim()));
}
