'use client';

/**
 * Grid view: an overview of all pages. Click a page to open it, drag pages to
 * reorder them, and duplicate, hide or delete pages from their menu.
 */
import type { Id } from '@opencanvas/core';
import { Copy, Eye, EyeOff, Lock, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { leaveGridView } from '@/lib/page-view';
import { cn } from '@/lib/utils';
import { Thumbnail, usePageReorder, usePageVersions } from './pages-bar';

function GridItem({ id, index, total, version }: { id: Id; index: number; total: number; version: number }) {
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
      <button
        type="button"
        onClick={open}
        aria-current={current ? 'page' : undefined}
        aria-label={`${t('editor.pages.page', { n: formatNumber(index + 1) })}${page.name ? ` – ${page.name}` : ''}`}
        data-testid="grid-page"
        className={cn(
          'flex h-[180px] w-full items-center justify-center rounded-xl border-2 bg-slate-100 p-3 transition',
          current ? 'border-brand-500' : 'border-transparent hover:border-slate-300',
          page.hidden && 'opacity-50',
        )}
      >
        <Thumbnail pageId={id} version={version} height={150} />
      </button>
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
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={t('editor.pages.actions', { n: formatNumber(index + 1) })}
            className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-md bg-white/90 text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Copy className="size-4" />} onSelect={() => editor.duplicatePage(id)}>
            {t('editor.pages.duplicate')}
          </MenuItem>
          <MenuItem
            icon={page.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            onSelect={() =>
              editor.updatePage(id, { hidden: !page.hidden }, page.hidden ? 'Show page' : 'Hide page')
            }
          >
            {page.hidden ? t('editor.pages.show') : t('editor.pages.hide')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            danger
            disabled={total <= 1}
            icon={<Trash2 className="size-4" />}
            onSelect={() => editor.deletePage(id)}
          >
            {t('editor.pages.delete')}
          </MenuItem>
        </MenuContent>
      </Menu>
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
            <GridItem id={id} index={i} total={pages.length} version={versions[id] ?? 0} />
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
