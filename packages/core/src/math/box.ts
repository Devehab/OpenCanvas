import type { Vec } from './vec';

/** Axis-aligned rectangle. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

export function boxFromPoints(points: readonly Vec[]): Box {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boxUnion(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const boxCenter = (b: Box): Vec => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
export const boxRight = (b: Box): number => b.x + b.width;
export const boxBottom = (b: Box): number => b.y + b.height;

/** Corners in clockwise order starting top-left. */
export function boxCorners(b: Box): [Vec, Vec, Vec, Vec] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
}

export function boxContainsPoint(b: Box, p: Vec, tolerance = 0): boolean {
  return (
    p.x >= b.x - tolerance &&
    p.x <= b.x + b.width + tolerance &&
    p.y >= b.y - tolerance &&
    p.y <= b.y + b.height + tolerance
  );
}

export function boxIntersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function boxContainsBox(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function boxExpand(b: Box, by: number): Box {
  return { x: b.x - by, y: b.y - by, width: b.width + by * 2, height: b.height + by * 2 };
}

export function boxEquals(a: Box, b: Box, epsilon = 1e-9): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}

/** Normalizes a box with negative width/height (e.g. a marquee dragged up-left). */
export function boxNormalize(b: Box): Box {
  return {
    x: b.width < 0 ? b.x + b.width : b.x,
    y: b.height < 0 ? b.y + b.height : b.y,
    width: Math.abs(b.width),
    height: Math.abs(b.height),
  };
}
