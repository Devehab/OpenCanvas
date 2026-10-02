/**
 * An editing session for one design: document store, editor, renderer,
 * fonts, images, autosave and thumbnails.
 */
import { type DocumentSnapshot, loadDocument, parseDocument, stringifyDocument } from '@opencanvas/core';
import { Editor } from '@opencanvas/editor';
import { BrowserImageResolver, collectFontRequests, loadFonts } from '@opencanvas/editor/dom';
import {
  createBrowserPlatform,
  createCanvasMeasurer,
  type RenderPlatform,
  SceneRenderer,
} from '@opencanvas/renderer';
import { Autosave } from './autosave';
import { broadcast, TAB_ID } from './channel';
import { FONT_FALLBACKS } from './fonts';
import { clearJournal, readJournal } from './journal';
import { getAssetBlob } from './storage/assets';
import type { DesignRecord } from './storage/designs';
import { createDesignCopy, getDesign } from './storage/designs';
import { putThumbnail } from './storage/thumbnails';
import { renderThumbnail } from './thumbnail-render';

export interface EditorSession {
  design: DesignRecord;
  editor: Editor;
  platform: RenderPlatform;
  measurer: ReturnType<typeof createCanvasMeasurer>;
  renderer: SceneRenderer;
  images: BrowserImageResolver;
  autosave: Autosave;
  /** Subscribe to "something visual changed outside the store" (image loaded). */
  onInvalidate(listener: () => void): () => void;
  dispose(): void;
}

export interface OpenSessionOptions {
  /** Title for a design created from unsaved edits that conflict with newer stored work. */
  recoveredTitle?: (title: string) => string;
}

/**
 * Picks the snapshot to open: the stored one, or a journal of edits a closing
 * tab could not finish writing. A journal based on an older revision than the
 * stored one (another tab saved meanwhile) becomes a separate design.
 */
async function recoverJournal(
  design: DesignRecord,
  options: OpenSessionOptions,
): Promise<{ snapshot: DocumentSnapshot; recovered: boolean }> {
  const journal = readJournal(design.id);
  if (!journal) return { snapshot: design.snapshot, recovered: false };
  try {
    const { snapshot } = parseDocument(journal.snapshot);
    if (stringifyDocument(snapshot) === stringifyDocument(design.snapshot)) {
      clearJournal(design.id);
      return { snapshot: design.snapshot, recovered: false };
    }
    if (journal.baseRevision === design.revision) return { snapshot, recovered: true };
    const title = options.recoveredTitle?.(design.title) ?? `${design.title} (recovered)`;
    await createDesignCopy(snapshot, title);
    broadcast({ type: 'designs-changed', tabId: TAB_ID }, { self: true });
  } catch {
    // An unreadable journal cannot be recovered.
  }
  clearJournal(design.id);
  return { snapshot: design.snapshot, recovered: false };
}

export async function openSession(
  designId: string,
  options: OpenSessionOptions = {},
): Promise<EditorSession | null> {
  const design = await getDesign(designId);
  if (!design || design.deletedAt !== null) return null;
  const { snapshot, recovered } = await recoverJournal(design, options);
  const { store } = loadDocument(snapshot, { freeze: process.env.NODE_ENV !== 'production' });
  // Measure text with the real fonts from the first frame.
  await loadFonts(collectFontRequests(store), 6000);
  const platform = createBrowserPlatform();
  const measurer = createCanvasMeasurer(platform, FONT_FALLBACKS);
  const editor = new Editor({ store, measurer });
  // Re-measure once in case a font finished loading after the document was saved elsewhere.
  editor.remeasureAllText();
  editor.history.clear();

  const invalidateListeners = new Set<() => void>();
  const images = new BrowserImageResolver(
    async (asset) => getAssetBlob(asset.hash),
    () => {
      for (const l of [...invalidateListeners]) l();
    },
  );
  const renderer = new SceneRenderer(platform, images, measurer);

  // Previews are written shortly after saves (and right away when leaving the editor).
  let thumbTimer: ReturnType<typeof setTimeout> | undefined;
  let thumbPending = false;
  const writeThumbnail = async () => {
    clearTimeout(thumbTimer);
    thumbPending = false;
    const revision = autosave.savedRevision;
    await images.loadAll(store.getAssets());
    const blob = await renderThumbnail(store, renderer, platform);
    if (blob) await putThumbnail(design.id, blob, revision);
  };
  // Rendering a preview takes main-thread time: never during a gesture, and in idle time when possible.
  const scheduleThumbnail = (delay: number) => {
    clearTimeout(thumbTimer);
    thumbPending = true;
    thumbTimer = setTimeout(() => {
      if (editor.isGesturing || editor.editingTextId) {
        scheduleThumbnail(500);
        return;
      }
      const run = () => void writeThumbnail().catch(() => {});
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
      else run();
    }, delay);
  };
  const autosave = new Autosave(editor, design.id, design.revision, {
    onSaved: () => scheduleThumbnail(1500),
  });
  // Recovered edits are written right away (the journal is cleared once stored).
  if (recovered) autosave.markRecovered();
  // Ensure every design has a thumbnail.
  scheduleThumbnail(2500);

  return {
    design,
    editor,
    platform,
    measurer,
    renderer,
    images,
    autosave,
    onInvalidate(listener) {
      invalidateListeners.add(listener);
      return () => invalidateListeners.delete(listener);
    },
    dispose() {
      clearTimeout(thumbTimer);
      // dispose() journals unsaved edits synchronously and starts the final write.
      autosave.dispose();
      void autosave
        .flush()
        .then(() => (thumbPending ? writeThumbnail() : undefined))
        .catch(() => {});
      editor.dispose();
      invalidateListeners.clear();
    },
  };
}
