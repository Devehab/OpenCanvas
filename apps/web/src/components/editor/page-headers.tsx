'use client';

/**
 * Page headers above the canvas pages ("Page 2 – Add page title" plus page
 * actions), positioned from the camera. In the scroll view every visible page
 * has one; otherwise the current page does.
 */
import type { Id } from '@opencanvas/core';
import { PAGE_GAP_PX, slotScreenRect } from '@opencanvas/editor';
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, FilePlus2, Lock, LockOpen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const HEADER_HEIGHT = 32;

function PageTitle({ pageId, name }: { pageId: Id; name: string }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(name);
  }, [name, focused]);
  const commit = () => {
    const value = draft.trim().slice(0, 256);
    if (value !== name) editor.updatePage(pageId, { name: value }, 'Rename page');
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation(); // typing a title never triggers editor shortcuts
        if (e.key === 'Enter' || e.key === 'Escape') {
          if (e.key === 'Escape') setDraft(name);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={t('editor.pages.addTitle')}
      aria-label={t('editor.pages.title')}
      maxLength={256}
      dir="auto"
      className="min-w-20 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-sm text-slate-700 outline-none placeholder:text-slate-500 hover:bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-200"
      data-testid="page-title"
    />
  );
}

function PageHeader({
  pageId,
  index,
  total,
  top,
  left,
  width,
}: {
  pageId: Id;
  index: number;
  total: number;
  top: number;
  left: number;
  width: number;
}) {
  const { t, formatNumber } = useI18n();
  const { editor } = useEditorContext();
  const page = useEditorValue((e) => e.store.getPage(pageId));
  if (!page) return null;
  const compact = width < 380;
  return (
    <div
      className="absolute z-[4] flex items-center gap-1"
      style={{ top, left, width: Math.max(width, 260), height: HEADER_HEIGHT }}
      data-testid="page-header"
      data-page-id={pageId}
    >
      <span className="shrink-0 text-sm font-medium text-slate-600">
        {t('editor.pages.page', { n: formatNumber(index + 1) })}
        {page.hidden ? (
          <EyeOff className="ms-1 inline size-3.5 text-slate-400" aria-label={t('editor.pages.hidden')} />
        ) : null}
      </span>
      <span className="text-slate-300" aria-hidden>
        –
      </span>
      <PageTitle pageId={pageId} name={page.name} />
      <div className={cn('flex shrink-0 items-center', compact && 'max-sm:hidden')}>
        <IconButton
          size="sm"
          label={t('editor.pages.moveUp')}
          disabled={index === 0}
          onClick={() => editor.movePage(pageId, -1)}
          data-testid="page-move-up"
        >
          <ChevronUp className="size-4" />
        </IconButton>
        <IconButton
          size="sm"
          label={t('editor.pages.moveDown')}
          disabled={index === total - 1}
          onClick={() => editor.movePage(pageId, 1)}
          data-testid="page-move-down"
        >
          <ChevronDown className="size-4" />
        </IconButton>
        <IconButton
          size="sm"
          label={page.hidden ? t('editor.pages.show') : t('editor.pages.hide')}
          active={page.hidden}
          onClick={() =>
            editor.updatePage(pageId, { hidden: !page.hidden }, page.hidden ? 'Show page' : 'Hide page')
          }
          data-testid="page-hide"
        >
          {page.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
        <IconButton
          size="sm"
          label={page.locked ? t('editor.pages.unlock') : t('editor.pages.lock')}
          active={page.locked}
          onClick={() =>
            editor.updatePage(pageId, { locked: !page.locked }, page.locked ? 'Unlock page' : 'Lock page')
          }
          data-testid="page-lock"
        >
          {page.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
        </IconButton>
        <IconButton
          size="sm"
          label={t('editor.pages.duplicate')}
          onClick={() => editor.duplicatePage(pageId)}
          data-testid="page-duplicate"
        >
          <Copy className="size-4" />
        </IconButton>
        <IconButton
          size="sm"
          label={t('editor.pages.delete')}
          disabled={total <= 1}
          onClick={() => editor.deletePage(pageId)}
          data-testid="page-delete"
        >
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton
          size="sm"
          label={t('editor.pages.addAfter')}
          onClick={() => editor.addPage(pageId)}
          data-testid="page-add-after"
        >
          <FilePlus2 className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

const sameLayout = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function PageHeaders() {
  // Recompute when the camera, view or pages change.
  const layout = useEditorValue(
    (e) => {
      const s = e.state.get();
      if (s.pageView === 'grid') return [];
      const ids = e.store.getPageIds();
      return e.getPageSlots().map((slot) => {
        const r = slotScreenRect(s.camera, slot);
        return {
          pageId: slot.pageId,
          index: ids.indexOf(slot.pageId),
          total: ids.length,
          top: Math.round(r.y - HEADER_HEIGHT - 6),
          left: Math.round(r.x),
          width: Math.round(r.width),
          visible: r.y + r.height > 0 && r.y - PAGE_GAP_PX < s.viewport.height,
        };
      });
    },
    [],
    sameLayout,
  );
  return (
    <>
      {layout
        .filter((h) => h.visible)
        .map((h) => (
          <PageHeader key={h.pageId} {...h} />
        ))}
    </>
  );
}
