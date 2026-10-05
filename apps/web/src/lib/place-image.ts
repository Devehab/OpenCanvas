/**
 * Putting a library image (upload, brand photo, logo…) into the design the way
 * Canva does: onto a photo frame → it fills the frame; onto an image → it
 * replaces the image; otherwise it is added. All of it is one undo step.
 */
import {
  type AssetRecord,
  fitSize,
  getFrameAtPoint,
  getNodeAtPoint,
  type Id,
  type ImageNode,
  type Vec,
} from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import { assetRecordFor } from './storage/assets';

/** An image in the local library, identified by the hash of its bytes. */
export interface LibraryImage {
  hash: string;
  mimeType: string;
  width: number;
  height: number;
  name: string;
  size?: number;
}

/** Data transfer type for dragging library images onto the canvas. */
export const ASSET_DRAG_TYPE = 'application/x-opencanvas-asset';

/** Parses (untrusted) drag data into a library image reference. */
export function parseAssetDrag(raw: string): LibraryImage | null {
  try {
    const v = JSON.parse(raw) as Partial<LibraryImage>;
    if (
      typeof v.hash === 'string' &&
      /^sha256-[0-9a-f]{64}$/.test(v.hash) &&
      typeof v.mimeType === 'string' &&
      Number.isFinite(v.width) &&
      Number.isFinite(v.height)
    ) {
      return {
        hash: v.hash,
        mimeType: v.mimeType,
        width: v.width!,
        height: v.height!,
        name: typeof v.name === 'string' ? v.name.slice(0, 200) : '',
        size: Number.isFinite(v.size) ? v.size : 0,
      };
    }
  } catch {
    // not ours
  }
  return null;
}

/** The design's asset record for an image, added if the design does not have it yet. */
function ensureAsset(editor: Editor, image: LibraryImage): AssetRecord {
  const existing = editor.store.getAssets().find((a) => a.hash === image.hash);
  if (existing) return existing;
  const asset = assetRecordFor({ ...image, size: image.size ?? 0 });
  editor.execute('asset.add', { asset });
  return asset;
}

/** Where an image dropped at `at` (or clicked, without `at`) would go. */
export function imageDropTarget(
  editor: Editor,
  at?: Vec,
): { kind: 'frame'; id: Id } | { kind: 'image'; id: Id } | { kind: 'page' } {
  if (at) {
    const frame = getFrameAtPoint(editor.store, editor.pageId, at);
    if (frame) return { kind: 'frame', id: frame.id };
    const hit = getNodeAtPoint(editor.store, editor.getScopeId(), at, { deep: false });
    if (hit?.type === 'image' && !hit.locked) return { kind: 'image', id: hit.id };
    return { kind: 'page' };
  }
  // Clicking a photo while an empty or filled frame is selected fills that frame.
  const selected = editor.getSelectedNodes();
  if (selected.length === 1 && selected[0]!.type === 'frame' && !selected[0]!.locked)
    return { kind: 'frame', id: selected[0]!.id };
  return { kind: 'page' };
}

/** Places an image and selects it. Returns the ids of the affected image elements. */
export function placeImage(editor: Editor, image: LibraryImage, at?: Vec): Id[] {
  const target = imageDropTarget(editor, at);
  editor.history.beginBatch(target.kind === 'page' ? 'Add image' : 'Place image');
  try {
    const asset = ensureAsset(editor, image);
    if (target.kind === 'frame') {
      return editor.execute('frame.fill', { frameId: target.id, assetId: asset.id })?.select ?? [];
    }
    if (target.kind === 'image') {
      editor.execute('image.replace', { id: target.id, assetId: asset.id });
      editor.select([target.id]);
      return [target.id];
    }
    const page = editor.store.getPage(editor.pageId)!;
    const size = fitSize(asset.width, asset.height, page.width * 0.6, page.height * 0.6);
    const props = { type: 'image', assetId: asset.id, ...size, name: asset.name } as Partial<ImageNode>;
    return editor.insertNodes([props as never], at ? { at } : {});
  } finally {
    editor.history.endBatch();
  }
}
