'use client';

import type { Vec } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import type { CanvasView } from '@opencanvas/editor/dom';
import { createContext, type RefObject, useContext, useRef, useSyncExternalStore } from 'react';
import type { SaveStatus } from '@/lib/autosave';
import type { LibraryImage } from '@/lib/place-image';
import type { EditorSession } from '@/lib/session';

export type PanelId = 'elements' | 'text' | 'uploads' | 'layers';
export type DialogId = 'export' | 'resize' | 'shortcuts' | 'guides' | null;

export interface EditorContextValue {
  session: EditorSession;
  editor: Editor;
  viewRef: RefObject<CanvasView | null>;
  panel: PanelId | null;
  setPanel: (panel: PanelId | null) => void;
  dialog: DialogId;
  setDialog: (dialog: DialogId) => void;
  /** Uploads images to the library and (unless `insert: false`) places them in the design. */
  uploadFiles: (files: File[], options?: UploadOptions) => Promise<LibraryImage[]>;
}

export interface UploadOptions {
  /** Page point to drop at: onto a frame fills it, onto an image replaces it. */
  at?: Vec;
  insert?: boolean;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditorContext must be used inside the editor');
  return value;
}

export function useEditor(): Editor {
  return useEditorContext().editor;
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka)
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/**
 * Subscribes to a derived value of the editor. Re-renders only when the
 * selected value changes (shallow comparison by default).
 */
export function useEditorValue<T>(
  selector: (editor: Editor) => T,
  deps: readonly unknown[] = [],
  isEqual: (a: T, b: T) => boolean = shallowEqual,
): T {
  const editor = useEditor();
  const cache = useRef<{ version: number; deps: readonly unknown[]; value: T } | null>(null);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = () => {
    const version = editor.version;
    const c = cache.current;
    if (c && c.version === version && shallowEqual(c.deps, deps)) return c.value;
    const value = selectorRef.current(editor);
    if (c && isEqual(c.value, value)) {
      cache.current = { version, deps, value: c.value };
      return c.value;
    }
    cache.current = { version, deps, value };
    return value;
  };
  return useSyncExternalStore((cb) => editor.subscribe(cb), getSnapshot, getSnapshot);
}

export function useSaveStatus(): SaveStatus {
  const { session } = useEditorContext();
  return useSyncExternalStore(
    (cb) => session.autosave.subscribe(cb),
    () => session.autosave.status,
    () => session.autosave.status,
  );
}
