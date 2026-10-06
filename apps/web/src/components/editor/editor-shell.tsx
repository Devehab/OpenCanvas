'use client';

import type { AnyNodeProps } from '@opencanvas/core';
import { serializeDocument } from '@opencanvas/core';
import type { CanvasView } from '@opencanvas/editor/dom';
import { isEditableTarget, toKeyInput } from '@opencanvas/editor/dom';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  type DialogId,
  EditorContext,
  type EditorContextValue,
  type PanelId,
  type UploadOptions,
  useEditorContext,
  useEditorValue,
  useSaveStatus,
} from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { readClipboard, recallClipboard, writeClipboard } from '@/lib/clipboard';
import { nodeLabel } from '@/lib/node-label';
import { restorePageView } from '@/lib/page-view';
import { type LibraryImage, placeImage } from '@/lib/place-image';
import { type EditorSession, openSession } from '@/lib/session';
import { createDesignCopy } from '@/lib/storage/designs';
import { prepareImage } from '@/lib/upload';
import { CanvasArea } from './canvas-area';
import { ExportDialog } from './dialogs/export-dialog';
import { GuidesDialog } from './dialogs/guides-dialog';
import { ResizeDialog } from './dialogs/resize-dialog';
import { ShortcutsDialog } from './dialogs/shortcuts-dialog';
import { Inspector } from './inspector/inspector';
import { PagesBar } from './pages-bar';
import { SidePanel } from './side-panel';
import { TopBar } from './top-bar';

export function EditorShell({ designId }: { designId: string }) {
  const { t } = useI18n();
  const [session, setSession] = useState<EditorSession | null | 'missing'>(null);
  // Read through a ref so a language change does not reopen the session.
  const recoveredTitle = useRef((title: string) => t('design.recoveredCopy', { title }));
  recoveredTitle.current = (title: string) => t('design.recoveredCopy', { title });

  useEffect(() => {
    let disposed = false;
    let opened: EditorSession | null = null;
    void openSession(designId, { recoveredTitle: (title) => recoveredTitle.current(title) }).then((s) => {
      if (disposed) {
        s?.dispose();
        return;
      }
      opened = s;
      setSession(s ?? 'missing');
    });
    return () => {
      disposed = true;
      opened?.dispose();
    };
  }, [designId]);

  if (session === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-workspace text-slate-600" role="status">
        {t('editor.loading')}
      </div>
    );
  }
  if (session === 'missing') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-workspace p-8 text-center">
        <p className="text-lg text-slate-700">{t('editor.notFound')}</p>
        <Link href="/" className={buttonClasses({ variant: 'primary' })}>
          {t('editor.backHome')}
        </Link>
      </div>
    );
  }
  return <EditorLayout session={session} />;
}

function EditorLayout({ session }: { session: EditorSession }) {
  const { t } = useI18n();
  const toast = useToast();
  const editor = session.editor;
  const viewRef = useRef<CanvasView | null>(null);
  const [panel, setPanel] = useState<PanelId | null>('elements');
  const [dialog, setDialog] = useState<DialogId>(null);

  const uploadFiles = useCallback(
    async (files: File[], options: UploadOptions = {}) => {
      const placed: LibraryImage[] = [];
      for (const file of files) {
        const prepared = await prepareImage(file, file.name || 'image');
        if (!prepared.ok) {
          toast(t(`editor.uploads.errors.${prepared.reason}`, { name: prepared.name }), 'error');
          continue;
        }
        const { asset, image } = prepared;
        session.images.put(asset.hash, image);
        placed.push(asset);
        if (options.insert !== false) placeImage(editor, asset, options.at);
      }
      if (placed.length) broadcast({ type: 'uploads-changed', tabId: TAB_ID }, { self: true });
      return placed;
    },
    [editor, session.images, t, toast],
  );

  // The page view chosen last time (single page, thumbnails or scroll).
  useEffect(() => restorePageView(editor), [editor]);

  const value = useMemo<EditorContextValue>(
    () => ({ session, editor, viewRef, panel, setPanel, dialog, setDialog, uploadFiles }),
    [session, editor, panel, dialog, uploadFiles],
  );

  // Keyboard shortcuts (the in-place text editor stops propagation itself).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void session.autosave.flush();
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (dialog) return;
      if (e.key === '?' || (mod && e.key === '/')) {
        e.preventDefault();
        setDialog('shortcuts');
        return;
      }
      if (editor.keyDown(toKeyInput(e))) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => editor.keyUp(toKeyInput(e));
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [editor, session, dialog]);

  // Clipboard: copy / cut / paste designs, images and plain text.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || editor.editingTextId) return;
      const data = e.type === 'cut' ? editor.cut() : editor.copy();
      if (data) writeClipboard(e, data);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || editor.editingTextId) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void uploadFiles(files);
        return;
      }
      const data = readClipboard(e) ?? (e.clipboardData?.getData('text/plain') ? null : recallClipboard());
      if (data) {
        e.preventDefault();
        editor.paste(data);
        return;
      }
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text) {
        e.preventDefault();
        const rtl = /[\u0590-\u08FF]/.test(text);
        editor.insertNodes([
          {
            type: 'text',
            sizing: text.length > 40 ? 'auto-height' : 'auto-width',
            width: 600,
            align: rtl ? 'right' : 'left',
            content: {
              paragraphs: text
                .slice(0, 20_000)
                .split(/\r?\n/)
                .map((line) => ({ runs: [{ text: line, style: {} }], list: 'none', indent: 0 })),
            },
            style: { fontFamily: rtl ? 'Cairo' : 'Inter', fontSize: 32 },
          } as AnyNodeProps,
        ]);
      }
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [editor, uploadFiles]);

  return (
    <EditorContext.Provider value={value}>
      <div className="flex h-dvh flex-col overflow-hidden bg-workspace">
        <TopBar />
        <ConflictBanner />
        <div className="flex min-h-0 flex-1">
          <SidePanel />
          <div className="relative flex min-w-0 flex-1 flex-col">
            <CanvasArea />
            <PagesBar />
          </div>
          <Inspector />
        </div>
      </div>
      <ErrorReporter />
      <SelectionAnnouncer />
      <ExportDialog open={dialog === 'export'} onOpenChange={(o) => setDialog(o ? 'export' : null)} />
      <ResizeDialog open={dialog === 'resize'} onOpenChange={(o) => setDialog(o ? 'resize' : null)} />
      <GuidesDialog open={dialog === 'guides'} onOpenChange={(o) => setDialog(o ? 'guides' : null)} />
      <ShortcutsDialog
        open={dialog === 'shortcuts'}
        onOpenChange={(o) => setDialog(o ? 'shortcuts' : null)}
      />
    </EditorContext.Provider>
  );
}

/** Shown when another tab saved this design while this tab had unsaved edits. */
function ConflictBanner() {
  const { t } = useI18n();
  const toast = useToast();
  const { editor, session } = useEditorContext();
  const status = useSaveStatus();
  const [busy, setBusy] = useState(false);
  if (status !== 'conflict') return null;
  const keepCopy = async () => {
    setBusy(true);
    try {
      const title = t('design.copyOf', { title: editor.store.getDocument()?.title ?? t('design.untitled') });
      const copy = await createDesignCopy(serializeDocument(editor.store), title);
      // The edits now live in the copy; leaving must not recover them into this design.
      session.autosave.discardLocalChanges();
      broadcast({ type: 'designs-changed', tabId: TAB_ID });
      // A full navigation disposes this session without saving over the newer version.
      window.location.assign(`/design/${copy.id}`);
    } catch {
      toast(t('editor.toasts.saveFailed'), 'error');
      setBusy(false);
    }
  };
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900"
      data-testid="conflict-banner"
    >
      {t('editor.conflict.message')}
      <Button
        size="sm"
        onClick={() => {
          // The user chose the other tab's version: don't journal or recover these edits.
          session.autosave.discardLocalChanges();
          window.location.reload();
        }}
        disabled={busy}
      >
        {t('editor.conflict.reload')}
      </Button>
      <Button
        size="sm"
        variant="primary"
        onClick={() => void keepCopy()}
        disabled={busy}
        data-testid="conflict-keep-copy"
      >
        {t('editor.conflict.keepCopy')}
      </Button>
    </div>
  );
}

/** Engine messages with a translation (others are shown as they are). */
const KNOWN_ERRORS: Record<string, string> = {
  'This page is locked. Unlock it to add elements.': 'editor.errors.pageLocked',
  'A design needs at least one page': 'editor.errors.lastPage',
  'The frame is locked': 'editor.errors.frameLocked',
  'The frame has no image': 'editor.errors.frameEmpty',
};

/** Shows editor errors (rejected commands) as toasts. */
function ErrorReporter() {
  const { t } = useI18n();
  const toast = useToast();
  const error = useEditorValue((e) => e.state.get().lastError);
  const last = useRef<number>(0);
  useEffect(() => {
    if (error && error.at !== last.current) {
      last.current = error.at;
      const key = KNOWN_ERRORS[error.message];
      toast(key ? t(key) : error.message, 'error');
    }
  }, [error, toast, t]);
  return null;
}

/** Announces selection changes to screen readers. */
function SelectionAnnouncer() {
  const { t } = useI18n();
  const selection = useEditorValue((e) => e.selectedIds);
  const editor = useEditorValue(
    (e) => e,
    [],
    () => true,
  );
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (selection.length === 0) setMessage(t('editor.a11y.nothingSelected'));
    else if (selection.length === 1) {
      const node = editor.store.getNode(selection[0]!);
      if (node)
        setMessage(
          t('editor.a11y.selected', { name: nodeLabel(node, (type) => t(`editor.nodeTypes.${type}`)) }),
        );
    } else setMessage(t('editor.a11y.selectedMany', { n: selection.length }));
  }, [selection, editor, t]);
  return (
    <div aria-live="polite" className="sr-only" data-testid="selection-announcer">
      {message}
    </div>
  );
}
