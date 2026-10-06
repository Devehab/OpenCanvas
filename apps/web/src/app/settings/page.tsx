'use client';

/** Settings for this browser: uploaded fonts, icon packs and plugins. */
import '@/lib/font-faces';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard/shell';
import { FontsSettings } from '@/components/settings/fonts-settings';
import { IconsSettings } from '@/components/settings/icons-settings';
import { PluginsSettings } from '@/components/settings/plugins-settings';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const TABS: { id: string; render: () => ReactNode }[] = [
  { id: 'fonts', render: () => <FontsSettings /> },
  { id: 'icons', render: () => <IconsSettings /> },
  { id: 'plugins', render: () => <PluginsSettings /> },
];

function Settings() {
  const { t } = useI18n();
  const params = useSearchParams();
  const active = TABS.find((tab) => tab.id === params.get('tab')) ?? TABS[0]!;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('settings.subtitle')}</p>
      </div>
      <nav className="flex gap-1 border-b border-slate-200" aria-label={t('settings.title')}>
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/settings?tab=${tab.id}`}
            aria-current={tab === active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
            data-testid={`settings-tab-${tab.id}`}
          >
            {t(`settings.tabs.${tab.id}`)}
          </Link>
        ))}
      </nav>
      {active.render()}
    </div>
  );
}

export default function Page() {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </DashboardShell>
  );
}
