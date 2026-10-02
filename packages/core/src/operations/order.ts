/**
 * Sibling ordering (z-order) and re-parenting.
 */
import { compareOrder, generateKeyBetween, generateNKeysBetween } from '../fractional-index';
import type { Id, NodeRecord, PageRecord } from '../model/types';
import type { DocumentStore, Transaction } from '../store/store';

/** Key that places a new child on top of all current children of `parentId`. */
export function topIndex(store: DocumentStore, parentId: Id): string {
  const ids = store.getChildIds(parentId);
  const last = ids.length ? store.getNode(ids[ids.length - 1]!)!.index : null;
  return generateKeyBetween(last, null);
}

/** `n` keys placing new children directly above `aboveId` (or on top when null). */
export function indicesAbove(store: DocumentStore, parentId: Id, aboveId: Id | null, n: number): string[] {
  const ids = store.getChildIds(parentId);
  if (aboveId === null) {
    const last = ids.length ? store.getNode(ids[ids.length - 1]!)!.index : null;
    return generateNKeysBetween(last, null, n);
  }
  const pos = ids.indexOf(aboveId);
  if (pos < 0) return indicesAbove(store, parentId, null, n);
  const lower = store.getNode(aboveId)!.index;
  const nextId = ids[pos + 1];
  const upper = nextId ? store.getNode(nextId)!.index : null;
  return safeKeysBetween(lower, upper, n);
}

/** Like generateNKeysBetween but tolerates equal neighbour keys (possible after concurrent inserts). */
export function safeKeysBetween(lower: string | null, upper: string | null, n: number): string[] {
  if (lower !== null && upper !== null && lower >= upper) return generateNKeysBetween(lower, null, n);
  return generateNKeysBetween(lower, upper, n);
}

/** Groups ids by parent, sorted back-to-front within each parent. */
export function groupByParent(store: DocumentStore, ids: readonly Id[]): Map<Id, NodeRecord[]> {
  const out = new Map<Id, NodeRecord[]>();
  for (const id of ids) {
    const node = store.getNode(id);
    if (!node) continue;
    let list = out.get(node.parentId);
    if (!list) {
      list = [];
      out.set(node.parentId, list);
    }
    if (!list.includes(node)) list.push(node);
  }
  for (const list of out.values()) list.sort(compareOrder);
  return out;
}

export type ReorderDirection = 'front' | 'back' | 'forward' | 'backward';

/** Changes the z-order of nodes among their siblings. */
export function reorderNodes(tx: Transaction, ids: readonly Id[], direction: ReorderDirection): void {
  const store = tx.store;
  for (const [parentId, selected] of groupByParent(store, ids)) {
    const siblings = store.getChildren(parentId);
    const selectedSet = new Set(selected.map((n) => n.id));
    if (direction === 'front' || direction === 'back') {
      const k = selected.length;
      const edge = direction === 'front' ? siblings.slice(-k) : siblings.slice(0, k);
      if (edge.every((n) => selectedSet.has(n.id))) continue;
      const keys =
        direction === 'front'
          ? generateNKeysBetween(siblings[siblings.length - 1]!.index, null, k)
          : generateNKeysBetween(null, siblings[0]!.index, k);
      selected.forEach((n, i) => tx.update<NodeRecord>(n.id, { index: keys[i]! }));
    } else if (direction === 'forward') {
      // Walk from the front; each selected node hops over the next unselected sibling above it.
      const order = siblings.map((n) => n.id);
      for (let i = order.length - 2; i >= 0; i--) {
        const id = order[i]!;
        if (!selectedSet.has(id) || selectedSet.has(order[i + 1]!)) continue;
        [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
      }
      applyOrder(tx, parentId, order, selectedSet);
    } else {
      const order = siblings.map((n) => n.id);
      for (let i = 1; i < order.length; i++) {
        const id = order[i]!;
        if (!selectedSet.has(id) || selectedSet.has(order[i - 1]!)) continue;
        [order[i], order[i - 1]] = [order[i - 1]!, order[i]!];
      }
      applyOrder(tx, parentId, order, selectedSet);
    }
  }
}

/** Re-keys only the `moved` ids so that the sibling order matches `order`. */
function applyOrder(tx: Transaction, _parentId: Id, order: readonly Id[], moved: ReadonlySet<Id>): void {
  const store = tx.store;
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    if (!moved.has(id)) continue;
    const prev = i > 0 ? store.getNode(order[i - 1]!)!.index : null;
    // Next sibling in the target order that keeps its key.
    let next: string | null = null;
    for (let j = i + 1; j < order.length; j++) {
      const nid = order[j]!;
      if (!moved.has(nid)) {
        next = store.getNode(nid)!.index;
        break;
      }
    }
    const current = store.getNode(id)!.index;
    if ((prev === null || prev < current) && (next === null || current < next)) continue;
    const [key] = safeKeysBetween(prev, next, 1);
    tx.update<NodeRecord>(id, { index: key! });
  }
}

/** Moves pages to a new position (0-based) in the page list. */
export function movePage(tx: Transaction, pageId: Id, toPosition: number): void {
  const store = tx.store;
  const pages = store.getPages().filter((p) => p.id !== pageId);
  const pos = Math.max(0, Math.min(pages.length, Math.round(toPosition)));
  const before = pos > 0 ? pages[pos - 1]!.index : null;
  const after = pos < pages.length ? pages[pos]!.index : null;
  const [key] = safeKeysBetween(before, after, 1);
  tx.update<PageRecord>(pageId, { index: key! });
}
