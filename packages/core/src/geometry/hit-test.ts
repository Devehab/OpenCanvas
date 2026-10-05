/**
 * Geometric hit-testing (no pixels involved, so it is exact, fast and works
 * identically in the browser, in Node and in tests).
 */
import { type Box, boxContainsBox, boxIntersects } from '../math/box';
import { applyToPoint, invert, type Mat, multiply } from '../math/matrix';
import { distanceToSegment, type Vec } from '../math/vec';
import { type FrameNode, type Id, isContainer, type NodeRecord } from '../model/types';
import type { DocumentStore } from '../store/store';
import { getFrameClipPath, getNodeOutline } from './outline';
import { distanceToPath, pointInPath } from './path';
import { getLocalTransform, getPageBounds } from './transforms';

export interface HitTestOptions {
  /** Extra hit margin in page units (e.g. 4px / zoom). */
  tolerance?: number;
  /** Include hidden nodes (default false). */
  includeHidden?: boolean;
  /** Ids to ignore (e.g. the node being dragged). */
  exclude?: ReadonlySet<Id>;
}

/** Tests a point given in the node's LOCAL space against the node's own geometry (not children). */
export function hitTestLocal(node: NodeRecord, p: Vec, tolerance = 0): boolean {
  const { width: w, height: h } = node;
  switch (node.type) {
    case 'line': {
      const half = Math.max(node.stroke.width / 2, 1) + tolerance;
      return distanceToSegment(p, { x: 0, y: h / 2 }, { x: w, y: h / 2 }) <= half;
    }
    case 'shape': {
      const strokeHalf = node.stroke ? node.stroke.width / 2 : 0;
      if (p.x < -tolerance - strokeHalf || p.y < -tolerance - strokeHalf) return false;
      if (p.x > w + tolerance + strokeHalf || p.y > h + tolerance + strokeHalf) return false;
      if (!node.fill && !node.stroke) return true; // invisible shapes stay selectable by their box
      const outline = getNodeOutline(node)!;
      if (node.fill && pointInPath(outline, p)) return true;
      // Thin or tiny shapes: accept points near the outline.
      return distanceToPath(outline, p) <= strokeHalf + tolerance;
    }
    case 'group':
      return false;
    default:
      return p.x >= -tolerance && p.y >= -tolerance && p.x <= w + tolerance && p.y <= h + tolerance;
  }
}

function hitTestSubtree(
  store: DocumentStore,
  node: NodeRecord,
  parentToPageInverse: Mat,
  pagePoint: Vec,
  options: HitTestOptions,
  deep: boolean,
): NodeRecord | null {
  if ((!node.visible && !options.includeHidden) || options.exclude?.has(node.id)) return null;
  const tolerance = options.tolerance ?? 0;
  // page → local = inverse(local) · inverse(parentToPage)
  const localInverse = multiply(invert(getLocalTransform(node)), parentToPageInverse);
  const local = applyToPoint(localInverse, pagePoint);
  if (isContainer(node)) {
    if (node.type === 'frame' && node.clipContent) {
      const inside = pointInPath(getFrameClipPath(node), local) || hitTestLocal(node, local, tolerance);
      if (!inside) return null;
    }
    const children = store.getChildren(node.id);
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = hitTestSubtree(store, children[i]!, localInverse, pagePoint, options, deep);
      if (hit) return deep ? hit : node;
    }
    if (node.type === 'frame' && hitTestLocal(node, local, tolerance)) return node;
    return null;
  }
  return hitTestLocal(node, local, tolerance) ? node : null;
}

/**
 * Top-most node under a page point, among the children of `parentId` (a page or
 * container). With `deep: false` (default) a hit inside a group/frame returns
 * the container itself — the Canva/Figma "click selects the group" behaviour.
 */
export function getNodeAtPoint(
  store: DocumentStore,
  parentId: Id,
  pagePoint: Vec,
  options: HitTestOptions & { deep?: boolean } = {},
): NodeRecord | null {
  const parent = store.getNode(parentId);
  let parentInverse: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (parent) {
    // Build page → parent-local transform.
    const chain = [...store.getAncestors(parent.id)].reverse();
    let m: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    for (const a of chain) m = multiply(m, getLocalTransform(a));
    m = multiply(m, getLocalTransform(parent));
    parentInverse = invert(m);
  }
  const children = store.getChildren(parentId);
  for (let i = children.length - 1; i >= 0; i--) {
    const hit = hitTestSubtree(store, children[i]!, parentInverse, pagePoint, options, options.deep ?? false);
    if (hit) return hit;
  }
  return null;
}

/** All top-level nodes (children of `parentId`) whose subtree is hit, front to back. */
export function getNodesAtPoint(
  store: DocumentStore,
  parentId: Id,
  pagePoint: Vec,
  options: HitTestOptions = {},
): NodeRecord[] {
  const out: NodeRecord[] = [];
  const exclude = new Set(options.exclude ?? []);
  for (;;) {
    const hit = getNodeAtPoint(store, parentId, pagePoint, { ...options, exclude });
    if (!hit) break;
    out.push(hit);
    exclude.add(hit.id);
  }
  return out;
}

/**
 * Children of `parentId` selected by a marquee box (page space).
 * `intersect`: any overlap (Canva); `contain`: fully inside (Figma default).
 */
export function getNodesInBox(
  store: DocumentStore,
  parentId: Id,
  box: Box,
  mode: 'intersect' | 'contain' = 'intersect',
): NodeRecord[] {
  return store.getChildren(parentId).filter((node) => {
    if (!node.visible) return false;
    const bounds = getPageBounds(store, node);
    return mode === 'contain' ? boxContainsBox(box, bounds) : boxIntersects(box, bounds);
  });
}

function frameInSubtree(
  store: DocumentStore,
  node: NodeRecord,
  parentToPageInverse: Mat,
  pagePoint: Vec,
  exclude: ReadonlySet<Id>,
): FrameNode | null {
  if (!node.visible || exclude.has(node.id)) return null;
  if (node.type !== 'group' && node.type !== 'frame') return null;
  const localInverse = multiply(invert(getLocalTransform(node)), parentToPageInverse);
  const local = applyToPoint(localInverse, pagePoint);
  if (node.type === 'frame' && !pointInPath(getFrameClipPath(node), local)) return null;
  const children = store.getChildren(node.id);
  for (let i = children.length - 1; i >= 0; i--) {
    const nested = frameInSubtree(store, children[i]!, localInverse, pagePoint, exclude);
    if (nested) return nested;
  }
  return node.type === 'frame' && !node.locked ? node : null;
}

/**
 * The frame a dropped image would go into: the top-most, innermost unlocked
 * frame whose shape contains the page point, looking through groups (so photo
 * frames inside mockups and collages are found). Other elements covering the
 * frame do not block it.
 */
export function getFrameAtPoint(
  store: DocumentStore,
  parentId: Id,
  pagePoint: Vec,
  options: { exclude?: ReadonlySet<Id> } = {},
): FrameNode | null {
  const exclude = options.exclude ?? new Set<Id>();
  const parent = store.getNode(parentId);
  let parentInverse: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (parent) {
    const chain = [...store.getAncestors(parent.id)].reverse();
    let m: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    for (const a of chain) m = multiply(m, getLocalTransform(a));
    m = multiply(m, getLocalTransform(parent));
    parentInverse = invert(m);
  }
  const children = store.getChildren(parentId);
  for (let i = children.length - 1; i >= 0; i--) {
    const frame = frameInSubtree(store, children[i]!, parentInverse, pagePoint, exclude);
    if (frame) return frame;
  }
  return null;
}
