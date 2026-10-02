'use client';

import type { AnyNodeProps } from '@opencanvas/core';
import { CanvasView } from '@opencanvas/editor/dom';
import {
  BringToFront,
  Circle,
  ClipboardPaste,
  Copy,
  Frame,
  Group,
  Hand,
  Lock,
  Minus,
  MousePointer2,
  SendToBack,
  Square,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { recallClipboard, rememberClipboard } from '@/lib/clipboard';
import { FONT_FALLBACKS } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { ELEMENT_DRAG_TYPE } from './side-panel';

function ToolBar() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const tool = useEditorValue((e) => e.state.get().tool);
  const tools = [
    { id: 'select', icon: MousePointer2, key: 'V' },
    { id: 'hand', icon: Hand, key: 'H' },
    { id: 'text', icon: Type, key: 'T' },
    { id: 'rect', icon: Square, key: 'R' },
    { id: 'ellipse', icon: Circle, key: 'O' },
    { id: 'line', icon: Minus, key: 'L' },
    { id: 'frame', icon: Frame, key: 'F' },
  ] as const;
  return (
    <div
      role="toolbar"
      aria-label={t('editor.tools.label')}
      className="absolute start-1/2 top-3 z-10 flex gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-md ltr:-translate-x-1/2 rtl:translate-x-1/2"
    >
      {tools.map((item) => (
        <IconButton
          key={item.id}
          label={t(`editor.tools.${item.id}`)}
          shortcut={item.key}
          active={tool === item.id}
          onClick={() => editor.setTool(item.id)}
          data-testid={`tool-${item.id}`}
        >
          <item.icon className="size-[18px]" />
        </IconButton>
      ))}
    </div>
  );
}

export function CanvasArea() {
  const { t } = useI18n();
  const { editor, session, viewRef, uploadFiles } = useEditorContext();
  const container = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const selection = useEditorValue((e) => {
    const nodes = e.getSelectedNodes();
    return {
      count: nodes.length,
      group: nodes.some((n) => n.type === 'group'),
      locked: nodes.length > 0 && nodes.every((n) => n.locked),
    };
  });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const view = new CanvasView({
      editor,
      container: el,
      renderer: session.renderer,
      platform: session.platform,
      measurer: session.measurer,
      fontFallbacks: FONT_FALLBACKS,
      onContextMenu: (point) => setMenu(point),
    });
    viewRef.current = view;
    const off = session.onInvalidate(() => view.invalidateScene());
    // Expose for diagnostics and automated tests.
    (window as unknown as { __opencanvas?: unknown }).__opencanvas = { editor, view, session };
    return () => {
      off();
      view.dispose();
      viewRef.current = null;
    };
  }, [editor, session, viewRef]);

  const pagePoint = (clientX: number, clientY: number) => {
    const rect = container.current!.getBoundingClientRect();
    return editor.screenToPage({ x: clientX - rect.left, y: clientY - rect.top });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={container}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is a keyboard-operated application region
        tabIndex={0}
        role="application"
        aria-roledescription={t('editor.a11y.canvas')}
        aria-label={t('editor.a11y.canvas')}
        aria-describedby="canvas-description"
        data-testid="canvas"
        className={cn(
          'absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300',
          dragging && 'ring-4 ring-inset ring-brand-400',
        )}
        style={{ touchAction: 'none' }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(ELEMENT_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const at = pagePoint(e.clientX, e.clientY);
          const element = e.dataTransfer.getData(ELEMENT_DRAG_TYPE);
          if (element) {
            try {
              editor.insertNodes([JSON.parse(element) as AnyNodeProps], { at });
            } catch {
              // ignore malformed drags
            }
            return;
          }
          const files = [...e.dataTransfer.files].filter(
            (f) => f.type.startsWith('image/') || /\.(svg|avif)$/i.test(f.name),
          );
          if (files.length) void uploadFiles(files, at);
        }}
      />
      <p id="canvas-description" className="sr-only">
        {t('editor.a11y.canvasDescription')}
      </p>
      <ToolBar />
      {dragging ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
          <span className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {t('editor.uploads.dropOverlay')}
          </span>
        </div>
      ) : null}
      <DropdownMenu.Root open={menu !== null} onOpenChange={(open) => !open && setMenu(null)}>
        {/* Invisible anchor at the pointer; the menu opens from the canvas, not from this button. */}
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute size-0 opacity-0"
            style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="z-50 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-800 shadow-xl"
            data-testid="context-menu"
            onCloseAutoFocus={(e) => {
              // Keep keyboard focus on the canvas rather than the hidden anchor.
              e.preventDefault();
              container.current?.focus({ preventScroll: true });
            }}
          >
            <MenuItem
              icon={<Copy className="size-4" />}
              shortcut="Mod+C"
              disabled={selection.count === 0}
              onSelect={() => {
                const data = editor.copy();
                if (data) rememberClipboard(data);
              }}
            >
              {t('editor.menu.copy')}
            </MenuItem>
            <MenuItem
              icon={<ClipboardPaste className="size-4" />}
              shortcut="Mod+V"
              onSelect={() => {
                const data = recallClipboard();
                if (data) editor.paste(data);
              }}
            >
              {t('editor.menu.paste')}
            </MenuItem>
            <MenuItem
              shortcut="Mod+D"
              disabled={selection.count === 0}
              onSelect={() => editor.duplicateSelected()}
            >
              {t('editor.menu.duplicate')}
            </MenuItem>
            <MenuItem
              icon={<Trash2 className="size-4" />}
              shortcut="Delete"
              disabled={selection.count === 0}
              onSelect={() => editor.deleteSelected()}
            >
              {t('editor.menu.delete')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Group className="size-4" />}
              shortcut="Mod+G"
              disabled={selection.count < 2}
              onSelect={() => editor.groupSelected()}
            >
              {t('editor.menu.group')}
            </MenuItem>
            <MenuItem
              icon={<Ungroup className="size-4" />}
              shortcut="Mod+Shift+G"
              disabled={!selection.group}
              onSelect={() => editor.ungroupSelected()}
            >
              {t('editor.menu.ungroup')}
            </MenuItem>
            <MenuItem
              icon={<BringToFront className="size-4" />}
              disabled={selection.count === 0}
              onSelect={() => editor.reorderSelected('front')}
            >
              {t('editor.menu.bringToFront')}
            </MenuItem>
            <MenuItem
              icon={<SendToBack className="size-4" />}
              disabled={selection.count === 0}
              onSelect={() => editor.reorderSelected('back')}
            >
              {t('editor.menu.sendToBack')}
            </MenuItem>
            <MenuItem
              icon={<Lock className="size-4" />}
              disabled={selection.count === 0}
              onSelect={() => editor.toggleLockSelected()}
            >
              {selection.locked ? t('editor.menu.unlock') : t('editor.menu.lock')}
            </MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
