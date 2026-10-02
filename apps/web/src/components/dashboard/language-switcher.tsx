'use client';

import { Languages } from 'lucide-react';
import { useI18n } from '@/i18n';

export function LanguageSwitcher() {
  const { t, locale, setLocale } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
        className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm"
        data-testid="language-select"
        aria-label={t('common.language')}
      >
        <option value="en">English</option>
        <option value="ar">العربية</option>
      </select>
    </label>
  );
}
