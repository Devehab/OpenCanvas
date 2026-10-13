/**
 * Pictures from the editor's own libraries (the flags of the icon library):
 * fetched from the app, kept like an upload (so designs work offline and
 * sync like any image) but not listed among the user's uploads.
 */
import type { Id, Vec } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import { placeImage } from './place-image';
import { prepareImage } from './upload';

/** Data transfer type for dragging a library picture onto the canvas: its address and name. */
export const LIBRARY_IMAGE_DRAG_TYPE = 'application/x-opencanvas-library-image';

/** Only the app's own library files can be dragged in this way. */
const LIBRARY_PATH = /^\/icon-library\/[\w/-]+\.svg$/;

export function parseLibraryImageDrag(raw: string): { src: string; name: string } | null {
  try {
    const v = JSON.parse(raw) as { src?: unknown; name?: unknown };
    if (typeof v.src === 'string' && LIBRARY_PATH.test(v.src))
      return { src: v.src, name: typeof v.name === 'string' ? v.name.slice(0, 200) : '' };
  } catch {
    // not ours
  }
  return null;
}

/** Adds a library picture to the design (at a point, or the page's centre) and selects it. */
export async function insertLibraryImage(editor: Editor, src: string, name: string, at?: Vec): Promise<Id[]> {
  if (!LIBRARY_PATH.test(src)) throw new Error('Not a library picture');
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  const prepared = await prepareImage(await response.blob(), name, { library: true });
  if (!prepared.ok) throw new Error(`Could not add ${name}: ${prepared.reason}`);
  const { hash, mimeType, width, height } = prepared.asset;
  // Added like an icon: a moderate size, not most of the page.
  return placeImage(editor, { hash, mimeType, width, height, name, size: prepared.asset.size }, at, {
    maxSize: 320,
  });
}
