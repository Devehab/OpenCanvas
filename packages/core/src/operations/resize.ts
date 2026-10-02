/**
 * Handle-based resize math (pure functions, used by the editor's resize gesture).
 */
import type { Box } from '../math/box';
import type { Crop, ImageNode } from '../model/types';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const isCornerHandle = (h: ResizeHandle): boolean => h.length === 2;

export interface ResizeOptions {
  keepAspect: boolean;
  fromCenter: boolean;
  minWidth: number;
  minHeight: number;
}

/**
 * New box in the node's ORIGINAL local space after dragging `handle` by
 * `delta` (also in local space). The node never flips; sizes clamp at the minimum.
 */
export function resizeLocalBox(
  width: number,
  height: number,
  handle: ResizeHandle,
  delta: { x: number; y: number },
  options: ResizeOptions,
): Box {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.startsWith('n');
  const south = handle.startsWith('s');
  let x0 = 0;
  let y0 = 0;
  let x1 = width;
  let y1 = height;
  if (west) x0 += delta.x;
  if (east) x1 += delta.x;
  if (north) y0 += delta.y;
  if (south) y1 += delta.y;
  if (options.fromCenter) {
    if (west) x1 = width - x0;
    if (east) x0 = width - x1;
    if (north) y1 = height - y0;
    if (south) y0 = height - y1;
  }
  let w = Math.max(options.minWidth, x1 - x0);
  let h = Math.max(options.minHeight, y1 - y0);

  if (options.keepAspect && width > 0 && height > 0) {
    const aspect = width / height;
    if (isCornerHandle(handle)) {
      // Follow whichever axis moved proportionally more.
      const s = Math.max(w / width, h / height);
      w = Math.max(options.minWidth, width * s);
      h = Math.max(options.minHeight, w / aspect);
      w = h * aspect;
    } else if (east || west) {
      h = Math.max(options.minHeight, w / aspect);
      w = h * aspect;
    } else {
      w = Math.max(options.minWidth, h * aspect);
      h = w / aspect;
    }
  }

  // Anchor the box: opposite edge (or center) stays fixed.
  let x: number;
  let y: number;
  if (options.fromCenter) {
    x = width / 2 - w / 2;
    y = height / 2 - h / 2;
  } else {
    if (west) x = width - w;
    else if (east) x = 0;
    else x = width / 2 - w / 2;
    if (north) y = height - h;
    else if (south) y = 0;
    else y = height / 2 - h / 2;
  }
  return { x, y, width: w, height: h };
}

/**
 * Side-handle resize of an image keeps the image scale and reveals/hides parts
 * of it by adjusting the crop (Canva behaviour). The box cannot grow past the
 * image edges. Returns the clamped local box and the new crop.
 */
export function resizeImageCrop(
  start: Pick<ImageNode, 'width' | 'height' | 'crop'>,
  localBox: Box,
): { box: Box; crop: Crop } {
  const { crop } = start;
  const kx = start.width / crop.width; // box px per normalized image unit
  const ky = start.height / crop.height;
  let cx0 = crop.x + localBox.x / kx;
  let cx1 = crop.x + (localBox.x + localBox.width) / kx;
  let cy0 = crop.y + localBox.y / ky;
  let cy1 = crop.y + (localBox.y + localBox.height) / ky;
  cx0 = Math.max(0, cx0);
  cy0 = Math.max(0, cy0);
  cx1 = Math.min(1, cx1);
  cy1 = Math.min(1, cy1);
  const minW = 1 / kx;
  const minH = 1 / ky;
  if (cx1 - cx0 < minW) cx1 = Math.min(1, cx0 + minW);
  if (cy1 - cy0 < minH) cy1 = Math.min(1, cy0 + minH);
  const box = {
    x: (cx0 - crop.x) * kx,
    y: (cy0 - crop.y) * ky,
    width: (cx1 - cx0) * kx,
    height: (cy1 - cy0) * ky,
  };
  return { box, crop: { x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0 } };
}

/** Center crop that makes an image of `imageW`×`imageH` cover a `boxW`×`boxH` box without distortion. */
export function coverCrop(imageW: number, imageH: number, boxW: number, boxH: number): Crop {
  const imageAspect = imageW / imageH;
  const boxAspect = boxW / boxH;
  if (!Number.isFinite(imageAspect) || !Number.isFinite(boxAspect) || boxAspect <= 0)
    return { x: 0, y: 0, width: 1, height: 1 };
  if (imageAspect > boxAspect) {
    const width = boxAspect / imageAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imageAspect / boxAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Size that fits an image inside `maxW`×`maxH`, preserving aspect ratio. */
export function fitSize(
  width: number,
  height: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const s = Math.min(maxW / width, maxH / height, 1);
  return { width: width * s, height: height * s };
}
