/**
 * Crop mode math (Canva-style "double-click to crop"). Everything is in the
 * image node's local space: the crop box is (0, 0, width, height) and the
 * whole photo is the larger "image frame" that the crop box looks into.
 */
import type { Box } from '../math/box';
import type { Crop, ImageNode } from '../model/types';

type CropStart = Pick<ImageNode, 'width' | 'height' | 'crop'>;

/** The whole photo in local coordinates. */
export function imageFrame(node: CropStart): Box {
  const width = node.width / node.crop.width;
  const height = node.height / node.crop.height;
  // `|| 0` avoids -0.
  return { x: -node.crop.x * width || 0, y: -node.crop.y * height || 0, width, height };
}

const clamp01 = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));

/** Moves the photo under a fixed crop box by (dx, dy) local units; it always covers the box. */
export function panCrop(node: CropStart, dx: number, dy: number): Crop {
  const frame = imageFrame(node);
  const { crop } = node;
  return {
    x: clamp01(crop.x - dx / frame.width, 1 - crop.width),
    y: clamp01(crop.y - dy / frame.height, 1 - crop.height),
    width: crop.width,
    height: crop.height,
  };
}

export type ImageCorner = 'nw' | 'ne' | 'se' | 'sw';

/**
 * Scales the photo by dragging one of its corners to `point` (local), keeping
 * the opposite corner fixed and the aspect ratio. The photo never gets smaller
 * than needed to cover the crop box. The crop box itself does not move.
 */
export function scaleCropImage(node: CropStart, corner: ImageCorner, point: { x: number; y: number }): Crop {
  const frame = imageFrame(node);
  const left = corner === 'nw' || corner === 'sw';
  const top = corner === 'nw' || corner === 'ne';
  // Opposite (anchored) corner.
  const ax = left ? frame.x + frame.width : frame.x;
  const ay = top ? frame.y + frame.height : frame.y;
  let s = Math.max(Math.abs(point.x - ax) / frame.width, Math.abs(point.y - ay) / frame.height);
  // Minimum scale so the photo still covers [0, width] × [0, height].
  const needX = left ? ax / frame.width : (node.width - ax) / frame.width;
  const needY = top ? ay / frame.height : (node.height - ay) / frame.height;
  s = Math.max(s, needX, needY, 1e-6);
  const w = frame.width * s;
  const h = frame.height * s;
  const x = left ? ax - w : ax;
  const y = top ? ay - h : ay;
  return { x: -x / w || 0, y: -y / h || 0, width: node.width / w, height: node.height / h };
}

/** True if the crop shows the whole photo. */
export function isUncropped(crop: Crop): boolean {
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
}
