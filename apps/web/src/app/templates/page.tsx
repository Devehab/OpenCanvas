'use client';

import { ChevronRight, FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { SearchBox } from '@/components/dashboard/search-box';
import { DashboardShell } from '@/components/dashboard/shell';
import {
  StarterCard,
  TemplateCard,
  TemplateFolderCard,
  TemplateFolderDialog,
  TemplateFolderIcon,
} from '@/components/templates/templates';
import { Button } from '@/components/ui/button';
import { useDesigns } from '@/hooks/use-designs';
import { useFolders } from '@/hooks/use-folders';
import { useI18n } from '@/i18n';
import { matchesQuery } from '@/lib/search';
import { STARTER_TEMPLATES } from '@/lib/templates/starters';

const grid = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

function Templates() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const folderId = params.get('folder');
  const { designs: templates } = useDesigns({ kind: 'template' });
  const { folders } = useFolders('template');
  const [query, setQuery] = useState('');
  const [newFolder, setNewFolder] = useState(false);
  const folder = folderId ? folders?.find((f) => f.id === folderId) : undefined;
  const lang = locale === 'ar' ? 'ar' : 'en';

  const shown = useMemo(() => {
    const known = new Set((folders ?? []).map((f) => f.id));
    const all = (templates ?? []).filter((d) => matchesQuery(d.title, query));
    return {
      // Searching looks in every folder; otherwise the open folder, or the templates in none.
      templates: query
        ? all
        : all.filter((d) => (folderId ? d.folderId === folderId : !d.folderId || !known.has(d.folderId))),
      folders: folderId ? [] : (folders ?? []).filter((f) => matchesQuery(f.name, query)),
      starters: folderId
        ? []
        : STARTER_TEMPLATES.filter((s) =>
            matchesQuery(`${s.title[lang]} ${t(`templates.categories.${s.category}`)}`, query),
          ),
    };
  }, [templates, folders, folderId, query, lang, t]);

  const loading = templates === null || folders === null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav
            className="flex items-center gap-1 text-sm text-slate-500"
            aria-label={t('projects.breadcrumb')}
          >
            <Link href="/templates" className="hover:text-slate-800">
              {t('templates.title')}
            </Link>
            {folderId ? (
              <>
                <ChevronRight className="size-4 rtl:rotate-180" />
                <span className="truncate text-slate-800">{folder?.name ?? '…'}</span>
              </>
            ) : null}
          </nav>
          <h1
            className="mt-1 flex items-center gap-2 truncate text-2xl font-bold text-slate-900"
            data-testid="templates-title"
          >
            {folder ? (
              <span
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ background: `${folder.color}1f`, color: folder.color }}
              >
                <TemplateFolderIcon icon={folder.icon} className="size-5" />
              </span>
            ) : null}
            {folder ? folder.name : t('templates.title')}
          </h1>
          {folderId ? null : <p className="mt-1 text-sm text-slate-500">{t('templates.subtitle')}</p>}
        </div>
        {folderId ? null : (
          <Button onClick={() => setNewFolder(true)} data-testid="new-template-folder">
            <FolderPlus className="size-4" />
            {t('templates.newFolder')}
          </Button>
        )}
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder={t('templates.search')} />

      {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}

      {!loading && !folderId ? (
        <section aria-labelledby="template-folders-heading" className="space-y-3">
          <h2 id="template-folders-heading" className="text-lg font-semibold text-slate-900">
            {t('templates.folders')}
          </h2>
          {shown.folders.length ? (
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="template-folder-grid"
            >
              {shown.folders.map((f) => (
                <TemplateFolderCard
                  key={f.id}
                  folder={f}
                  count={(templates ?? []).filter((d) => d.folderId === f.id).length}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t('templates.noFoldersHint')}</p>
          )}
        </section>
      ) : null}

      {!loading ? (
        <section aria-labelledby="your-templates-heading" className="space-y-3">
          <h2 id="your-templates-heading" className="text-lg font-semibold text-slate-900">
            {t('templates.yourTemplates')}
          </h2>
          {shown.templates.length ? (
            <ul className={grid} data-testid="template-grid">
              {shown.templates.map((d) => (
                <TemplateCard key={d.id} template={d} folders={folders ?? []} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500" data-testid="templates-empty">
              {query
                ? t('home.noResults', { query })
                : folderId
                  ? t('templates.emptyFolder')
                  : t('templates.empty')}
            </p>
          )}
        </section>
      ) : null}

      {!loading && shown.starters.length ? (
        <section aria-labelledby="starter-templates-heading" className="space-y-3">
          <div>
            <h2 id="starter-templates-heading" className="text-lg font-semibold text-slate-900">
              {t('templates.starters')}
            </h2>
            <p className="text-sm text-slate-500">{t('templates.startersHint')}</p>
          </div>
          <ul className={grid} data-testid="starter-grid">
            {shown.starters.map((s) => (
              <StarterCard key={s.id} starter={s} />
            ))}
          </ul>
        </section>
      ) : null}

      <TemplateFolderDialog open={newFolder} onOpenChange={setNewFolder} />
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <Templates />
      </Suspense>
    </DashboardShell>
  );
}
