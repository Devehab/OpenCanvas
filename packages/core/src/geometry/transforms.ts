/**
 * Node transforms and bounds.
 *
 * Local space of a node: (0,0)–(width,height). Its transform into the parent's
 * space is  T(center) · R(rotation) · S(flip) · T(-size/2)  — rotation and flips
 * happen around the box center, so flipping or rotating never moves a node.
 */

import { degToRad, normalizeDegrees, radToDeg } from '../math/angle';
import { type Box, boxFromPoints, boxUnion } from '../math/box';
import { applyToPoint, determinant, identity, invert, type Mat, multiply } from '../math/matrix';
import type { Vec } from '../math/vec';
import type { Id, NodeRecord } from '../model/types';
import type { DocumentStore } from '../store/store';

export interface TransformProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/** Local → parent transform of a node. */
export function getLocalTransform(n: TransformProps): Mat {
  const hw = n.width / 2;
  const hh = n.height / 2;
  const rad = degToRad(n.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const fx = n.flipX ? -1 : 1;
  const fy = n.flipY ? -1 : 1;
  // T(cx,cy) · R · S(fx,fy) · T(-hw,-hh)
  const a = cos * fx;
  const b = sin * fx;
  const c = -sin * fy;
  const d = cos * fy;
  return { a, b, c, d, e: n.x + hw - a * hw - c * hh, f: n.y + hh - b * hw - d * hh };
}

/** Transform from the node's parent space to page space. */
export function getParentPageTransform(store: DocumentStore, node: NodeRecord): Mat {
  const ancestors = store.getAncestors(node.id);
  let m = identity();
  for (let i = ancestors.length - 1; i >= 0; i--) m = multiply(m, getLocalTransform(ancestors[i]!));
  return m;
}

/** Local → page transform of a node. */
export function getPageTransform(store: DocumentStore, node: NodeRecord): Mat {
  return multiply(getParentPageTransform(store, node), getLocalTransform(node));
}

export function getLocalCorners(n: TransformProps): [Vec, Vec, Vec, Vec] {
  const m = getLocalTransform(n);
  return [
    applyToPoint(m, { x: 0, y: 0 }),
    applyToPoint(m, { x: n.width, y: 0 }),
    applyToPoint(m, { x: n.width, y: n.height }),
    applyToPoint(m, { x: 0, y: n.height }),
  ];
}

/** Corners of the node box in page space (top-left, top-right, bottom-right, bottom-left in local terms). */
export function getPageCorners(store: DocumentStore, node: NodeRecord): [Vec, Vec, Vec, Vec] {
  const m = getPageTransform(store, node);
  return [
    applyToPoint(m, { x: 0, y: 0 }),
    applyToPoint(m, { x: node.width, y: 0 }),
    applyToPoint(m, { x: node.width, y: node.height }),
    applyToPoint(m, { x: 0, y: node.height }),
  ];
}

/** Axis-aligned bounds of the node box in its parent's space. */
export function getParentBounds(n: TransformProps): Box {
  return boxFromPoints(getLocalCorners(n));
}

/** Axis-aligned bounds of the node box in page space. */
export function getPageBounds(store: DocumentStore, node: NodeRecord): Box {
  return boxFromPoints(getPageCorners(store, node));
}

/** Union of page bounds of several nodes. */
export function getNodesPageBounds(store: DocumentStore, ids: readonly Id[]): Box | null {
  const boxes: Box[] = [];
  for (const id of ids) {
    const node = store.getNode(id);
    if (node) boxes.push(getPageBounds(store, node));
  }
  return boxUnion(boxes);
}

/** Center of the node box in page space. */
export function getPageCenter(store: DocumentStore, node: NodeRecord): Vec {
  return applyToPoint(getPageTransform(store, node), { x: node.width / 2, y: node.height / 2 });
}

/** Visual rotation of the node in page space (degrees), accounting for ancestor rotations and flips. */
export function getPageRotation(store: DocumentStore, node: NodeRecord): number {
  const m = getPageTransform(store, node);
  // Direction of the local x axis; if the node is flipped an odd number of times, x is mirrored.
  const flipped = determinant(m) < 0;
  const ax = flipped ? -m.a : m.a;
  const ay = flipped ? -m.b : m.b;
  return normalizeDegrees(radToDeg(Math.atan2(ay, ax)));
}

/** Converts a page-space point into the node's local space. */
export function pageToLocal(store: DocumentStore, node: NodeRecord, p: Vec): Vec {
  return applyToPoint(invert(getPageTransform(store, node)), p);
}

/** Converts a page-space point into the given parent's (page or container) coordinate space. */
export function pageToParentSpace(store: DocumentStore, parentId: Id, p: Vec): Vec {
  const parent = store.getNode(parentId);
  if (!parent) return p;
  return applyToPoint(invert(getPageTransform(store, parent)), p);
}

/** Transform from a parent (page or container) space into page space. */
export function getSpaceToPageTransform(store: DocumentStore, parentId: Id): Mat {
  const parent = store.getNode(parentId);
  return parent ? getPageTransform(store, parent) : identity();
}

/**
 * Decomposes a local transform back into node transform properties for a box
 * of `width`×`height`. Transforms here never contain scale or skew, so the
 * decomposition is exact. One flip flag is kept fixed (`keep`) and the other is
 * derived from the determinant's sign.
 */
export function decomposeTransform(
  m: Mat,
  width: number,
  height: number,
  keep: { axis: 'x' | 'y'; value: boolean },
): { x: number; y: number; rotation: number; flipX: boolean; flipY: boolean } {
  const det = determinant(m);
  const mirrored = det < 0;
  let flipX: boolean;
  let flipY: boolean;
  if (keep.axis === 'y') {
    flipY = keep.value;
    flipX = mirrored !== flipY;
  } else {
    flipX = keep.value;
    flipY = mirrored !== flipX;
  }
  // R = L · S(fx, fy)
  const fx = flipX ? -1 : 1;
  const ra = m.a * fx;
  const rb = m.b * fx;
  const rotation = normalizeDegrees(radToDeg(Math.atan2(rb, ra)));
  const c = applyToPoint(m, { x: width / 2, y: height / 2 });
  const clean = (n: number) => (Object.is(n, -0) ? 0 : n);
  return { x: clean(c.x - width / 2), y: clean(c.y - height / 2), rotation, flipX, flipY };
}

/**
 * Position (`x`, `y`) that places a box of the given size and orientation so
 * its center lands on `center` (in the parent's space).
 */
export function positionForCenter(center: Vec, width: number, height: number): { x: number; y: number } {
  return { x: center.x - width / 2, y: center.y - height / 2 };
}
