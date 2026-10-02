/**
 * An editing session for one design: document store, editor, renderer,
 * fonts, images, autosave and thumbnails.
 */
import { loadDocument } from '@opencanvas/core';
import { Editor } from '@opencanvas/editor';
import { BrowserImageResolver, collectFontRequests, loadFonts } from '@opencanvas/editor/dom';
import {
  createBrowserPlatform,
  createCanvasMeasurer,
  type RenderPlatform,
  rasterizePage,
  SceneRenderer,
} from '@opencanvas/renderer';
import { Autosave } from './autosave';
import { FONT_FALLBACKS } from './fonts';
import { getAssetBlob } from './storage/assets';
import type { DesignRecord } from './storage/designs';
import { getDesign } from './storage/designs';
import { putThumbnail } from './storage/thumbnails';

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

export async function openSession(designId: string): Promise<EditorSession | null> {
  const design = await getDesign(designId);
  if (!design || design.deletedAt !== null) return null;
  const { store } = loadDocument(design.snapshot, { freeze: process.env.NODE_ENV !== 'production' });
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

  let thumbTimer: ReturnType<typeof setTimeout> | undefined;
  const writeThumbnail = async () => {
    const pageId = store.getPageIds()[0];
    const page = pageId ? store.getPage(pageId) : undefined;
    if (!page || !pageId) return;
    await images.loadAll(store.getAssets());
    const scale = Math.min(1, 480 / Math.max(page.width, page.height));
    const { canvas } = rasterizePage(renderer, platform, store, pageId, { scale, placeholders: false });
    const c = canvas as unknown as OffscreenCanvas | HTMLCanvasElement;
    const blob =
      'convertToBlob' in c
        ? await c.convertToBlob({ type: 'image/png' })
        : await new Promise<Blob | null>((resolve) => (c as HTMLCanvasElement).toBlob(resolve, 'image/png'));
    if (blob) await putThumbnail(design.id, blob);
  };
  const autosave = new Autosave(editor, design.id, design.revision, {
    onSaved: () => {
      clearTimeout(thumbTimer);
      thumbTimer = setTimeout(() => void writeThumbnail().catch(() => {}), 1500);
    },
  });
  // Ensure every design has a thumbnail.
  thumbTimer = setTimeout(() => void writeThumbnail().catch(() => {}), 2500);

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
      void autosave.flush();
      autosave.dispose();
      editor.dispose();
      invalidateListeners.clear();
    },
  };
}
