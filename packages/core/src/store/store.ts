/**
 * DocumentStore — the single source of truth for a design.
 *
 * - Holds immutable records in a flat map, with derived indexes (children per
 *   parent, sorted pages).
 * - All writes happen inside atomic transactions. A transaction either commits
 *   completely (producing one {@link RecordsDiff}) or rolls back completely.
 * - Listeners receive every committed diff together with its source, which is
 *   how history, persistence, rendering and (later) sync observe changes.
 *
 * The store knows nothing about React, canvases or the DOM.
 */
import { compareOrder } from '../fractional-index';
import { parseRecord } from '../model/schema';
import {
  type AnyRecord,
  type AssetRecord,
  type ContainerNode,
  type DocumentRecord,
  type Id,
  isContainer,
  isNode,
  type NodeRecord,
  type PageRecord,
} from '../model/types';
import { changedKeys, createEmptyDiff, isEmptyDiff, type RecordsDiff } from './diff';
import { deepEqual, deepFreeze } from './equality';

/**
 * Where a change came from:
 * - `user`: a local edit (recorded in undo history)
 * - `history`: undo/redo
 * - `system`: automatic, non-undoable maintenance (e.g. re-measuring text after fonts load)
 * - `remote`: a collaborator's change
 * - `load`: initial load / full replacement
 */
export type ChangeSource = 'user' | 'history' | 'system' | 'remote' | 'load';

export interface StoreChange {
  diff: RecordsDiff;
  source: ChangeSource;
  label: string;
}

export type StoreListener = (change: StoreChange) => void;

/** Runs before a `user`/`system` transaction commits and may write more records (e.g. to keep invariants). */
export type TransactionFinalizer = (tx: Transaction, touched: ReadonlySet<Id>) => void;

export interface StoreOptions {
  /** Deep-freeze stored records to catch accidental mutation. Default: true unless NODE_ENV=production. */
  freeze?: boolean;
  /** Validate every written record against the schema (slower; great for tests). Default: false. */
  validate?: boolean;
  /** Called when a listener throws. Default: rethrow asynchronously (so it surfaces without breaking other listeners). */
  onListenerError?: (error: unknown) => void;
}

export interface TransactionOptions {
  source?: ChangeSource;
  label?: string;
}

export interface TransactionResult<T> {
  result: T;
  diff: RecordsDiff;
}

interface TxState {
  originals: Map<Id, AnyRecord | undefined>;
  source: ChangeSource;
  label: string;
}

const isProduction = () =>
  typeof process !== 'undefined' &&
  (process as { env?: Record<string, string> }).env?.NODE_ENV === 'production';

export class DocumentStore {
  private readonly records = new Map<Id, AnyRecord>();
  private readonly childSets = new Map<Id, Set<Id>>();
  private readonly sortedChildren = new Map<Id, Id[]>();
  private readonly pageIds = new Set<Id>();
  private sortedPageIds: Id[] | null = null;
  private readonly listeners = new Set<StoreListener>();
  private readonly finalizers: TransactionFinalizer[] = [];
  private tx: TxState | null = null;
  private readonly txHandle: Transaction;
  private readonly freeze: boolean;
  private readonly validate: boolean;
  private readonly onListenerError: (error: unknown) => void;
  private _version = 0;

  constructor(records: Iterable<AnyRecord> = [], options: StoreOptions = {}) {
    this.freeze = options.freeze ?? !isProduction();
    this.validate = options.validate ?? false;
    this.onListenerError =
      options.onListenerError ??
      ((error) =>
        queueMicrotask(() => {
          throw error;
        }));
    this.txHandle = new Transaction(this);
    for (const record of records) this.writeRaw(record.id, record);
  }

  /** Increments on every committed change. Cheap cache key for derived data. */
  get version(): number {
    return this._version;
  }

  get size(): number {
    return this.records.size;
  }

  get inTransaction(): boolean {
    return this.tx !== null;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  get<T extends AnyRecord = AnyRecord>(id: Id): T | undefined {
    return this.records.get(id) as T | undefined;
  }

  has(id: Id): boolean {
    return this.records.has(id);
  }

  getDocument(): DocumentRecord | undefined {
    return this.records.get('document') as DocumentRecord | undefined;
  }

  getNode(id: Id): NodeRecord | undefined {
    const r = this.records.get(id);
    return r?.typeName === 'node' ? r : undefined;
  }

  getPage(id: Id): PageRecord | undefined {
    const r = this.records.get(id);
    return r?.typeName === 'page' ? r : undefined;
  }

  getAsset(id: Id): AssetRecord | undefined {
    const r = this.records.get(id);
    return r?.typeName === 'asset' ? r : undefined;
  }

  allRecords(): IterableIterator<AnyRecord> {
    return this.records.values();
  }

  getNodes(): NodeRecord[] {
    const out: NodeRecord[] = [];
    for (const r of this.records.values()) if (r.typeName === 'node') out.push(r);
    return out;
  }

  getAssets(): AssetRecord[] {
    const out: AssetRecord[] = [];
    for (const r of this.records.values()) if (r.typeName === 'asset') out.push(r);
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  getPageIds(): readonly Id[] {
    if (!this.sortedPageIds) {
      this.sortedPageIds = [...this.pageIds]
        .map((id) => this.records.get(id) as PageRecord)
        .sort(compareOrder)
        .map((p) => p.id);
    }
    return this.sortedPageIds;
  }

  getPages(): PageRecord[] {
    return this.getPageIds().map((id) => this.records.get(id) as PageRecord);
  }

  /** Child ids of a page or container, back to front. */
  getChildIds(parentId: Id): readonly Id[] {
    let sorted = this.sortedChildren.get(parentId);
    if (!sorted) {
      const set = this.childSets.get(parentId);
      sorted = set
        ? [...set]
            .map((id) => this.records.get(id) as NodeRecord)
            .sort(compareOrder)
            .map((n) => n.id)
        : [];
      this.sortedChildren.set(parentId, sorted);
    }
    return sorted;
  }

  /** Children of a page or container, back to front. */
  getChildren(parentId: Id): NodeRecord[] {
    return this.getChildIds(parentId).map((id) => this.records.get(id) as NodeRecord);
  }

  getParent(node: NodeRecord): PageRecord | ContainerNode | undefined {
    const parent = this.records.get(node.parentId);
    if (!parent) return undefined;
    if (parent.typeName === 'page') return parent;
    return isContainer(parent) ? parent : undefined;
  }

  /** Container ancestors of a node, nearest first (excludes the page). */
  getAncestors(id: Id): ContainerNode[] {
    const out: ContainerNode[] = [];
    let current = this.getNode(id);
    let guard = 0;
    while (current && guard++ < 1000) {
      const parent = this.records.get(current.parentId);
      if (!parent || parent.typeName !== 'node') break;
      out.push(parent as ContainerNode);
      current = parent;
    }
    return out;
  }

  /** Page that (transitively) contains the record; a page returns itself. */
  getPageIdOf(id: Id): Id | undefined {
    let current = this.records.get(id);
    let guard = 0;
    while (current && guard++ < 1000) {
      if (current.typeName === 'page') return current.id;
      if (current.typeName !== 'node') return undefined;
      current = this.records.get(current.parentId);
    }
    return undefined;
  }

  /** True if `ancestorId` is a (transitive) parent of `id`. */
  isAncestor(ancestorId: Id, id: Id): boolean {
    let current = this.getNode(id);
    let guard = 0;
    while (current && guard++ < 1000) {
      if (current.parentId === ancestorId) return true;
      current = this.getNode(current.parentId);
    }
    return false;
  }

  /** All descendants of a page or container, depth-first, back to front. */
  getDescendantIds(parentId: Id): Id[] {
    const out: Id[] = [];
    const visit = (pid: Id, depth: number) => {
      if (depth > 1000) return;
      for (const id of this.getChildIds(pid)) {
        out.push(id);
        if (this.childSets.has(id)) visit(id, depth + 1);
      }
    };
    visit(parentId, 0);
    return out;
  }

  /** Canonically ordered list of all records (document, pages, nodes, assets; each by id). */
  getRecords(): AnyRecord[] {
    const rank: Record<AnyRecord['typeName'], number> = { document: 0, page: 1, node: 2, asset: 3 };
    return [...this.records.values()].sort((a, b) => {
      const r = rank[a.typeName] - rank[b.typeName];
      if (r !== 0) return r;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Runs `fn` atomically. Nested calls join the outer transaction. If `fn` throws,
   * every write made in the transaction is rolled back and the error rethrown.
   */
  transact<T>(fn: (tx: Transaction) => T, options: TransactionOptions = {}): TransactionResult<T> {
    if (this.tx) {
      // Nested call: joins the outer transaction, which reports the combined diff.
      return { result: fn(this.txHandle), diff: createEmptyDiff() };
    }
    const source = options.source ?? 'user';
    this.tx = { originals: new Map(), source, label: options.label ?? '' };
    let result: T;
    let diff: RecordsDiff;
    try {
      result = fn(this.txHandle);
      if ((source === 'user' || source === 'system') && this.finalizers.length > 0) {
        const touched = new Set(this.tx.originals.keys());
        for (const finalize of this.finalizers) finalize(this.txHandle, touched);
      }
      diff = this.buildDiff(this.tx);
    } catch (error) {
      this.rollback(this.tx);
      this.tx = null;
      throw error;
    }
    const label = this.tx.label;
    this.tx = null;
    if (!isEmptyDiff(diff)) {
      this._version++;
      this.emit({ diff, source, label });
    }
    return { result, diff };
  }

  /**
   * Applies a diff (from history or a remote peer). Updates are applied
   * field-by-field on top of the current record, so unrelated concurrent
   * changes to other fields survive an undo.
   */
  applyDiff(diff: RecordsDiff, options: { source: ChangeSource; label?: string }): RecordsDiff {
    return this.transact(
      (tx) => {
        for (const id of Object.keys(diff.removed)) if (this.records.has(id)) tx.remove(id);
        for (const record of Object.values(diff.added)) tx.put(record);
        for (const [id, [from, to]] of Object.entries(diff.updated)) {
          const current = this.records.get(id);
          if (!current) continue;
          const keys = changedKeys(from, to);
          if (keys.length === 0) continue;
          const next = { ...current } as Record<string, unknown>;
          const target = to as unknown as Record<string, unknown>;
          for (const k of keys) {
            if (k in target) next[k] = target[k];
            else delete next[k];
          }
          tx.put(next as unknown as AnyRecord);
        }
      },
      { source: options.source, label: options.label ?? '' },
    ).diff;
  }

  /** Replaces the whole content of the store (e.g. loading a document). */
  replaceAll(records: Iterable<AnyRecord>, source: ChangeSource = 'load'): RecordsDiff {
    const next = new Map<Id, AnyRecord>();
    for (const r of records) next.set(r.id, r);
    return this.transact(
      (tx) => {
        for (const id of [...this.records.keys()]) if (!next.has(id)) tx.remove(id);
        for (const r of next.values()) tx.put(r);
      },
      { source, label: 'Load' },
    ).diff;
  }

  listen(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addFinalizer(finalizer: TransactionFinalizer): () => void {
    this.finalizers.push(finalizer);
    return () => {
      const i = this.finalizers.indexOf(finalizer);
      if (i >= 0) this.finalizers.splice(i, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Internals (used by Transaction)
  // -------------------------------------------------------------------------

  /** @internal */
  _write(id: Id, next: AnyRecord | undefined): void {
    const tx = this.tx;
    if (!tx) throw new Error('DocumentStore: writes must happen inside transact()');
    if (next) {
      if (next.id !== id) throw new Error(`DocumentStore: record id mismatch (${next.id} vs ${id})`);
      if (next.typeName === 'node' && next.parentId === next.id) {
        throw new Error(`DocumentStore: node ${id} cannot be its own parent`);
      }
      if (this.validate) parseRecord(next);
    }
    const prev = this.records.get(id);
    if (!tx.originals.has(id)) tx.originals.set(id, prev);
    this.writeRaw(id, next);
  }

  /** @internal */
  _getOriginal(id: Id): AnyRecord | undefined {
    if (this.tx?.originals.has(id)) return this.tx.originals.get(id);
    return this.records.get(id);
  }

  private writeRaw(id: Id, next: AnyRecord | undefined): void {
    const prev = this.records.get(id);
    if (next) {
      if (this.freeze) deepFreeze(next);
      this.records.set(id, next);
    } else {
      this.records.delete(id);
    }
    this.updateIndexes(prev, next);
  }

  private updateIndexes(prev: AnyRecord | undefined, next: AnyRecord | undefined): void {
    if (isNode(prev) || isNode(next)) {
      const prevParent = isNode(prev) ? prev.parentId : undefined;
      const nextParent = isNode(next) ? next.parentId : undefined;
      const id = (next ?? prev)!.id;
      if (prevParent !== nextParent) {
        if (prevParent !== undefined) {
          const set = this.childSets.get(prevParent);
          set?.delete(id);
          if (set && set.size === 0) this.childSets.delete(prevParent);
          this.sortedChildren.delete(prevParent);
        }
        if (nextParent !== undefined) {
          let set = this.childSets.get(nextParent);
          if (!set) {
            set = new Set();
            this.childSets.set(nextParent, set);
          }
          set.add(id);
          this.sortedChildren.delete(nextParent);
        }
      } else if (nextParent !== undefined && (prev as NodeRecord).index !== (next as NodeRecord).index) {
        this.sortedChildren.delete(nextParent);
      }
    }
    if (prev?.typeName === 'page' || next?.typeName === 'page') {
      const id = (next ?? prev)!.id;
      if (!prev) this.pageIds.add(id);
      if (!next) this.pageIds.delete(id);
      if (!prev || !next || (prev as PageRecord).index !== (next as PageRecord).index)
        this.sortedPageIds = null;
    }
  }

  private buildDiff(tx: TxState): RecordsDiff {
    const diff = createEmptyDiff();
    for (const [id, from] of tx.originals) {
      const to = this.records.get(id);
      if (from === undefined && to !== undefined) diff.added[id] = to;
      else if (from !== undefined && to === undefined) diff.removed[id] = from;
      else if (from !== undefined && to !== undefined && from !== to && !deepEqual(from, to)) {
        diff.updated[id] = [from, to];
      }
    }
    return diff;
  }

  private rollback(tx: TxState): void {
    for (const [id, original] of tx.originals) this.writeRaw(id, original);
  }

  private emit(change: StoreChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        // Never leave other listeners un-notified.
        this.onListenerError(error);
      }
    }
  }
}

/** Write handle passed to transaction callbacks. Reads always reflect writes made so far. */
export class Transaction {
  constructor(readonly store: DocumentStore) {}

  get<T extends AnyRecord = AnyRecord>(id: Id): T | undefined {
    return this.store.get<T>(id);
  }

  getNode(id: Id): NodeRecord | undefined {
    return this.store.getNode(id);
  }

  getPage(id: Id): PageRecord | undefined {
    return this.store.getPage(id);
  }

  getChildren(parentId: Id): NodeRecord[] {
    return this.store.getChildren(parentId);
  }

  /** Adds or replaces a record. */
  put<T extends AnyRecord>(record: T): T {
    this.store._write(record.id, record);
    return record;
  }

  /** Shallow-merges `patch` into a record (or applies an updater). Identity fields cannot change. */
  update<T extends AnyRecord>(id: Id, patch: Partial<T> | ((record: T) => T)): T {
    const current = this.store.get<T>(id);
    if (!current) throw new Error(`Transaction.update: record ${id} does not exist`);
    const next = typeof patch === 'function' ? patch(current) : ({ ...current, ...patch } as T);
    if (next.id !== current.id || next.typeName !== current.typeName) {
      throw new Error(`Transaction.update: cannot change id/typeName of ${id}`);
    }
    if (current.typeName === 'node' && (next as NodeRecord).type !== current.type) {
      throw new Error(`Transaction.update: cannot change node type of ${id}`);
    }
    this.store._write(id, next);
    return next;
  }

  remove(id: Id): void {
    if (this.store.has(id)) this.store._write(id, undefined);
  }

  /** The record as it was when this transaction started (undefined if it did not exist). */
  getOriginal<T extends AnyRecord = AnyRecord>(id: Id): T | undefined {
    return this.store._getOriginal(id) as T | undefined;
  }
}
