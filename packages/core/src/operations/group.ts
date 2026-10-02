/**
 * Grouping, ungrouping and group-bounds maintenance.
 *
 * A group is a transform container: children live in the group's local
 * coordinate space. The group's box always equals the bounds of its children;
 * {@link normalizeGroupsFinalizer} restores that invariant automatically at the
 * end of every transaction that touches a group's subtree.
 */
import { compareOrder, generateNKeysBetween } from '../fractional-index';
import {
  decomposeTransform,
  getLocalCorners,
  getLocalTransform,
  getPageTransform,
} from '../geometry/transforms';
import type { IdGenerator } from '../ids';
import { type Box, boxFromPoints, boxUnion } from '../math/box';
import { applyToPoint, invert, multiply } from '../math/matrix';
import { createNodeRecord } from '../model/factory';
import type { GroupNode, Id, NodeRecord } from '../model/types';
import type { DocumentStore, Transaction, TransactionFinalizer } from '../store/store';
import { assertValidParent, topLevelIds } from './nodes';
import { indicesAbove, safeKeysBetween } from './order';

/** Bounds of a container's children in the container's local space. */
export function childrenBounds(store: DocumentStore, containerId: Id): Box | null {
  const boxes = store.getChildren(containerId).map((child) => boxFromPoints(getLocalCorners(child)));
  return boxUnion(boxes);
}

/**
 * Re-fits a group's box to its children without moving anything visually.
 * Deletes the group if it has no children left.
 */
export function normalizeGroup(tx: Transaction, groupId: Id): void {
  const store = tx.store;
  const group = store.getNode(groupId);
  if (!group || group.type !== 'group') return;
  const bounds = childrenBounds(store, groupId);
  if (!bounds) {
    tx.remove(groupId);
    return;
  }
  const eps = 1e-9;
  if (
    Math.abs(bounds.x) < eps &&
    Math.abs(bounds.y) < eps &&
    Math.abs(bounds.width - group.width) < eps &&
    Math.abs(bounds.height - group.height) < eps
  ) {
    return;
  }
  // New center in the parent's space, so the children stay where they are.
  const m = getLocalTransform(group);
  const c = applyToPoint(m, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  tx.update<GroupNode>(groupId, {
    x: c.x - bounds.width / 2,
    y: c.y - bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
  });
  if (Math.abs(bounds.x) >= eps || Math.abs(bounds.y) >= eps) {
    for (const child of store.getChildren(groupId)) {
      tx.update<NodeRecord>(child.id, { x: child.x - bounds.x, y: child.y - bounds.y });
    }
  }
}

/** Transaction finalizer that keeps every affected group's bounds equal to its children's bounds. */
export const normalizeGroupsFinalizer: TransactionFinalizer = (tx, touched) => {
  const store = tx.store;
  const groups = new Set<Id>();
  const collect = (id: Id | undefined) => {
    let current = id ? store.getNode(id) : undefined;
    let guard = 0;
    while (current && guard++ < 64) {
      if (current.type === 'group') groups.add(current.id);
      current = store.getNode(current.parentId);
    }
  };
  for (const id of touched) {
    const now = store.getNode(id);
    if (now) collect(now.type === 'group' ? now.id : now.parentId);
    const before = tx.getOriginal(id);
    if (before?.typeName === 'node') collect(before.parentId);
  }
  if (groups.size === 0) return;
  // Deepest groups first so parents see their children's final bounds.
  const ordered = [...groups].sort((a, b) => store.getAncestors(b).length - store.getAncestors(a).length);
  for (const id of ordered) normalizeGroup(tx, id);
};

/**
 * Groups nodes. All nodes move into a new group placed where the front-most
 * node was; visual positions are preserved even across different parents.
 */
export function groupNodes(tx: Transaction, ids: readonly Id[], createId: IdGenerator): Id | null {
  const store = tx.store;
  const roots = topLevelIds(store, ids)
    .map((id) => store.getNode(id)!)
    .filter((n) => !n.locked);
  if (roots.length < 2) return null;
  // Order by page traversal so relative stacking survives.
  const pageId = store.getPageIdOf(roots[0]!.id);
  if (!pageId || roots.some((n) => store.getPageIdOf(n.id) !== pageId)) return null;
  const order = store.getDescendantIds(pageId);
  roots.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const front = roots[roots.length - 1]!;
  const parentId = front.parentId;
  assertValidParent(store, parentId);
  const parentNode = store.getNode(parentId);
  const pageToParent = parentNode ? invert(getPageTransform(store, parentNode)) : null;

  // Bounds of all nodes in the target parent's space.
  const cornersInParent = roots.flatMap((node) => {
    const m = getPageTransform(store, node);
    const corners = [
      { x: 0, y: 0 },
      { x: node.width, y: 0 },
      { x: node.width, y: node.height },
      { x: 0, y: node.height },
    ].map((p) => applyToPoint(m, p));
    return pageToParent ? corners.map((p) => applyToPoint(pageToParent, p)) : corners;
  });
  const bounds = boxFromPoints(cornersInParent);

  const [groupIndex] = indicesAbove(store, parentId, front.id, 1);
  const group = tx.put(
    createNodeRecord('group', {
      id: createId('node'),
      parentId,
      index: groupIndex!,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }),
  );
  const groupInverse = invert(
    multiply(
      pageToParent ? getPageTransform(store, parentNode!) : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      getLocalTransform(group),
    ),
  );
  const keys = generateNKeysBetween(null, null, roots.length);
  roots.forEach((node, i) => {
    // New local transform = (group page transform)^-1 · node page transform.
    const local = multiply(groupInverse, getPageTransform(store, node));
    const props = decomposeTransform(local, node.width, node.height, { axis: 'y', value: node.flipY });
    tx.put({ ...node, ...props, parentId: group.id, index: keys[i]! } as NodeRecord);
  });
  return group.id;
}

/** Dissolves groups, moving children to the group's parent without changing how they look. */
export function ungroupNodes(tx: Transaction, ids: readonly Id[]): Id[] {
  const store = tx.store;
  const released: Id[] = [];
  for (const id of ids) {
    const group = store.getNode(id);
    if (!group || group.type !== 'group' || group.locked) continue;
    const children = store.getChildren(group.id).sort(compareOrder);
    const groupLocal = getLocalTransform(group);
    const siblings = store.getChildIds(group.parentId);
    const pos = siblings.indexOf(group.id);
    const nextId = siblings[pos + 1];
    const upper = nextId ? store.getNode(nextId)!.index : null;
    const keys = safeKeysBetween(group.index, upper, children.length);
    children.forEach((child, i) => {
      const local = multiply(groupLocal, getLocalTransform(child));
      const props = decomposeTransform(local, child.width, child.height, { axis: 'y', value: child.flipY });
      // Group opacity multiplies into children so the look is preserved.
      tx.put({
        ...child,
        ...props,
        opacity: child.opacity * group.opacity,
        parentId: group.parentId,
        index: keys[i]!,
      } as NodeRecord);
      released.push(child.id);
    });
    tx.remove(group.id);
  }
  return released;
}

/** Moves nodes into a new parent (page, group or frame) above `beforeId`, preserving their page position. */
export function reparentNodes(
  tx: Transaction,
  ids: readonly Id[],
  parentId: Id,
  aboveId: Id | null = null,
): void {
  const store = tx.store;
  assertValidParent(store, parentId);
  const roots = topLevelIds(store, ids)
    .map((id) => store.getNode(id)!)
    .filter((n) => n.id !== parentId && !store.isAncestor(n.id, parentId));
  if (roots.length === 0) return;
  const parentNode = store.getNode(parentId);
  const pageToParent = parentNode
    ? invert(getPageTransform(store, parentNode))
    : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const pagePositions = roots.map((n) => ({ node: n, page: getPageTransform(store, n) }));
  // Temporarily keep the same parent while computing keys so `aboveId` lookups stay valid.
  const keys = indicesAbove(store, parentId, aboveId, roots.length);
  pagePositions.forEach(({ node, page }, i) => {
    const local = multiply(pageToParent, page);
    const props = decomposeTransform(local, node.width, node.height, { axis: 'y', value: node.flipY });
    tx.put({ ...node, ...props, parentId, index: keys[i]! } as NodeRecord);
  });
}
