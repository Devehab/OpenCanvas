'use client';

import { type Id, isEmptyDiff } from '@opencanvas/core';
import { rasterizePage } from '@opencanvas/renderer';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Fullscreen,
  LayoutGrid,
  Lock,
  Minimize,
  PanelBottom,
  Plus,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { setPageView, toggleGridView } from '@/lib/page-view';
import { cn } from '@/lib/utils';
import { PageContextMenu } from './page-menu';

/** Re-renders page thumbnails when that page's content changes (debounced). */
export function usePageVersions(): Record<Id, number> {
  const { editor, session } = useEditorContext();
  const [versions, setVersions] = useState<Record<Id, number>>({});
  useEffect(() => {
    const pending = new Set<Id>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      // Copy first: React may call the updater more than once (StrictMode).
      const ids = [...pending];
      pending.clear();
      setVersions((v) => {
        const next = { ...v };
        for (const id of ids) next[id] = (next[id] ?? 0) + 1;
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

/** A page preview that fits inside `maxWidth` × `height`, keeping the page's proportions. */
export const Thumbnail = memo(function Thumbnail({
  pageId,
  version,
  height = 56,
  maxWidth = 112,
}: {
  pageId: Id;
  version: number;
  height?: number;
  maxWidth?: number;
}) {
  const { editor, session } = useEditorContext();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void version;
    const canvas = ref.current;
    const page = editor.store.getPage(pageId);
    if (!canvas || !page) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Wide formats (covers, banners) are limited by width, tall ones by height.
    const scale = Math.min(height / page.height, maxWidth / page.width) * dpr;
    const {
      canvas: raster,
      width,
      height: h,
    } = rasterizePage(session.renderer, session.platform, editor.store, pageId, {
      scale,
      placeholders: true,
      framePlaceholders: true,
    });
    canvas.width = width;
    canvas.height = h;
    // Only the width is set: the height follows the canvas's own aspect ratio,
    // so a narrower container shrinks the preview instead of overflowing.
    canvas.style.width = `${width / dpr}px`;
    canvas.getContext('2d')?.drawImage(raster as unknown as CanvasImageSource, 0, 0);
  }, [editor, session, pageId, version, height, maxWidth]);
  return <canvas ref={ref} aria-hidden className="block h-auto max-w-full rounded-sm bg-white" />;
});

/** Drag and drop to reorder pages (thumbnail strip and grid view). */
export function usePageReorder() {
  const { editor } = useEditorContext();
  const [dragging, setDragging] = useState<Id | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const itemProps = (id: Id, index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('application/x-opencanvas-page', id);
      e.dataTransfer.effectAllowed = 'move';
      setDragging(id);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(index);
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const from = editor.store.getPageIds().indexOf(dragging);
      if (from !== index && from >= 0) editor.execute('page.move', { id: dragging, position: index });
      setDragging(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });
  return { itemProps, dragging, over };
}

const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MIN_SLIDER_ZOOM = 0.1;
const MAX_SLIDER_ZOOM = 5;
// Logarithmic slider: equal steps feel equal at every zoom level.
const zoomToSlider = (z: number) =>
  Math.round(
    (Math.log(Math.min(MAX_SLIDER_ZOOM, Math.max(MIN_SLIDER_ZOOM, z)) / MIN_SLIDER_ZOOM) /
      Math.log(MAX_SLIDER_ZOOM / MIN_SLIDER_ZOOM)) *
      1000,
  );
const sliderToZoom = (v: number) => MIN_SLIDER_ZOOM * (MAX_SLIDER_ZOOM / MIN_SLIDER_ZOOM) ** (v / 1000);

function useFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return { on, toggle };
}

function ThumbnailStrip() {
  const { t, formatNumber } = useI18n();
  const { editor } = useEditorContext();
  const versions = usePageVersions();
  const pages = useEditorValue((e) => e.store.getPageIds());
  const current = useEditorValue((e) => e.pageId);
  const flags = useEditorValue(
    (e) =>
      pages.map((id) => `${e.store.getPage(id)?.hidden ? 'h' : ''}${e.store.getPage(id)?.locked ? 'l' : ''}`),
    [pages],
  );
  const { itemProps, over } = usePageReorder();
  return (
    <ol
      className="flex min-w-0 items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2"
      data-testid="pages-list"
      aria-label={t('editor.pages.label')}
    >
      {pages.map((id, i) => (
        <li
          key={id}
          className={cn('group relative shrink-0', over === i && 'ring-2 ring-brand-400 rounded-md')}
          {...itemProps(id, i)}
        >
          <PageContextMenu pageId={id}>
            <button
              type="button"
              onClick={() => editor.setCurrentPage(id)}
              aria-current={id === current ? 'page' : undefined}
              aria-label={t('editor.pages.page', { n: formatNumber(i + 1) })}
              data-testid="page-thumb"
              className={cn(
                'block rounded-md border-2 p-0.5 transition',
                id === current ? 'border-brand-500' : 'border-transparent hover:border-slate-300',
                flags[i]?.includes('h') && 'opacity-50',
              )}
            >
              <Thumbnail pageId={id} version={versions[id] ?? 0} />
            </button>
          </PageContextMenu>
          <span className="pointer-events-none absolute -bottom-0.5 start-1 flex items-center gap-0.5 rounded bg-white/90 px-1 text-[10px] font-medium text-slate-600">
            {formatNumber(i + 1)}
            {flags[i]?.includes('h') ? (
              <EyeOff className="size-2.5" aria-label={t('editor.pages.hidden')} />
            ) : null}
            {flags[i]?.includes('l') ? (
              <Lock className="size-2.5" aria-label={t('editor.pages.locked')} />
            ) : null}
          </span>
        </li>
      ))}
      <li className="shrink-0">
        <button
          type="button"
          onClick={() => editor.addPage(editor.store.getPageIds().at(-1))}
          aria-label={t('editor.pages.add')}
          title={t('editor.pages.add')}
          data-testid="add-page"
          className="flex h-[60px] w-12 items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600"
        >
          <Plus className="size-5" />
        </button>
      </li>
    </ol>
  );
}

export function PagesBar() {
  const { t, formatNumber } = useI18n();
  const { editor } = useEditorContext();
  const pages = useEditorValue((e) => e.store.getPageIds());
  const current = useEditorValue((e) => e.pageId);
  const zoom = useEditorValue((e) => e.state.get().camera.zoom);
  const view = useEditorValue((e) => e.state.get().pageView);
  const fullscreen = useFullscreen();
  const index = pages.indexOf(current);
  const percent = `${formatNumber(Math.round(zoom * 100))}%`;
  return (
    <section className="shrink-0" aria-label={t('editor.pages.footer')}>
      {view === 'thumbnails' ? <ThumbnailStrip /> : null}
      <div className="flex h-11 items-center justify-end gap-1 border-t border-slate-200 bg-white px-3">
        <button
          type="button"
          aria-pressed={view === 'thumbnails'}
          // Like Canva: closing the strip shows every page in one scrolling column.
          onClick={() => setPageView(editor, view === 'thumbnails' ? 'scroll' : 'thumbnails')}
          className={cn(
            'me-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100',
            view === 'thumbnails' && 'bg-slate-100',
          )}
          data-testid="toggle-thumbnails"
        >
          <PanelBottom className="size-4" />
          <span className="max-sm:sr-only">{t('editor.pages.label')}</span>
          <ChevronDown
            className={cn('size-3.5 transition-transform', view !== 'thumbnails' && 'rotate-180')}
          />
        </button>
        <div className="flex items-center gap-2 max-md:hidden">
          <input
            type="range"
            min={0}
            max={1000}
            value={zoomToSlider(zoom)}
            onChange={(e) => editor.zoomTo(sliderToZoom(Number(e.target.value)))}
            aria-label={t('editor.zoom.label')}
            aria-valuetext={percent}
            className="h-1 w-28 cursor-pointer accent-brand-500"
            data-testid="zoom-slider"
          />
        </div>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="w-14 rounded-md py-1 text-center text-xs font-medium tabular-nums text-slate-700 hover:bg-slate-100"
              data-testid="zoom-level"
              aria-label={`${t('editor.zoom.label')}: ${percent}`}
              dir="ltr"
            >
              {percent}
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="min-w-36">
            {[...ZOOM_PRESETS].reverse().map((z) => (
              <MenuItem key={z} onSelect={() => editor.zoomTo(z)}>
                <span dir="ltr">{formatNumber(Math.round(z * 100))}%</span>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => editor.zoomToFit()}>{t('editor.zoom.fit')}</MenuItem>
          </MenuContent>
        </Menu>
        <div className="mx-1 h-5 w-px bg-slate-200 max-sm:hidden" />
        <IconButton
          size="sm"
          label={t('editor.pages.previous')}
          className="max-sm:hidden"
          disabled={index <= 0}
          onClick={() => editor.goToPage(-1)}
          tooltipSide="top"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </IconButton>
        <button
          type="button"
          onClick={() => toggleGridView(editor)}
          className="min-w-12 rounded-md px-1.5 py-1 text-center text-xs font-medium tabular-nums text-slate-700 hover:bg-slate-100"
          data-testid="page-position"
          aria-label={t('editor.pages.position', {
            current: formatNumber(index + 1),
            total: formatNumber(pages.length),
          })}
          title={t('editor.pages.gridView')}
        >
          {formatNumber(index + 1)} / {formatNumber(pages.length)}
        </button>
        <IconButton
          size="sm"
          label={t('editor.pages.next')}
          className="max-sm:hidden"
          disabled={index >= pages.length - 1}
          onClick={() => editor.goToPage(1)}
          tooltipSide="top"
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </IconButton>
        <IconButton
          size="sm"
          label={t('editor.pages.gridView')}
          active={view === 'grid'}
          onClick={() => toggleGridView(editor)}
          tooltipSide="top"
          data-testid="grid-view"
        >
          <LayoutGrid className="size-4" />
        </IconButton>
        <IconButton
          size="sm"
          label={fullscreen.on ? t('editor.pages.exitFullscreen') : t('editor.pages.fullscreen')}
          className="max-sm:hidden"
          onClick={fullscreen.toggle}
          tooltipSide="top"
        >
          {fullscreen.on ? <Minimize className="size-4" /> : <Fullscreen className="size-4" />}
        </IconButton>
      </div>
    </section>
  );
}
