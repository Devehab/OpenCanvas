import { describe, expect, it } from 'vitest';
import { imageFrame, panCrop, resizeImageCrop, scaleCropImage } from '../src';

// A 400×200 box showing the middle half of a photo horizontally.
const node = { width: 400, height: 200, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } };
const r = (v: number) => Math.round(v * 1e6) / 1e6;
const round = (c: object) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r(v as number)]));

describe('crop mode', () => {
  it('describes the whole photo around the crop box', () => {
    expect(imageFrame(node)).toEqual({ x: -200, y: 0, width: 800, height: 200 });
  });

  it('pans the photo under the box and stops at its edges', () => {
    expect(round(panCrop(node, 100, 0))).toEqual({ x: 0.125, y: 0, width: 0.5, height: 1 });
    expect(panCrop(node, 1000, 0).x).toBe(0);
    expect(panCrop(node, -1000, 0).x).toBe(0.5);
    expect(panCrop(node, 0, 50).y).toBe(0); // no room vertically
  });

  it('scales the photo from a corner, keeping the opposite corner and covering the box', () => {
    // Drag the bottom-right corner (600, 200) to (1000, 300): 1.5×, anchored at (-200, 0).
    const bigger = scaleCropImage(node, 'se', { x: 1000, y: 300 });
    const frame = imageFrame({ ...node, crop: bigger });
    expect(round(frame as never)).toEqual({ x: -200, y: 0, width: 1200, height: 300 });
    // Shrinking below cover size stops at the minimum.
    const smallest = scaleCropImage(node, 'se', { x: 0, y: 0 });
    const f2 = imageFrame({ ...node, crop: smallest });
    expect(f2.x + f2.width).toBeGreaterThanOrEqual(400 - 1e-9);
    expect(f2.y + f2.height).toBeGreaterThanOrEqual(200 - 1e-9);
  });

  it('resizing the crop box stays inside the photo', () => {
    const { box, crop } = resizeImageCrop(node, { x: -500, y: 0, width: 900, height: 200 });
    expect(box.x).toBe(-200);
    expect(round(crop)).toEqual({ x: 0, y: 0, width: 0.75, height: 1 });
  });
});
