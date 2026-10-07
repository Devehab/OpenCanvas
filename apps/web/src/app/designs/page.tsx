'use client';

/**
 * Projects: folders, designs and uploaded images, at the top level or inside
 * one folder (`/designs?folder=<id>`).
 */
import { ChevronRight, FolderPlus, Image as ImageIcon, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreateDialog } from '@/components/dashboard/create-dialog';
import { DesignGrid } from '@/components/dashboard/design-card';
import { FolderCard, FolderDialog, MoveToFolderMenu } from '@/components/dashboard/folders';
import { SearchBox } from '@/components/dashboard/search-box';
import { DashboardShell } from '@/components/dashboard/shell';
import { BlobImage } from '@/components/ui/blob-image';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/fields';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useDesigns } from '@/hooks/use-designs';
import { useFolders } from '@/hooks/use-folders';
import { useLatestCall } from '@/hooks/use-latest-call';
import { useI18n } from '@/i18n';
import { broadcast, onChannelMessage, TAB_ID } from '@/lib/channel';
import { matchesQuery } from '@/lib/search';
import { getAssetBlob, listUploads, removeUpload, type UploadSummary } from '@/lib/storage/assets';
import type { FolderRecord } from '@/lib/storage/folders';

type Tab = 'all' | 'folders' | 'designs' | 'images';

function useUploadsWithUrls() {
  const [uploads, setUploads] = useState<(UploadSummary & { url: string | null })[] | null>(null);
  const urls = useRef(new Map<string, string>());
  const begin = useLatestCall();
  const refresh = useCallback(async () => {
    const isLatest = begin();
    const list = await listUploads();
    if (!isLatest()) return;
    const keep = new Set(list.map((u) => u.hash));
    for (const [hash, url] of urls.current)
      if (!keep.has(hash)) {
        URL.revokeObjectURL(url);
        urls.current.delete(hash);
      }
    const withUrls = await Promise.all(
      list.slice(0, 300).map(async (u) => {
        let url = urls.current.get(u.hash) ?? null;
        if (!url) {
          const blob = await getAssetBlob(u.hash);
          if (blob) {
            url = URL.createObjectURL(blob);
            urls.current.set(u.hash, url);
          }
        }
        return { ...u, url };
      }),
    );
    if (isLatest()) setUploads(withUrls);
  }, [begin]);
  useEffect(() => {
    void refresh();
    const off = onChannelMessage((m) => {
      if (m.type === 'uploads-changed' || m.type === 'folders-changed') void refresh();
    });
    const cache = urls.current;
    return () => {
      off();
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, [refresh]);
  return uploads;
}

function ImageGrid({
  uploads,
  folders,
}: {
  uploads: (UploadSummary & { url: string | null })[];
  folders: readonly FolderRecord[];
}) {
  const { t } = useI18n();
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" data-testid="project-images">
      {uploads.map((u) => (
        <li key={u.hash} className="group relative" data-testid="project-image">
          <div className="oc-checker flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-200">
            {u.url ? <BlobImage src={u.url} className="max-h-full max-w-full object-contain" /> : null}
          </div>
          <p className="mt-1 truncate text-xs text-slate-600" title={u.name}>
            {u.name}
          </p>
          <Menu>
            <MenuTrigger
              className="absolute end-1.5 top-1.5 rounded-md bg-white/90 p-1 text-slate-600 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={t('editor.uploads.more', { name: u.name })}
            >
              <MoreHorizontal className="size-4" />
            </MenuTrigger>
            <MenuContent align="end">
              <MoveToFolderMenu folders={folders} current={u.folderId} kind="upload" id={u.hash} />
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 className="size-4" />}
                onSelect={async () => {
                  await removeUpload(u.hash);
                  broadcast({ type: 'uploads-changed', tabId: TAB_ID }, { self: true });
                }}
              >
                {t('common.delete')}
              </MenuItem>
            </MenuContent>
          </Menu>
        </li>
      ))}
    </ul>
  );
}

function Projects() {
  const { t } = useI18n();
  const params = useSearchParams();
  const folderId = params.get('folder');
  const { designs, refresh } = useDesigns();
  const { folders } = useFolders();
  const uploads = useUploadsWithUrls();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [newFolder, setNewFolder] = useState(false);
  const [creating, setCreating] = useState(false);
  const folder = folderId ? folders?.find((f) => f.id === folderId) : undefined;

  const inScope = useMemo(
    () => ({
      designs: (designs ?? [])
        .filter((d) => (folderId ? d.folderId === folderId : true))
        .filter((d) => matchesQuery(d.title, query))
        // Starred designs first, then most recent.
        .sort((a, b) => Number(!!b.starred) - Number(!!a.starred) || b.updatedAt - a.updatedAt),
      uploads: (uploads ?? [])
        .filter((u) => (folderId ? u.folderId === folderId : true))
        .filter((u) => matchesQuery(u.name, query)),
      folders: folderId ? [] : (folders ?? []).filter((f) => matchesQuery(f.name, query)),
    }),
    [designs, uploads, folders, folderId, query],
  );

  const show = (section: Tab) => tab === 'all' || tab === section;
  const loading = designs === null || folders === null || uploads === null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav
            className="flex items-center gap-1 text-sm text-slate-500"
            aria-label={t('projects.breadcrumb')}
          >
            <Link href="/designs" className="hover:text-slate-800">
              {t('nav.projects')}
            </Link>
            {folderId ? (
              <>
                <ChevronRight className="size-4 rtl:rotate-180" />
                <span className="truncate text-slate-800">{folder?.name ?? '…'}</span>
              </>
            ) : null}
          </nav>
          <h1 className="mt-1 truncate text-2xl font-bold text-slate-900" data-testid="projects-title">
            {folder ? folder.name : t('nav.projects')}
          </h1>
        </div>
        <div className="flex gap-2">
          {folderId ? null : (
            <Button onClick={() => setNewFolder(true)} data-testid="new-folder">
              <FolderPlus className="size-4" />
              {t('projects.newFolder')}
            </Button>
          )}
          <Button variant="primary" onClick={() => setCreating(true)} data-testid="create-in-folder">
            <Plus className="size-4" />
            {t('nav.create')}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} />
        <div className="w-full max-w-md">
          <Segmented
            showLabels
            size="md"
            label={t('projects.show')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: t('projects.all') },
              ...(folderId ? [] : [{ value: 'folders' as const, label: t('projects.folders') }]),
              { value: 'designs', label: t('projects.designs') },
              { value: 'images', label: t('projects.images') },
            ]}
            testId="projects-tab"
          />
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}

      {!loading && show('folders') && !folderId ? (
        <section aria-labelledby="folders-heading" className="space-y-3">
          <h2 id="folders-heading" className="text-lg font-semibold text-slate-900">
            {t('projects.folders')}
          </h2>
          {inScope.folders.length ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="folder-grid">
              {inScope.folders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  designs={(designs ?? []).filter((d) => d.folderId === f.id).length}
                  images={(uploads ?? []).filter((u) => u.folderId === f.id).length}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t('projects.noFoldersHint')}</p>
          )}
        </section>
      ) : null}

      {!loading && show('designs') ? (
        <section aria-labelledby="designs-heading" className="space-y-3">
          <h2 id="designs-heading" className="text-lg font-semibold text-slate-900">
            {t('projects.designs')}
          </h2>
          {inScope.designs.length ? (
            <DesignGrid designs={inScope.designs} onChange={refresh} folders={folders ?? []} />
          ) : (
            <p className="text-sm text-slate-500">
              {query
                ? t('home.noResults', { query })
                : folderId
                  ? t('projects.emptyFolder')
                  : t('home.empty')}
            </p>
          )}
        </section>
      ) : null}

      {!loading && show('images') ? (
        <section aria-labelledby="images-heading" className="space-y-3">
          <h2 id="images-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ImageIcon className="size-5 text-slate-400" />
            {t('projects.images')}
          </h2>
          {inScope.uploads.length ? (
            <ImageGrid uploads={inScope.uploads} folders={folders ?? []} />
          ) : (
            <p className="text-sm text-slate-500">{t('editor.uploads.empty')}</p>
          )}
        </section>
      ) : null}

      <FolderDialog open={newFolder} onOpenChange={setNewFolder} />
      <CreateDialog open={creating} onOpenChange={setCreating} folderId={folderId} />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <Projects />
      </Suspense>
    </DashboardShell>
  );
}
