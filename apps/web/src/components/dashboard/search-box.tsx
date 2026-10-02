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
