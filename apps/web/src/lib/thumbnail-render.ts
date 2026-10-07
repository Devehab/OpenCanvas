/**
 * Dashboard previews: a small PNG of a design's first page, rendered with the
 * same engine as the editor and the exports.
 */
import { type DocumentSnapshot, type DocumentStore, loadDocument } from '@opencanvas/core';
import { BrowserImageResolver, collectFontRequests, loadFonts } from '@opencanvas/editor/dom';
import {
  createBrowserPlatform,
  createCanvasMeasurer,
  type RenderPlatform,
  rasterizePage,
  SceneRenderer,
} from '@opencanvas/renderer';
import { FONT_FALLBACKS } from './fonts';
import { getAssetBlob } from './storage/assets';
import { getDesign } from './storage/designs';
import { getThumbnailRecord, putThumbnail } from './storage/thumbnails';

const MAX_SIDE = 480;

/** Renders the first page of a loaded document to a PNG blob. */
export async function renderThumbnail(
  store: DocumentStore,
  renderer: SceneRenderer,
  platform: RenderPlatform,
): Promise<Blob | null> {
  const pageId = store.getPageIds()[0];
  const page = pageId ? store.getPage(pageId) : undefined;
  if (!page || !pageId) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(page.width, page.height));
  const { canvas } = rasterizePage(renderer, platform, store, pageId, { scale, placeholders: false });
  const c = canvas as unknown as OffscreenCanvas | HTMLCanvasElement;
  return 'convertToBlob' in c
    ? c.convertToBlob({ type: 'image/png' })
    : new Promise<Blob | null>((resolve) => (c as HTMLCanvasElement).toBlob(resolve, 'image/png'));
}

/** Renders a stored snapshot outside the editor (fonts and images loaded first). */
async function renderSnapshot(snapshot: DocumentSnapshot): Promise<Blob | null> {
  // The dashboard does not ship the font catalog CSS until a preview needs it.
  await import('./font-faces');
  await (await import('./custom-fonts')).startCustomFonts();
  const { store } = loadDocument(snapshot);
  await loadFonts(collectFontRequests(store), 6000);
  const platform = createBrowserPlatform();
  const images = new BrowserImageResolver(
    async (asset) => getAssetBlob(asset.hash),
    () => {},
  );
  await images.loadAll(store.getAssets());
  const renderer = new SceneRenderer(platform, images, createCanvasMeasurer(platform, FONT_FALLBACKS));
  return renderThumbnail(store, renderer, platform);
}

let queue: Promise<unknown> = Promise.resolve();
const queued = new Set<string>();

/**
 * Makes sure a design has a preview for its current revision (e.g. after the
 * editor tab closed before writing one). Generation runs one at a time.
 */
export function ensureThumbnail(designId: string, revision: number): void {
  if (queued.has(designId)) return;
  queued.add(designId);
  queue = queue
    .then(async () => {
      const existing = await getThumbnailRecord(designId);
      if (existing && (existing.revision ?? 0) >= revision) return;
      const design = await getDesign(designId);
      if (!design) return;
      const blob = await renderSnapshot(design.snapshot);
      if (blob) await putThumbnail(designId, blob, design.revision);
    })
    .catch(() => {})
    .finally(() => queued.delete(designId));
}

const previews = new Map<string, Promise<string | null>>();

/**
 * A preview (object URL) of a document that is not stored, such as a starter
 * template; rendered once per key, in turn with the stored previews.
 */
export function documentPreview(key: string, build: () => DocumentSnapshot): Promise<string | null> {
  let preview = previews.get(key);
  if (!preview) {
    const rendered = queue.then(() => renderSnapshot(build()));
    queue = rendered.catch(() => {});
    preview = rendered.then((blob) => (blob ? URL.createObjectURL(blob) : null)).catch(() => null);
    previews.set(key, preview);
  }
  return preview;
}
