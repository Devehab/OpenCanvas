/**
 * Photo frames: placing images into frames (Canva-style drag & drop) and
 * taking them out again.
 */
import type { IdGenerator } from '../ids';
import type { Box } from '../math/box';
import { createNodeRecord } from '../model/factory';
import type { FrameNode, Id, ImageNode, NodeRecord } from '../model/types';
import type { Transaction } from '../store/store';
import { imageFrame } from './crop';
import { reparentNodes } from './group';
import { deleteNodes } from './nodes';
import { indicesAbove } from './order';
import { coverCrop } from './resize';
import { scaleContent } from './transform';

export type FrameImageSource = { assetId: Id } | { imageId: Id };

/**
 * Fills a frame with an image: the image covers the whole frame box (center
 * crop) and replaces any image already inside it. The source is either an
 * asset (a new image element is created) or an existing image element, which
 * is moved into the frame. Returns the image element's id.
 */
export function placeImageInFrame(
  tx: Transaction,
  frameId: Id,
  source: FrameImageSource,
  createId: IdGenerator,
): Id {
  const frame = tx.getNode(frameId);
  if (frame?.type !== 'frame') throw new Error('Not a frame');
  if (frame.locked) throw new Error('The frame is locked');
  const moving = 'imageId' in source ? tx.getNode(source.imageId) : null;
  if ('imageId' in source && moving?.type !== 'image') throw new Error('Not an image');
  const assetId = moving ? (moving as ImageNode).assetId : (source as { assetId: Id }).assetId;
  const asset = tx.store.getAsset(assetId);
  if (!asset) throw new Error('Image asset not found');

  // The frame shows one photo: previous images go (the moved one stays, of course).
  const previous = tx.store
    .getChildren(frame.id)
    .filter((c) => c.type === 'image' && c.id !== moving?.id)
    .map((c) => c.id);
  if (previous.length) deleteNodes(tx, previous);

  const box = {
    x: 0,
    y: 0,
    width: frame.width,
    height: frame.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    crop: coverCrop(asset.width, asset.height, frame.width, frame.height),
  };
  if (moving) {
    if (moving.parentId !== frame.id) reparentNodes(tx, [moving.id], frame.id);
    const current = tx.getNode(moving.id) as ImageNode;
    tx.put({ ...current, ...box } as NodeRecord);
    return moving.id;
  }
  const [index] = indicesAbove(tx.store, frame.id, null, 1);
  const image = createNodeRecord('image', {
    ...box,
    id: createId('node'),
    parentId: frame.id,
    index: index!,
    assetId: asset.id,
    name: asset.name,
  });
  tx.put(image);
  return image.id;
}

/** The image inside a frame (the top-most one), if any. */
export function frameImage(tx: Transaction, frame: FrameNode): ImageNode | null {
  const images = tx.store.getChildren(frame.id).filter((c): c is ImageNode => c.type === 'image');
  return images[images.length - 1] ?? null;
}

/**
 * Takes an image out of its frame and places it above the frame, at the same
 * visual position and size. Returns the image id, or null if the frame is empty.
 */
export function detachImageFromFrame(tx: Transaction, frameId: Id): Id | null {
  const frame = tx.getNode(frameId);
  if (frame?.type !== 'frame') throw new Error('Not a frame');
  const image = frameImage(tx, frame);
  if (!image) return null;
  reparentNodes(tx, [image.id], frame.parentId, frame.id);
  return image.id;
}

/**
 * Keeps a frame's photo right while the frame is resized (Canva behaviour).
 * Call it after the frame got its new box; children must still be in their
 * state from before the resize. `localBox` is the new frame box in the old
 * frame's local coordinates.
 *
 * - Proportional resize (corner handles): the photo scales with the frame.
 * - Otherwise (side handles): the photo keeps its size and stays centered,
 *   so the frame shows more or less of it, equally on both sides. Where an
 *   edge of the photo would come into view, it slides over to use the spare
 *   area on the other side; only when the photo is too small to cover the
 *   frame does it zoom in, just enough, around the frame's center.
 */
export function refitFrameContent(tx: Transaction, start: FrameNode, localBox: Box): void {
  const { width: W, height: H } = localBox;
  const sx = W / start.width;
  const sy = H / start.height;
  if (Math.abs(sx - sy) < 1e-9) {
    scaleContent(tx, start.id, sx);
    return;
  }
  for (const child of tx.store.getChildren(start.id)) {
    // Same place on the page: the frame's origin moved to (localBox.x, localBox.y).
    const x = child.x - localBox.x;
    const y = child.y - localBox.y;
    if (child.type !== 'image' || child.rotation !== 0 || child.flipX || child.flipY) {
      tx.update<NodeRecord>(child.id, { x, y });
      continue;
    }
    // The whole photo, placed so that the part at the old frame's center is at
    // the new frame's center.
    const full = imageFrame(child);
    let rx = W / 2 - (start.width / 2 - child.x - full.x);
    let ry = H / 2 - (start.height / 2 - child.y - full.y);
    let rw = full.width;
    let rh = full.height;
    const zoom = Math.max(1, W / rw, H / rh);
    if (zoom > 1) {
      rx = W / 2 + (rx - W / 2) * zoom;
      ry = H / 2 + (ry - H / 2) * zoom;
      rw *= zoom;
      rh *= zoom;
    }
    // Slide so the photo covers the frame edge to edge.
    rx = Math.min(0, Math.max(W - rw, rx));
    ry = Math.min(0, Math.max(H - rh, ry));
    tx.update<ImageNode>(child.id, {
      x: 0,
      y: 0,
      width: W,
      height: H,
      crop: { x: -rx / rw || 0, y: -ry / rh || 0, width: Math.min(1, W / rw), height: Math.min(1, H / rh) },
    });
  }
}
