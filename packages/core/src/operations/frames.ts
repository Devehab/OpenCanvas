/**
 * Photo frames: placing images into frames (Canva-style drag & drop) and
 * taking them out again.
 */
import type { IdGenerator } from '../ids';
import { createNodeRecord } from '../model/factory';
import type { FrameNode, Id, ImageNode, NodeRecord } from '../model/types';
import type { Transaction } from '../store/store';
import { reparentNodes } from './group';
import { deleteNodes } from './nodes';
import { indicesAbove } from './order';
import { coverCrop } from './resize';

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
