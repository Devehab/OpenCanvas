/**
 * Gesture snapshots. Every frame of a drag first restores the affected
 * records to their state at gesture start, then applies the transform
 * computed from that start state. Frames are therefore exact and
 * order-independent (no accumulated drift), and group re-normalization never
 * compounds.
 */
import type { DocumentStore, Id, NodeRecord, Transaction } from '@opencanvas/core';

export class GestureSnapshot {
  readonly records = new Map<Id, NodeRecord>();

  constructor(store: DocumentStore, ids: readonly Id[]) {
    for (const id of ids) {
      // Snapshot the whole page-level subtree that contains the node.
      let top = store.getNode(id);
      if (!top) continue;
      const ancestors = store.getAncestors(id);
      if (ancestors.length) top = ancestors[ancestors.length - 1]!;
      if (this.records.has(top.id)) continue;
      this.records.set(top.id, top);
      for (const d of store.getDescendantIds(top.id)) this.records.set(d, store.getNode(d)!);
    }
  }

  get(id: Id): NodeRecord | undefined {
    return this.records.get(id);
  }

  restore(tx: Transaction): void {
    for (const record of this.records.values()) {
      if (tx.store.getNode(record.id) !== record) tx.put(record);
    }
  }
}
