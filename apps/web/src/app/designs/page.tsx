'use client';

import { useState } from 'react';
import { DesignGrid } from '@/components/dashboard/design-card';
import { SearchBox } from '@/components/dashboard/search-box';
import { DashboardShell } from '@/components/dashboard/shell';
import { useDesigns } from '@/hooks/use-designs';
import { useI18n } from '@/i18n';
import { matchesQuery } from '@/lib/search';

export default function DesignsPage() {
  const { t } = useI18n();
  const { designs, refresh } = useDesigns();
  const [query, setQuery] = useState('');
  const filtered = designs?.filter((d) => matchesQuery(d.title, query)) ?? null;
  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">{t('nav.designs')}</h1>
        <SearchBox value={query} onChange={setQuery} />
        {filtered === null ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-600">{query ? t('home.noResults', { query }) : t('home.empty')}</p>
        ) : (
          <DesignGrid designs={filtered} onChange={refresh} />
        )}
      </div>
    </DashboardShell>
  );
}
