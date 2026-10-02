'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DesignGrid } from '@/components/dashboard/design-card';
import { FEATURED_FORMATS, FormatGrid } from '@/components/dashboard/format-grid';
import { matchesQuery, SearchBox } from '@/components/dashboard/search-box';
import { DashboardShell } from '@/components/dashboard/shell';
import { useDesigns } from '@/hooks/use-designs';
import { useI18n } from '@/i18n';

export default function HomePage() {
  const { t } = useI18n();
  const { designs, refresh } = useDesigns();
  const [query, setQuery] = useState('');
  const filtered = designs?.filter((d) => matchesQuery(d.title, query)) ?? null;
  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-8">
        <section className="rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-fuchsia-500 px-6 py-10 text-center text-white shadow-lg">
          <h1 className="text-3xl font-bold sm:text-4xl">{t('home.title')}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-brand-50">{t('home.subtitle')}</p>
          <div className="mx-auto mt-6 flex max-w-xl justify-center text-start text-slate-900">
            <SearchBox value={query} onChange={setQuery} />
          </div>
        </section>
        {query ? null : (
          <section aria-labelledby="create-heading" className="space-y-4">
            <h2 id="create-heading" className="sr-only">
              {t('nav.create')}
            </h2>
            <FormatGrid formats={FEATURED_FORMATS} />
          </section>
        )}
        <section aria-labelledby="recent-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-semibold text-slate-900">
              {t('home.recent')}
            </h2>
            {designs && designs.length > 10 ? (
              <Link href="/designs" className="text-sm font-medium text-brand-600 hover:underline">
                {t('home.seeAll')}
              </Link>
            ) : null}
          </div>
          {filtered === null ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-medium text-slate-800">
                {query ? t('home.noResults', { query }) : t('home.empty')}
              </p>
              {query ? null : <p className="mt-1 text-sm text-slate-500">{t('home.emptyHint')}</p>}
            </div>
          ) : (
            <DesignGrid designs={filtered.slice(0, query ? undefined : 10)} onChange={refresh} />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
