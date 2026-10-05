/**
 * Creating, updating, deleting and copying nodes.
 */
import { generateNKeysBetween } from '../fractional-index';
import type { IdGenerator } from '../ids';
import { type AnyNodeProps, createNodeRecord } from '../model/factory';
import { LIMITS } from '../model/limits';
import { parseNode } from '../model/schema';
import { type AnyRecord, type Id, isContainer, type NodePatch, type NodeRecord } from '../model/types';
import type { DocumentStore, Transaction } from '../store/store';
import { indicesAbove } from './order';

/** Max nesting depth below a page (page children have depth 1). */
export function nodeDepth(store: DocumentStore, id: Id): number {
  return store.getAncestors(id).length + 1;
}

/** Validates that `parentId` can hold children (page, group or frame). */
export function assertValidParent(store: DocumentStore, parentId: Id): void {
  const parent = store.get(parentId);
  if (!parent) throw new Error(`Parent ${parentId} does not exist`);
  if (parent.typeName === 'page') return;
  if (!isContainer(parent)) throw new Error(`Node ${parentId} (${parent.typeName}) cannot contain children`);
  if (nodeDepth(store, parentId) >= LIMITS.maxNestingDepth) throw new Error('Maximum nesting depth reached');
}

export interface CreateNodesOptions {
  createId: IdGenerator;
  /** Insert directly above this sibling; default: on top. */
  aboveId?: Id | null;
}

/** Creates nodes (props are validated and defaulted) as children of `parentId`. */
export function createNodes(
  tx: Transaction,
  parentId: Id,
  props: readonly AnyNodeProps[],
  options: CreateNodesOptions,
): NodeRecord[] {
  assertValidParent(tx.store, parentId);
  const keys = indicesAbove(tx.store, parentId, options.aboveId ?? null, props.length);
  return props.map((p, i) => {
    const { type, children, ...rest } = p;
    if (children?.length && type !== 'group' && type !== 'frame')
      throw new Error(`A ${type} cannot contain other elements`);
    const node = tx.put(
      createNodeRecord(type, {
        ...(rest as object),
        id: options.createId('node'),
        parentId,
        index: keys[i]!,
      } as never),
    );
    if (children?.length) createNodes(tx, node.id, children, { createId: options.createId });
    return node;
  });
}

/**
 * Updates node properties. The merged record is re-validated, so invalid values
 * (bad colors, out-of-range numbers) are rejected and colors normalized.
 */
export function updateNodes(
  tx: Transaction,
  ids: readonly Id[],
  patch: NodePatch | ((node: NodeRecord) => NodePatch),
): NodeRecord[] {
  const out: NodeRecord[] = [];
  for (const id of ids) {
    const node = tx.getNode(id);
    if (!node) continue;
    const p = typeof patch === 'function' ? patch(node) : patch;
    const { id: _i, typeName: _t, type: _ty, ...safe } = p as Record<string, unknown>;
    const merged = parseNode({ ...node, ...safe }, `node ${id}`);
    out.push(tx.put(merged));
  }
  return out;
}

/** Deletes nodes and their entire subtrees. Locked nodes are kept unless `force`. */
export function deleteNodes(tx: Transaction, ids: readonly Id[], options: { force?: boolean } = {}): Id[] {
  const store = tx.store;
  const deleted: Id[] = [];
  for (const id of ids) {
    const node = store.getNode(id);
    if (!node) continue;
    if (!options.force && (node.locked || store.getAncestors(id).some((a) => a.locked))) continue;
    for (const d of store.getDescendantIds(id)) {
      tx.remove(d);
      deleted.push(d);
    }
    tx.remove(id);
    deleted.push(id);
  }
  return deleted;
}

/** Removes ids whose ancestor is also in the list (operations act on the top-most selected node). */
export function topLevelIds(store: DocumentStore, ids: readonly Id[]): Id[] {
  const set = new Set(ids);
  return ids.filter((id) => store.has(id) && !store.getAncestors(id).some((a) => set.has(a.id)));
}

/** Unlocked nodes (no locked ancestor) — the ones transform operations may touch. */
export function editableIds(store: DocumentStore, ids: readonly Id[]): Id[] {
  return ids.filter((id) => {
    const node = store.getNode(id);
    return node && !node.locked && !store.getAncestors(id).some((a) => a.locked);
  });
}

// ---------------------------------------------------------------------------
// Subtree copy (duplicate, copy/paste, templates)
// ---------------------------------------------------------------------------

/** Serializable copy of node subtrees plus the assets they reference. */
export interface SubtreeSnapshot {
  /** Top-level node ids, back to front. */
  rootIds: Id[];
  /** All nodes of all subtrees (roots keep their original parentId). */
  nodes: NodeRecord[];
  assets: AnyRecord[];
}

export function snapshotSubtrees(store: DocumentStore, ids: readonly Id[]): SubtreeSnapshot {
  // Stable visual order: page order, then back-to-front traversal within each page.
  const position = new Map<Id, number>();
  let n = 0;
  for (const pageId of store.getPageIds())
    for (const id of store.getDescendantIds(pageId)) position.set(id, n++);
  const roots = topLevelIds(store, ids)
    .map((id) => store.getNode(id)!)
    .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  const nodes: NodeRecord[] = [];
  const assetIds = new Set<Id>();
  for (const root of roots) {
    for (const id of [root.id, ...store.getDescendantIds(root.id)]) {
      const node = store.getNode(id)!;
      nodes.push(node);
      if (node.type === 'image') assetIds.add(node.assetId);
    }
  }
  const assets = [...assetIds].map((id) => store.getAsset(id)).filter((a): a is NonNullable<typeof a> => !!a);
  return { rootIds: roots.map((r) => r.id), nodes, assets };
}

export interface InsertSubtreesOptions {
  createId: IdGenerator;
  parentId: Id;
  aboveId?: Id | null;
  /** Offset applied to root nodes, in the target parent's space. */
  offset?: { x: number; y: number };
}

/**
 * Inserts subtree copies with fresh ids. Returns the new root ids.
 * Assets are added if missing (matched by id).
 */
export function insertSubtrees(
  tx: Transaction,
  snapshot: SubtreeSnapshot,
  options: InsertSubtreesOptions,
): Id[] {
  const store = tx.store;
  assertValidParent(store, options.parentId);
  for (const asset of snapshot.assets) {
    if (!store.has(asset.id)) tx.put(asset);
  }
  const idMap = new Map<Id, Id>();
  for (const node of snapshot.nodes) idMap.set(node.id, options.createId('node'));
  const rootSet = new Set(snapshot.rootIds);
  const rootKeys = indicesAbove(store, options.parentId, options.aboveId ?? null, snapshot.rootIds.length);
  const dx = options.offset?.x ?? 0;
  const dy = options.offset?.y ?? 0;
  for (const node of snapshot.nodes) {
    const isRoot = rootSet.has(node.id);
    const next = parseNode({
      ...node,
      id: idMap.get(node.id)!,
      parentId: isRoot ? options.parentId : (idMap.get(node.parentId) ?? options.parentId),
      index: isRoot ? rootKeys[snapshot.rootIds.indexOf(node.id)]! : node.index,
      x: isRoot ? node.x + dx : node.x,
      y: isRoot ? node.y + dy : node.y,
    });
    tx.put(next);
  }
  return snapshot.rootIds.map((id) => idMap.get(id)!);
}

/** Duplicates nodes in place (each copy directly above its original), offset in parent space. */
export function duplicateNodes(
  tx: Transaction,
  ids: readonly Id[],
  createId: IdGenerator,
  offset = { x: 20, y: 20 },
): Id[] {
  const store = tx.store;
  const out: Id[] = [];
  for (const id of topLevelIds(store, ids)) {
    const node = store.getNode(id);
    if (!node) continue;
    const snap = snapshotSubtrees(store, [id]);
    out.push(...insertSubtrees(tx, snap, { createId, parentId: node.parentId, aboveId: id, offset }));
  }
  return out;
}

/** Re-keys children of a parent with evenly spread keys (housekeeping, e.g. after many inserts). */
export function rebalanceIndices(tx: Transaction, parentId: Id): void {
  const children = tx.store.getChildren(parentId);
  const keys = generateNKeysBetween(null, null, children.length);
  children.forEach((c, i) => {
    if (c.index !== keys[i]) tx.update<NodeRecord>(c.id, { index: keys[i]! });
  });
}
