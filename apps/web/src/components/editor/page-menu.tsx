'use client';

/**
 * The page menu, like Canva's: right-click a page thumbnail or grid tile, or
 * use the "more" button in a page's header. The same items appear everywhere.
 */
import type { Id } from '@opencanvas/core';
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { recallClipboard, rememberClipboard } from '@/lib/clipboard';
import { leaveGridView } from '@/lib/page-view';

/** Focuses the title field in a page's header (after the page is shown). */
function focusPageTitle(pageId: Id) {
  const find = () =>
    document.querySelector<HTMLInputElement>(
      `[data-testid="page-header"][data-page-id="${CSS.escape(pageId)}"] [data-testid="page-title"]`,
    );
  // The header appears once the page is current and laid out.
  let tries = 0;
  const attempt = () => {
    const input = find();
    if (input) {
      input.focus();
      input.select();
    } else if (tries++ < 10) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

/**
 * Set by "Rename page": when the menu closes, focus goes to the page title
 * rather than back to the button or thumbnail that opened the menu.
 */
let renameOnClose: Id | null = null;

function onMenuClosed(event: Event) {
  if (!renameOnClose) return;
  event.preventDefault();
  focusPageTitle(renameOnClose);
  renameOnClose = null;
}

function PageMenuItems({ pageId }: { pageId: Id }) {
  const { t } = useI18n();
  const { editor, setDialog } = useEditorContext();
  const page = useEditorValue((e) => e.store.getPage(pageId), [pageId]);
  const ids = useEditorValue((e) => e.store.getPageIds());
  if (!page) return null;
  const index = ids.indexOf(pageId);
  const show = () => {
    leaveGridView(editor);
    if (editor.pageId !== pageId) editor.setCurrentPage(pageId);
  };
  return (
    <>
      <MenuItem
        icon={<Copy className="size-4" />}
        testId="page-menu-copy"
        onSelect={() => {
          const data = editor.copyPage(pageId);
          if (data) rememberClipboard(data);
        }}
      >
        {t('editor.pages.copy')}
      </MenuItem>
      <MenuItem
        icon={<ClipboardPaste className="size-4" />}
        testId="page-menu-paste"
        disabled={recallClipboard() === null}
        onSelect={() => {
          const data = recallClipboard();
          if (!data) return;
          // A copied page becomes a new page after this one; copied elements land on this page.
          if (data.page) editor.pastePage(data, pageId);
          else {
            show();
            editor.paste(data);
          }
        }}
      >
        {t('editor.pages.paste')}
      </MenuItem>
      <MenuItem
        icon={<CopyPlus className="size-4" />}
        testId="page-menu-duplicate"
        onSelect={() => editor.duplicatePage(pageId)}
      >
        {t('editor.pages.duplicate')}
      </MenuItem>
      <MenuItem
        danger
        icon={<Trash2 className="size-4" />}
        testId="page-menu-delete"
        disabled={ids.length <= 1}
        onSelect={() => editor.deletePage(pageId)}
      >
        {t('editor.pages.delete')}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<FilePlus2 className="size-4" />}
        testId="page-menu-add"
        onSelect={() => editor.addPage(pageId)}
      >
        {t('editor.pages.add')}
      </MenuItem>
      <MenuItem
        icon={<Pencil className="size-4" />}
        testId="page-menu-rename"
        onSelect={() => {
          if (editor.pageView === 'grid') leaveGridView(editor);
          editor.setCurrentPage(pageId, { fit: editor.pageView !== 'scroll' });
          renameOnClose = pageId;
        }}
      >
        {t('editor.pages.rename')}
      </MenuItem>
      <MenuItem
        icon={<ArrowUp className="size-4" />}
        testId="page-menu-move-up"
        disabled={index <= 0}
        onSelect={() => editor.movePage(pageId, -1)}
      >
        {t('editor.pages.moveUp')}
      </MenuItem>
      <MenuItem
        icon={<ArrowDown className="size-4" />}
        testId="page-menu-move-down"
        disabled={index === ids.length - 1}
        onSelect={() => editor.movePage(pageId, 1)}
      >
        {t('editor.pages.moveDown')}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={page.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        testId="page-menu-hide"
        onSelect={() =>
          editor.updatePage(pageId, { hidden: !page.hidden }, page.hidden ? 'Show page' : 'Hide page')
        }
      >
        {page.hidden ? t('editor.pages.show') : t('editor.pages.hide')}
      </MenuItem>
      <MenuItem
        icon={page.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
        testId="page-menu-lock"
        onSelect={() =>
          editor.updatePage(pageId, { locked: !page.locked }, page.locked ? 'Unlock page' : 'Lock page')
        }
      >
        {page.locked ? t('editor.pages.unlock') : t('editor.pages.lock')}
      </MenuItem>
      <MenuItem
        icon={<Download className="size-4" />}
        testId="page-menu-download"
        onSelect={() => {
          show();
          setDialog('exportPage');
        }}
      >
        {t('editor.pages.download')}
      </MenuItem>
    </>
  );
}

/** Wraps a page thumbnail or tile so right-clicking it opens the page menu. */
export function PageContextMenu({ pageId, children }: { pageId: Id; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent testId="page-menu" onCloseAutoFocus={onMenuClosed}>
        <PageMenuItems pageId={pageId} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The "…" button in a page header. */
export function PageMenuButton({
  pageId,
  index,
  className,
}: {
  pageId: Id;
  index: number;
  className?: string;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          size="sm"
          label={t('editor.pages.actions', { n: formatNumber(index + 1) })}
          data-testid="page-menu-button"
          className={className}
        >
          <MoreHorizontal className="size-4" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" onCloseAutoFocus={onMenuClosed}>
        <div data-testid="page-menu" className="contents">
          <PageMenuItems pageId={pageId} />
        </div>
      </MenuContent>
    </Menu>
  );
}
