'use client';

import { serializeDocument } from '@opencanvas/core';
import { PACKAGE_EXTENSION, PACKAGE_MIME, safeFileName } from '@opencanvas/export';
import {
  ArrowDownToLine,
  BringToFront,
  ChevronDown,
  Copy,
  FilePlus,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Group,
  Keyboard,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  Maximize,
  PanelBottom,
  Redo2,
  Rows3,
  Ruler,
  Save,
  Scissors,
  SendToBack,
  Square,
  Trash2,
  Undo2,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SaveStatusIndicator } from '@/components/cloud/cloud-sync';
import { Logo } from '@/components/dashboard/logo';
import { SaveAsTemplateDialog } from '@/components/templates/templates';
import { Button, IconButton } from '@/components/ui/button';
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  SubMenu,
} from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useEditorContext, useEditorValue, useSaveStatus } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { recallClipboard, rememberClipboard } from '@/lib/clipboard';
import { buildPackage, importPackageFile } from '@/lib/package-io';
import { setPageView } from '@/lib/page-view';
import { duplicateDesign } from '@/lib/storage/designs';
import { downloadBytes, shortcut } from '@/lib/utils';

function MenuButton({ label }: { label: string }) {
  return (
    <MenuTrigger className="flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-white/90 hover:bg-white/15 data-[state=open]:bg-white/20">
      {label}
      <ChevronDown className="size-3.5 opacity-70" />
    </MenuTrigger>
  );
}

function TitleInput() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const title = useEditorValue((e) => e.store.getDocument()?.title ?? '');
  const [draft, setDraft] = useState(title);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(title);
  }, [title]);
  useEffect(() => {
    document.title = `${title || t('design.untitled')} · OpenCanvas`;
  }, [title, t]);
  const commit = () => {
    const next = draft.trim() || t('design.untitled');
    if (next !== title) editor.execute('document.rename', { title: next });
    setDraft(next);
  };
  return (
    <input
      aria-label={t('editor.titleLabel')}
      data-testid="design-title-input"
      className="h-8 w-56 min-w-0 truncate rounded-md bg-transparent px-2 text-center text-sm font-medium text-white placeholder:text-white/60 hover:bg-white/10 focus:bg-white/15 focus:outline-none max-sm:hidden"
      value={draft}
      maxLength={256}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(title);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function TopBar() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { editor, session, setDialog } = useEditorContext();
  const saveStatus = useSaveStatus();
  const fileInput = useRef<HTMLInputElement>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const isTemplate = session.design.kind === 'template';
  const { canUndo, canRedo, hasSelection, snapping, rulers, hasGuides, locked, isGroup, multi } =
    useEditorValue((e) => {
      const nodes = e.getSelectedNodes();
      return {
        canUndo: e.history.canUndo,
        canRedo: e.history.canRedo,
        hasSelection: nodes.length > 0,
        snapping: e.state.get().snapping,
        rulers: e.state.get().rulers,
        hasGuides: (e.store.getPage(e.pageId)?.guides.length ?? 0) > 0,
        locked: nodes.length > 0 && nodes.every((n) => n.locked),
        isGroup: nodes.some((n) => n.type === 'group'),
        multi: nodes.length > 1,
      };
    });
  const execCopy = (type: 'copy' | 'cut') => {
    // Menu clicks have no clipboard event: keep the design in memory, put text on the system clipboard.
    const data = type === 'cut' ? editor.cut() : editor.copy();
    if (data) {
      rememberClipboard(data);
      toast(t('editor.toasts.copied'));
      void navigator.clipboard?.writeText?.(data.text || '').catch(() => {});
    }
  };
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 bg-gradient-to-r from-brand-600 to-fuchsia-600 px-2 text-white rtl:bg-gradient-to-l">
      {/* Follows the page direction: in Arabic the bar is the English one mirrored. */}
      <div className="flex items-center gap-1">
        <a
          href="/"
          className="flex items-center rounded-md px-1.5 py-1 hover:bg-white/15"
          aria-label={t('editor.home')}
        >
          <Logo compact />
        </a>
        <Menu>
          <MenuButton label={t('editor.menu.file')} />
          <MenuContent>
            <MenuItem icon={<FilePlus className="size-4" />} onSelect={() => router.push('/?create=1')}>
              {t('editor.menu.newDesign')}
            </MenuItem>
            <MenuItem icon={<FolderOpen className="size-4" />} onSelect={() => fileInput.current?.click()}>
              {t('editor.menu.open')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Save className="size-4" />}
              testId="menu-save-as"
              onSelect={async () => {
                await session.autosave.flush();
                const bytes = await buildPackage(serializeDocument(editor.store), session.design.id);
                downloadBytes(
                  bytes,
                  `${safeFileName(editor.store.getDocument()?.title ?? 'design')}${PACKAGE_EXTENSION}`,
                  PACKAGE_MIME,
                );
              }}
            >
              {t('editor.menu.saveAs')}
            </MenuItem>
            <MenuItem
              icon={<Copy className="size-4" />}
              onSelect={async () => {
                await session.autosave.flush();
                const copy = await duplicateDesign(
                  session.design.id,
                  t('design.copyOf', { title: editor.store.getDocument()?.title ?? '' }),
                );
                broadcast({ type: 'designs-changed', tabId: TAB_ID });
                if (copy) router.push(`/design/${copy.id}`);
              }}
            >
              {t('editor.menu.makeCopy')}
            </MenuItem>
            <MenuItem
              icon={<LayoutTemplate className="size-4" />}
              onSelect={() => setSavingTemplate(true)}
              testId="editor-save-as-template"
            >
              {t('templates.saveAsTemplate')}
            </MenuItem>
            <MenuItem icon={<Ruler className="size-4" />} onSelect={() => setDialog('resize')}>
              {t('editor.menu.resize')}
            </MenuItem>
            <PageViewMenu />
            <MenuSeparator />
            <MenuItem icon={<ArrowDownToLine className="size-4" />} onSelect={() => setDialog('export')}>
              {t('editor.menu.download')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuButton label={t('editor.menu.edit')} />
          <MenuContent>
            <MenuItem
              icon={<Undo2 className="size-4" />}
              shortcut="Mod+Z"
              disabled={!canUndo}
              onSelect={() => editor.undo()}
            >
              {t('editor.menu.undo')}
            </MenuItem>
            <MenuItem
              icon={<Redo2 className="size-4" />}
              shortcut="Mod+Shift+Z"
              disabled={!canRedo}
              onSelect={() => editor.redo()}
            >
              {t('editor.menu.redo')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Scissors className="size-4" />}
              shortcut="Mod+X"
              disabled={!hasSelection}
              onSelect={() => execCopy('cut')}
            >
              {t('editor.menu.cut')}
            </MenuItem>
            <MenuItem
              icon={<Copy className="size-4" />}
              shortcut="Mod+C"
              disabled={!hasSelection}
              onSelect={() => execCopy('copy')}
            >
              {t('editor.menu.copy')}
            </MenuItem>
            <MenuItem
              shortcut="Mod+V"
              onSelect={() => {
                const data = recallClipboard();
                if (data) editor.paste(data);
              }}
            >
              {t('editor.menu.paste')}
            </MenuItem>
            <MenuItem shortcut="Mod+D" disabled={!hasSelection} onSelect={() => editor.duplicateSelected()}>
              {t('editor.menu.duplicate')}
            </MenuItem>
            <MenuItem
              icon={<Trash2 className="size-4" />}
              shortcut="Delete"
              disabled={!hasSelection}
              onSelect={() => editor.deleteSelected()}
            >
              {t('editor.menu.delete')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem shortcut="Mod+A" onSelect={() => editor.selectAll()}>
              {t('editor.menu.selectAll')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuButton label={t('editor.menu.arrange')} />
          <MenuContent>
            <MenuItem
              icon={<Group className="size-4" />}
              shortcut="Mod+G"
              disabled={!multi}
              onSelect={() => editor.groupSelected()}
            >
              {t('editor.menu.group')}
            </MenuItem>
            <MenuItem
              icon={<Ungroup className="size-4" />}
              shortcut="Mod+Shift+G"
              disabled={!isGroup}
              onSelect={() => editor.ungroupSelected()}
            >
              {t('editor.menu.ungroup')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<BringToFront className="size-4" />}
              shortcut="Mod+Alt+]"
              disabled={!hasSelection}
              onSelect={() => editor.reorderSelected('front')}
            >
              {t('editor.menu.bringToFront')}
            </MenuItem>
            <MenuItem
              shortcut="Mod+]"
              disabled={!hasSelection}
              onSelect={() => editor.reorderSelected('forward')}
            >
              {t('editor.menu.bringForward')}
            </MenuItem>
            <MenuItem
              shortcut="Mod+["
              disabled={!hasSelection}
              onSelect={() => editor.reorderSelected('backward')}
            >
              {t('editor.menu.sendBackward')}
            </MenuItem>
            <MenuItem
              icon={<SendToBack className="size-4" />}
              shortcut="Mod+Alt+["
              disabled={!hasSelection}
              onSelect={() => editor.reorderSelected('back')}
            >
              {t('editor.menu.sendToBack')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<FlipHorizontal2 className="size-4" />}
              shortcut="Shift+H"
              disabled={!hasSelection}
              onSelect={() => editor.flipSelected('horizontal')}
            >
              {t('editor.menu.flipHorizontal')}
            </MenuItem>
            <MenuItem
              icon={<FlipVertical2 className="size-4" />}
              shortcut="Shift+V"
              disabled={!hasSelection}
              onSelect={() => editor.flipSelected('vertical')}
            >
              {t('editor.menu.flipVertical')}
            </MenuItem>
            <MenuItem
              icon={<Lock className="size-4" />}
              shortcut="Mod+Shift+L"
              disabled={!hasSelection}
              onSelect={() => editor.toggleLockSelected()}
            >
              {locked ? t('editor.menu.unlock') : t('editor.menu.lock')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuButton label={t('editor.menu.view')} />
          <MenuContent>
            <MenuItem icon={<ZoomIn className="size-4" />} shortcut="Mod+=" onSelect={() => editor.zoomIn()}>
              {t('editor.menu.zoomIn')}
            </MenuItem>
            <MenuItem
              icon={<ZoomOut className="size-4" />}
              shortcut="Mod+-"
              onSelect={() => editor.zoomOut()}
            >
              {t('editor.menu.zoomOut')}
            </MenuItem>
            <MenuItem
              icon={<Maximize className="size-4" />}
              shortcut="Mod+0"
              onSelect={() => editor.zoomToFit()}
            >
              {t('editor.menu.zoomFit')}
            </MenuItem>
            <MenuItem shortcut="Mod+1" onSelect={() => editor.zoomTo(1)}>
              {t('editor.menu.zoom100')}
            </MenuItem>
            <MenuItem shortcut="Shift+2" disabled={!hasSelection} onSelect={() => editor.zoomToSelection()}>
              {t('editor.menu.zoomSelection')}
            </MenuItem>
            <MenuSeparator />
            <MenuCheckItem checked={snapping} onCheckedChange={(v) => editor.state.set({ snapping: v })}>
              {t('editor.menu.snapping')}
            </MenuCheckItem>
            <MenuCheckItem checked={rulers} onCheckedChange={(v) => editor.state.set({ rulers: v })}>
              <span className="flex items-center justify-between gap-6">
                {t('editor.rulers.show')}
                <span className="text-xs text-slate-500" dir="ltr">
                  {shortcut('Shift+R')}
                </span>
              </span>
            </MenuCheckItem>
            <MenuItem
              icon={<LayoutTemplate className="size-4" />}
              onSelect={() => {
                editor.state.set({ rulers: true });
                setDialog('guides');
              }}
              testId="menu-add-guides"
            >
              {t('editor.rulers.addGuides')}
            </MenuItem>
            <MenuItem
              disabled={!hasGuides}
              onSelect={() => editor.updatePage(editor.pageId, { guides: [] }, 'Clear guides')}
            >
              {t('editor.rulers.clearGuides')}
            </MenuItem>
            <MenuItem
              icon={<Keyboard className="size-4" />}
              shortcut="?"
              onSelect={() => setDialog('shortcuts')}
            >
              {t('editor.menu.shortcuts')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <div className="mx-1 h-6 w-px bg-white/25" />
        <IconButton
          label={t('editor.menu.undo')}
          shortcut="Mod+Z"
          disabled={!canUndo}
          onClick={() => editor.undo()}
          className="text-white hover:bg-white/15"
          data-testid="undo"
        >
          <Undo2 className="size-[18px] rtl:-scale-x-100" />
        </IconButton>
        <IconButton
          label={t('editor.menu.redo')}
          shortcut="Mod+Shift+Z"
          disabled={!canRedo}
          onClick={() => editor.redo()}
          className="text-white hover:bg-white/15"
          data-testid="redo"
        >
          <Redo2 className="size-[18px] rtl:-scale-x-100" />
        </IconButton>
        <div className="ms-2 flex items-center">
          <SaveStatusIndicator local={saveStatus} />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center gap-2">
        {isTemplate ? (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white"
            title={t('templates.editing')}
            data-testid="editing-template"
          >
            <LayoutTemplate className="size-3.5" aria-hidden />
            {t('templates.badge')}
          </span>
        ) : null}
        <TitleInput />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          className="border-0 bg-white text-brand-700 hover:bg-brand-50"
          onClick={() => setDialog('export')}
          data-testid="open-export"
        >
          <ArrowDownToLine className="size-4" />
          <span className="max-sm:sr-only">{t('editor.download')}</span>
        </Button>
      </div>
      <SaveAsTemplateDialog
        open={savingTemplate}
        onOpenChange={setSavingTemplate}
        designId={session.design.id}
        title={editor.store.getDocument()?.title ?? ''}
        beforeSave={() => session.autosave.flush()}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".opencanvas,application/zip"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const design = await importPackageFile(file);
            broadcast({ type: 'designs-changed', tabId: TAB_ID });
            router.push(`/design/${design.id}`);
          } catch (error) {
            toast(t('design.importFailed', { reason: (error as Error).message }), 'error');
          }
        }}
      />
    </header>
  );
}

const PAGE_VIEWS = [
  { id: 'single', icon: Square },
  { id: 'thumbnails', icon: PanelBottom },
  { id: 'scroll', icon: Rows3 },
  { id: 'grid', icon: LayoutGrid },
] as const;

/** File → Page view: how pages are shown, with the current one checked. */
function PageViewMenu() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const view = useEditorValue((e) => e.state.get().pageView);
  return (
    <SubMenu
      icon={<Rows3 className="size-4" />}
      label={
        <span className="flex items-center justify-between gap-4">
          {t('editor.pageView.label')}
          <span className="text-xs text-slate-500">{t(`editor.pageView.${view}`)}</span>
        </span>
      }
    >
      {PAGE_VIEWS.map((v) => (
        <MenuRadioItem
          key={v.id}
          checked={view === v.id}
          icon={<v.icon className="size-4" />}
          onSelect={() => setPageView(editor, v.id)}
          testId={`page-view-${v.id}`}
        >
          {t(`editor.pageView.${v.id}`)}
        </MenuRadioItem>
      ))}
    </SubMenu>
  );
}
