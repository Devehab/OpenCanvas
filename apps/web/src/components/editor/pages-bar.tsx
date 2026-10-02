'use client';

import { type Id, isEmptyDiff } from '@opencanvas/core';
import { rasterizePage } from '@opencanvas/renderer';
import { ChevronDown, ChevronUp, Copy, Maximize, Minus, Plus, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/** Re-renders page thumbnails when that page's content changes (debounced). */
function usePageVersions(): Record<Id, number> {
  const { editor, session } = useEditorContext();
  const [versions, setVersions] = useState<Record<Id, number>>({});
  useEffect(() => {
    const pending = new Set<Id>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      setVersions((v) => {
        const next = { ...v };
        for (const id of pending) next[id] = (next[id] ?? 0) + 1;
        pending.clear();
        return next;
      });
    };
    const touch = (ids: Iterable<Id>) => {
      for (const id of ids) pending.add(id);
      clearTimeout(timer);
      timer = setTimeout(flush, 350);
    };
    const offStore = editor.store.listen((change) => {
      if (isEmptyDiff(change.diff)) return;
      const pages = new Set<Id>();
      for (const rec of [...Object.values(change.diff.added), ...Object.values(change.diff.removed)]) {
        const pageId =
          rec.typeName === 'page'
            ? rec.id
            : rec.typeName === 'node'
              ? editor.store.getPageIdOf(rec.parentId)
              : undefined;
        if (pageId) pages.add(pageId);
      }
      for (const [, to] of Object.values(change.diff.updated)) {
        const pageId = to.typeName === 'page' ? to.id : editor.store.getPageIdOf(to.id);
        if (pageId) pages.add(pageId);
      }
      if (pages.size === 0) for (const id of editor.store.getPageIds()) pages.add(id);
      touch(pages);
    });
    const offImages = session.onInvalidate(() => touch(editor.store.getPageIds()));
    return () => {
      offStore();
      offImages();
      clearTimeout(timer);
    };
  }, [editor, session]);
  return versions;
}

const Thumbnail = memo(function Thumbnail({ pageId, version }: { pageId: Id; version: number }) {
  const { editor, session } = useEditorContext();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void version;
    const canvas = ref.current;
    const page = editor.store.getPage(pageId);
    if (!canvas || !page) return;
    const height = 56;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = (height / page.height) * dpr;
    const {
      canvas: raster,
      width,
      height: h,
    } = rasterizePage(session.renderer, session.platform, editor.store, pageId, {
      scale,
      placeholders: true,
    });
    canvas.width = width;
    canvas.height = h;
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${h / dpr}px`;
    canvas.getContext('2d')?.drawImage(raster as unknown as CanvasImageSource, 0, 0);
  }, [editor, session, pageId, version]);
  return <canvas ref={ref} aria-hidden className="block rounded-sm bg-white" />;
});

export function PagesBar() {
  const { t, formatNumber } = useI18n();
  const { editor } = useEditorContext();
  const versions = usePageVersions();
  const pages = useEditorValue((e) => e.store.getPageIds());
  const current = useEditorValue((e) => e.pageId);
  const zoom = useEditorValue((e) => e.state.get().camera.zoom);
  const index = pages.indexOf(current);
  return (
    <section
      className="flex h-[92px] shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-3"
      aria-label={t('editor.pages.label')}
    >
      <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2" data-testid="pages-list">
        {pages.map((id, i) => (
          <li key={id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => editor.setCurrentPage(id)}
              aria-current={id === current ? 'page' : undefined}
              aria-label={t('editor.pages.page', { n: i + 1 })}
              data-testid="page-thumb"
              className={cn(
                'block rounded-md border-2 p-0.5 transition',
                id === current ? 'border-brand-500' : 'border-transparent hover:border-slate-300',
              )}
            >
              <Thumbnail pageId={id} version={versions[id] ?? 0} />
            </button>
            <span className="pointer-events-none absolute -bottom-0.5 start-1 rounded bg-white/90 px-1 text-[10px] font-medium text-slate-600">
              {i + 1}
            </span>
          </li>
        ))}
        <li className="shrink-0">
          <button
            type="button"
            onClick={() => editor.addPage()}
            aria-label={t('editor.pages.add')}
            title={t('editor.pages.add')}
            data-testid="add-page"
            className="flex h-[60px] w-12 items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600"
          >
            <Plus className="size-5" />
          </button>
        </li>
      </ol>
      <div className="flex items-center gap-0.5 border-s border-slate-200 ps-2">
        <span className="me-1 text-xs tabular-nums text-slate-500" data-testid="page-position">
          {t('editor.pages.position', { current: index + 1, total: pages.length })}
        </span>
        <IconButton
          label={t('editor.pages.moveUp')}
          size="sm"
          disabled={index <= 0}
          onClick={() => editor.execute('page.move', { id: current, position: index - 1 })}
          tooltipSide="top"
        >
          <ChevronUp className="size-4 -rotate-90 rtl:rotate-90" />
        </IconButton>
        <IconButton
          label={t('editor.pages.moveDown')}
          size="sm"
          disabled={index >= pages.length - 1}
          onClick={() => editor.execute('page.move', { id: current, position: index + 1 })}
          tooltipSide="top"
        >
          <ChevronDown className="size-4 -rotate-90 rtl:rotate-90" />
        </IconButton>
        <IconButton
          label={t('editor.pages.duplicate')}
          size="sm"
          onClick={() => editor.duplicatePage()}
          tooltipSide="top"
          data-testid="duplicate-page"
        >
          <Copy className="size-4" />
        </IconButton>
        <IconButton
          label={t('editor.pages.delete')}
          size="sm"
          disabled={pages.length <= 1}
          onClick={() => editor.deletePage()}
          tooltipSide="top"
          data-testid="delete-page"
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      <fieldset
        className="flex items-center gap-0.5 border-s border-slate-200 ps-2"
        aria-label={t('editor.zoom.label')}
      >
        <IconButton label={t('editor.zoom.out')} size="sm" onClick={() => editor.zoomOut()} tooltipSide="top">
          <Minus className="size-4" />
        </IconButton>
        <button
          type="button"
          onClick={() => editor.zoomTo(1)}
          className="w-12 rounded-md py-1 text-center text-xs font-medium tabular-nums text-slate-700 hover:bg-slate-100"
          data-testid="zoom-level"
          title="100%"
          dir="ltr"
        >
          {formatNumber(Math.round(zoom * 100))}%
        </button>
        <IconButton label={t('editor.zoom.in')} size="sm" onClick={() => editor.zoomIn()} tooltipSide="top">
          <Plus className="size-4" />
        </IconButton>
        <IconButton
          label={t('editor.zoom.fit')}
          size="sm"
          onClick={() => editor.zoomToFit()}
          tooltipSide="top"
        >
          <Maximize className="size-4" />
        </IconButton>
      </fieldset>
    </section>
  );
}
