'use client';

/**
 * Grid view: an overview of all pages. Click a page to open it, drag pages to
 * reorder them, and right-click or use "…" for the page menu.
 */
import type { Id } from '@opencanvas/core';
import { EyeOff, Lock, Plus } from 'lucide-react';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { leaveGridView } from '@/lib/page-view';
import { cn } from '@/lib/utils';
import { PageContextMenu, PageMenuButton } from './page-menu';
import { Thumbnail, usePageReorder, usePageVersions } from './pages-bar';

function GridItem({ id, index, version }: { id: Id; index: number; version: number }) {
  const { t, formatNumber } = useI18n();
  const { editor } = useEditorContext();
  const page = useEditorValue((e) => e.store.getPage(id));
  const current = useEditorValue((e) => e.pageId === id);
  if (!page) return null;
  const open = () => {
    editor.setCurrentPage(id, { fit: false });
    leaveGridView(editor);
  };
  return (
    <div className="group relative flex flex-col items-center gap-2">
      <PageContextMenu pageId={id}>
        <button
          type="button"
          onClick={open}
          aria-current={current ? 'page' : undefined}
          aria-label={`${t('editor.pages.page', { n: formatNumber(index + 1) })}${page.name ? ` – ${page.name}` : ''}`}
          data-testid="grid-page"
          className={cn(
            'flex h-[180px] w-full items-center justify-center overflow-hidden rounded-xl border-2 bg-slate-100 p-3 transition',
            current ? 'border-brand-500' : 'border-transparent hover:border-slate-300',
            page.hidden && 'opacity-50',
          )}
        >
          <Thumbnail pageId={id} version={version} height={150} maxWidth={360} />
        </button>
      </PageContextMenu>
      <div className="flex w-full items-center gap-1 px-1 text-sm">
        <span className="font-medium text-slate-700">{formatNumber(index + 1)}</span>
        {page.hidden ? (
          <EyeOff className="size-3.5 text-slate-400" aria-label={t('editor.pages.hidden')} />
        ) : null}
        {page.locked ? (
          <Lock className="size-3.5 text-slate-400" aria-label={t('editor.pages.locked')} />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-slate-500" dir="auto">
          {page.name}
        </span>
      </div>
      <PageMenuButton
        pageId={id}
        index={index}
        className="absolute end-2 top-2 bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      />
    </div>
  );
}

export function PageGrid() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const pages = useEditorValue((e) => e.store.getPageIds());
  const versions = usePageVersions();
  const { itemProps, over } = usePageReorder();
  return (
    <section
      className="absolute inset-0 z-[6] overflow-y-auto bg-workspace p-6"
      data-testid="page-grid"
      aria-label={t('editor.pages.gridView')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') leaveGridView(editor);
      }}
    >
      <ol className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
        {pages.map((id, i) => (
          <li
            key={id}
            {...itemProps(id, i)}
            className={cn('rounded-xl', over === i && 'ring-2 ring-brand-400')}
          >
            <GridItem id={id} index={i} version={versions[id] ?? 0} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => editor.addPage(pages.at(-1))}
            className="flex h-[180px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
            data-testid="grid-add-page"
          >
            <Plus className="size-6" />
            {t('editor.pages.add')}
          </button>
        </li>
      </ol>
    </section>
  );
}
