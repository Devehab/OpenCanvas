/**
 * Geometric operations: translate, resize, scale, rotate, flip, align, distribute.
 *
 * Gesture-driven operations take the node snapshot from the start of the
 * gesture plus the total delta, instead of applying small incremental deltas.
 * That keeps results exact (no accumulated floating-point drift) and makes
 * every intermediate frame reproducible.
 */

import {
  decomposeTransform,
  getLocalTransform,
  getPageBounds,
  getPageTransform,
  getParentPageTransform,
} from '../geometry/transforms';
import { degToRad, normalizeDegrees } from '../math/angle';
import { type Box, boxCenter, boxFromPoints, boxUnion } from '../math/box';
import { applyToPoint, applyToVector, determinant, invert, type Mat, multiply } from '../math/matrix';
import { rotateAround, type Vec } from '../math/vec';
import { mapTextStyles } from '../model/text-content';
import type { Id, NodePatch, NodeRecord, TextNode } from '../model/types';
import type { DocumentStore, Transaction } from '../store/store';
import { editableIds, topLevelIds, updateNodes } from './nodes';

const clean = (n: number) => (Object.is(n, -0) ? 0 : n);

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------

/** Moves nodes by a page-space delta. Locked nodes and nodes whose ancestor is also moved are skipped. */
export function translateNodes(tx: Transaction, ids: readonly Id[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const store = tx.store;
  for (const id of editableIds(store, topLevelIds(store, ids))) {
    const node = store.getNode(id)!;
    const inv = invert(getParentPageTransform(store, node));
    const d = applyToVector(inv, { x: dx, y: dy });
    tx.update<NodeRecord>(id, { x: clean(node.x + d.x), y: clean(node.y + d.y) });
  }
}

/** Re-applies a gesture: positions each node at its `initial` position plus a page-space delta. */
export function translateFrom(tx: Transaction, initial: readonly NodeRecord[], dx: number, dy: number): void {
  const store = tx.store;
  for (const start of initial) {
    const node = store.getNode(start.id);
    if (!node || node.locked) continue;
    const inv = invert(getParentPageTransform(store, node));
    const d = applyToVector(inv, { x: dx, y: dy });
    tx.update<NodeRecord>(start.id, { x: clean(start.x + d.x), y: clean(start.y + d.y) });
  }
}

// ---------------------------------------------------------------------------
// Box placement helpers
// ---------------------------------------------------------------------------

/**
 * Position for a node resized to `width`×`height` so that the point at
 * normalized `anchor` (0–1 in the box) stays where it was in parent space.
 */
export function positionForAnchoredResize(
  node: Pick<NodeRecord, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX' | 'flipY'>,
  width: number,
  height: number,
  anchor: Vec,
): { x: number; y: number } {
  const m = getLocalTransform(node);
  const fixed = applyToPoint(m, { x: anchor.x * node.width, y: anchor.y * node.height });
  // Linear part of the (unchanged) rotation + flip.
  const lin: Mat = { ...m, e: 0, f: 0 };
  const offset = applyToVector(lin, { x: (anchor.x - 0.5) * width, y: (anchor.y - 0.5) * height });
  const cx = fixed.x - offset.x;
  const cy = fixed.y - offset.y;
  return { x: clean(cx - width / 2), y: clean(cy - height / 2) };
}

/**
 * Places a node so that its box equals `localBox`, expressed in the LOCAL
 * coordinates of `start` (the node as it was when the gesture began).
 * Rotation and flips are preserved.
 */
export function boxFromLocal(
  start: Pick<NodeRecord, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX' | 'flipY'>,
  localBox: Box,
): { x: number; y: number; width: number; height: number } {
  const m = getLocalTransform(start);
  const center = applyToPoint(m, { x: localBox.x + localBox.width / 2, y: localBox.y + localBox.height / 2 });
  return {
    x: clean(center.x - localBox.width / 2),
    y: clean(center.y - localBox.height / 2),
    width: localBox.width,
    height: localBox.height,
  };
}

// ---------------------------------------------------------------------------
// Scale (uniform) — groups, multi-selection, text corner handles
// ---------------------------------------------------------------------------

/** Properties that scale with an element when it is scaled as a whole. */
export function scaledProps(node: NodeRecord, s: number): NodePatch {
  const patch: Record<string, unknown> = { blur: node.blur * s };
  if (node.shadow) {
    patch.shadow = {
      ...node.shadow,
      offsetX: node.shadow.offsetX * s,
      offsetY: node.shadow.offsetY * s,
      blur: node.shadow.blur * s,
    };
  }
  switch (node.type) {
    case 'shape':
    case 'frame':
      patch.cornerRadius = node.cornerRadius * s;
      if (node.stroke) patch.stroke = { ...node.stroke, width: node.stroke.width * s };
      break;
    case 'image':
      patch.cornerRadius = node.cornerRadius * s;
      if (node.stroke) patch.stroke = { ...node.stroke, width: node.stroke.width * s };
      break;
    case 'path':
      if (node.stroke) patch.stroke = { ...node.stroke, width: node.stroke.width * s };
      break;
    case 'line':
      patch.stroke = { ...node.stroke, width: node.stroke.width * s };
      break;
    case 'text': {
      const scaled = mapTextStyles(node, (style) =>
        style.fontSize === undefined
          ? style
          : { ...style, fontSize: Math.max(1, Math.min(4000, style.fontSize * s)) },
      );
      patch.style = scaled.style;
      patch.content = scaled.content;
      patch.paragraphSpacing = node.paragraphSpacing * s;
      if (node.effect) {
        const e = { ...node.effect } as Record<string, number | string>;
        for (const k of ['width', 'padding', 'radius', 'offsetX', 'offsetY'] as const) {
          if (typeof e[k] === 'number') e[k] = (e[k] as number) * s;
        }
        patch.effect = e;
      }
      break;
    }
  }
  return patch as NodePatch;
}

/** Scales the content of a container (children positions and sizes) by `s` in its local space. */
function scaleChildren(tx: Transaction, containerId: Id, s: number): void {
  for (const child of tx.store.getChildren(containerId)) {
    tx.update<NodeRecord>(child.id, {
      ...(scaledProps(child, s) as Partial<NodeRecord>),
      x: child.x * s,
      y: child.y * s,
      width: child.width * s,
      height: child.height * s,
    });
    if (child.type === 'group' || child.type === 'frame') scaleChildren(tx, child.id, s);
  }
}

/**
 * Uniformly scales nodes (from their gesture-start snapshots) by `s` around a
 * page-space `anchor`. Used for corner-dragging groups and multi-selections.
 */
export function scaleNodesFrom(
  tx: Transaction,
  initial: readonly NodeRecord[],
  s: number,
  anchor: Vec,
  restoreSubtree: (id: Id) => void,
): void {
  const store = tx.store;
  const scale = Math.max(1e-4, s);
  for (const start of initial) {
    const node = store.getNode(start.id);
    if (!node || node.locked) continue;
    // Restore children to their gesture-start state before scaling again (keeps scaling exact).
    restoreSubtree(start.id);
    const parentToPage = getParentPageTransform(store, start);
    const centerPage = applyToPoint(parentToPage, {
      x: start.x + start.width / 2,
      y: start.y + start.height / 2,
    });
    const newCenterPage = {
      x: anchor.x + (centerPage.x - anchor.x) * scale,
      y: anchor.y + (centerPage.y - anchor.y) * scale,
    };
    const newCenter = applyToPoint(invert(parentToPage), newCenterPage);
    const width = start.width * scale;
    const height = start.height * scale;
    tx.put({
      ...start,
      ...(scaledProps(start, scale) as Partial<NodeRecord>),
      x: clean(newCenter.x - width / 2),
      y: clean(newCenter.y - height / 2),
      width,
      height,
    } as NodeRecord);
    if (start.type === 'group' || start.type === 'frame') scaleChildren(tx, start.id, scale);
  }
}

// ---------------------------------------------------------------------------
// Rotate & flip
// ---------------------------------------------------------------------------

/** Rotates nodes (from gesture-start snapshots) by `deltaDeg` around a page-space pivot. */
export function rotateNodesFrom(
  tx: Transaction,
  initial: readonly NodeRecord[],
  deltaDeg: number,
  pivot: Vec,
): void {
  const store = tx.store;
  const rad = degToRad(deltaDeg);
  for (const start of initial) {
    const node = store.getNode(start.id);
    if (!node || node.locked) continue;
    const parentToPage = getParentPageTransform(store, start);
    const sign = determinant(parentToPage) < 0 ? -1 : 1;
    const centerPage = applyToPoint(parentToPage, {
      x: start.x + start.width / 2,
      y: start.y + start.height / 2,
    });
    const rotated = rotateAround(centerPage, rad, pivot);
    const center = applyToPoint(invert(parentToPage), rotated);
    tx.update<NodeRecord>(start.id, {
      x: clean(center.x - start.width / 2),
      y: clean(center.y - start.height / 2),
      rotation: normalizeDegrees(start.rotation + sign * deltaDeg),
    });
  }
}

/** Sets the absolute rotation of nodes around their own centers. */
export function setRotation(tx: Transaction, ids: readonly Id[], rotation: number): void {
  for (const id of editableIds(tx.store, ids))
    tx.update<NodeRecord>(id, { rotation: normalizeDegrees(rotation) });
}

/**
 * Flips nodes. A single node flips in place; several nodes are mirrored as a
 * whole across the center of their combined bounds (page space).
 */
export function flipNodes(tx: Transaction, ids: readonly Id[], axis: 'horizontal' | 'vertical'): void {
  const store = tx.store;
  const targets = editableIds(store, topLevelIds(store, ids));
  if (targets.length === 0) return;
  const mid = boxCenter(boxUnion(targets.map((id) => getPageBounds(store, store.getNode(id)!)))!);
  for (const id of targets) {
    const node = store.getNode(id)!;
    const parentToPage = getParentPageTransform(store, node);
    const pivot =
      targets.length === 1
        ? applyToPoint(parentToPage, { x: node.x + node.width / 2, y: node.y + node.height / 2 })
        : mid;
    const mirror: Mat =
      axis === 'horizontal'
        ? { a: -1, b: 0, c: 0, d: 1, e: 2 * pivot.x, f: 0 }
        : { a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * pivot.y };
    const local = multiply(
      invert(parentToPage),
      multiply(mirror, multiply(parentToPage, getLocalTransform(node))),
    );
    const keep =
      axis === 'horizontal'
        ? { axis: 'y' as const, value: node.flipY }
        : { axis: 'x' as const, value: node.flipX };
    tx.update<NodeRecord>(id, decomposeTransform(local, node.width, node.height, keep));
  }
}

// ---------------------------------------------------------------------------
// Align & distribute
// ---------------------------------------------------------------------------

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Aligns nodes' page bounds to `target` (selection bounds or the page). */
export function alignNodes(tx: Transaction, ids: readonly Id[], alignment: Alignment, target: Box): void {
  const store = tx.store;
  for (const id of editableIds(store, topLevelIds(store, ids))) {
    const b = getPageBounds(store, store.getNode(id)!);
    let dx = 0;
    let dy = 0;
    switch (alignment) {
      case 'left':
        dx = target.x - b.x;
        break;
      case 'center':
        dx = target.x + target.width / 2 - (b.x + b.width / 2);
        break;
      case 'right':
        dx = target.x + target.width - (b.x + b.width);
        break;
      case 'top':
        dy = target.y - b.y;
        break;
      case 'middle':
        dy = target.y + target.height / 2 - (b.y + b.height / 2);
        break;
      case 'bottom':
        dy = target.y + target.height - (b.y + b.height);
        break;
    }
    translateNodes(tx, [id], dx, dy);
  }
}

/** Spaces nodes so the gaps between their page bounds are equal (first and last stay put). */
export function distributeNodes(tx: Transaction, ids: readonly Id[], axis: 'horizontal' | 'vertical'): void {
  const store = tx.store;
  const items = editableIds(store, topLevelIds(store, ids)).map((id) => ({
    id,
    b: getPageBounds(store, store.getNode(id)!),
  }));
  if (items.length < 3) return;
  const h = axis === 'horizontal';
  items.sort((a, b) => (h ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0]!.b;
  const last = items[items.length - 1]!.b;
  const span = h ? last.x + last.width - first.x : last.y + last.height - first.y;
  const total = items.reduce((sum, it) => sum + (h ? it.b.width : it.b.height), 0);
  const gap = (span - total) / (items.length - 1);
  let cursor = h ? first.x : first.y;
  for (const it of items) {
    const pos = h ? it.b.x : it.b.y;
    const delta = cursor - pos;
    if (Math.abs(delta) > 1e-9) translateNodes(tx, [it.id], h ? delta : 0, h ? 0 : delta);
    cursor += (h ? it.b.width : it.b.height) + gap;
  }
}

/** Selection bounds in page space. */
export function getSelectionPageBounds(store: DocumentStore, ids: readonly Id[]): Box | null {
  const boxes = ids
    .map((id) => store.getNode(id))
    .filter((n): n is NodeRecord => !!n)
    .map((n) => getPageBounds(store, n));
  return boxUnion(boxes);
}

/**
 * Sets a node's size from the inspector, keeping its top-left corner (in local
 * terms) fixed; with `keepAspect`, the other dimension follows proportionally.
 */
export function setNodeSize(
  tx: Transaction,
  id: Id,
  size: { width?: number; height?: number },
  options: { keepAspect?: boolean } = {},
): void {
  const node = tx.store.getNode(id);
  if (!node || node.locked) return;
  let width = Math.max(1, size.width ?? node.width);
  let height = Math.max(node.type === 'line' ? 0 : 1, size.height ?? node.height);
  if (options.keepAspect && node.width > 0 && node.height > 0) {
    if (size.width !== undefined && size.height === undefined) height = (width * node.height) / node.width;
    if (size.height !== undefined && size.width === undefined) width = (height * node.width) / node.height;
  }
  const s = width / node.width;
  if (node.type === 'group' && Math.abs(width / node.width - height / node.height) < 1e-9) {
    const anchorPage = applyToPoint(getPageTransform(tx.store, node), { x: 0, y: 0 });
    scaleNodesFrom(tx, [node], s, anchorPage, () => {});
    return;
  }
  const pos = positionForAnchoredResize(node, width, height, { x: 0, y: 0 });
  const patch: NodePatch = { ...pos, width, height };
  if (node.type === 'text' && size.width !== undefined && node.sizing === 'auto-width') {
    (patch as Partial<TextNode>).sizing = 'auto-height';
  }
  updateNodes(tx, [id], patch);
  if (node.type === 'group' || node.type === 'frame') {
    // Non-uniform group resize: scale children's geometry per axis (unrotated children stay exact).
    const sx = width / node.width;
    const sy = height / node.height;
    if (node.type === 'group') scaleChildrenNonUniform(tx, id, sx, sy);
  }
}

function scaleChildrenNonUniform(tx: Transaction, containerId: Id, sx: number, sy: number): void {
  for (const child of tx.store.getChildren(containerId)) {
    tx.update<NodeRecord>(child.id, {
      x: child.x * sx,
      y: child.y * sy,
      width: child.width * sx,
      height: child.height * sy,
    });
    if (child.type === 'group') scaleChildrenNonUniform(tx, child.id, sx, sy);
  }
}

/** Corners of a page-space box rotated around its center — helper for selection outlines. */
export function rotatedBoxCorners(b: Box, rotationDeg: number): Vec[] {
  const c = boxCenter(b);
  const rad = degToRad(rotationDeg);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotateAround(p, rad, c));
}

export { boxFromPoints };
