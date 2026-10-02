/**
 * Command-based undo/redo.
 *
 * Every user-facing operation runs as a named command inside one store
 * transaction, producing one diff. History records `{ label, diff, before,
 * after }` entries, where `before`/`after` are opaque editor-state snapshots
 * (selection, current page) so undo restores what the user was looking at.
 *
 * - Gestures (dragging, resizing, typing) are wrapped in a batch so the whole
 *   gesture becomes ONE undo step.
 * - Repeated small edits with the same `coalesceKey` (arrow-key nudges, slider
 *   drags) merge into the previous entry within a time window.
 * - Undo/redo apply diffs with source `history`, so they never re-enter history.
 */
import { invertDiff, isEmptyDiff, type RecordsDiff, squashDiffs } from '../store/diff';
import type { DocumentStore, StoreChange } from '../store/store';

export interface HistoryEntry<S = unknown> {
  id: number;
  label: string;
  diff: RecordsDiff;
  before: S;
  after: S;
  coalesceKey: string | null;
  timestamp: number;
}

export interface HistoryOptions<S> {
  /** Max undo steps kept. Default 300. */
  limit?: number;
  /** Merge window for coalescing, ms. Default 1000. */
  coalesceWindowMs?: number;
  /** Captures editor state (e.g. selection) to restore on undo/redo. */
  captureState?: () => S;
  restoreState?: (state: S) => void;
  now?: () => number;
}

export interface RecordOptions {
  label: string;
  coalesceKey?: string | null;
}

interface OpenBatch<S> {
  label: string;
  diffs: RecordsDiff[];
  before: S;
  depth: number;
}

export type HistoryListener = () => void;

export class History<S = unknown> {
  private undoStack: HistoryEntry<S>[] = [];
  private redoStack: HistoryEntry<S>[] = [];
  private batch: OpenBatch<S> | null = null;
  private nextId = 1;
  private readonly listeners = new Set<HistoryListener>();
  private readonly limit: number;
  private readonly coalesceWindowMs: number;
  private readonly captureState: () => S;
  private readonly restoreState: (state: S) => void;
  private readonly now: () => number;
  /** State captured after the last recorded change; used as `before` for the next one. */
  private stableState: S;
  private recording = false;
  private readonly unlisten: () => void;

  constructor(
    private readonly store: DocumentStore,
    options: HistoryOptions<S> = {},
  ) {
    this.limit = options.limit ?? 300;
    this.coalesceWindowMs = options.coalesceWindowMs ?? 1000;
    this.captureState = options.captureState ?? (() => undefined as S);
    this.restoreState = options.restoreState ?? (() => {});
    this.now = options.now ?? Date.now;
    this.stableState = this.captureState();
    // Safety net: user changes made outside `run()` are still recorded.
    this.unlisten = store.listen((change) => this.onStoreChange(change));
  }

  dispose(): void {
    this.unlisten();
    this.listeners.clear();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && this.batch === null;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && this.batch === null;
  }

  get undoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  get isBatching(): boolean {
    return this.batch !== null;
  }

  getUndoStack(): readonly HistoryEntry<S>[] {
    return this.undoStack;
  }

  getRedoStack(): readonly HistoryEntry<S>[] {
    return this.redoStack;
  }

  listen(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Call when editor state (selection, page) changes outside of commands. */
  markStateChanged(): void {
    if (!this.batch) this.stableState = this.captureState();
  }

  /**
   * Runs `fn` (which performs store transactions with source `user`) and records
   * the combined change as a single entry.
   */
  run<T>(fn: () => T, options: RecordOptions): T {
    const before = this.batch ? this.batch.before : this.stableState;
    const diffs: RecordsDiff[] = [];
    const unlisten = this.store.listen((change) => {
      if (change.source === 'user') diffs.push(change.diff);
    });
    const wasRecording = this.recording;
    this.recording = true;
    let result: T;
    try {
      result = fn();
    } finally {
      this.recording = wasRecording;
      unlisten();
    }
    const diff = squashDiffs(diffs);
    if (!isEmptyDiff(diff)) this.push(diff, before, options);
    else if (!this.batch) this.stableState = this.captureState();
    return result;
  }

  /** Starts (or nests into) a batch — everything until `endBatch()` becomes one entry. */
  beginBatch(label: string): void {
    if (this.batch) {
      this.batch.depth++;
      return;
    }
    this.batch = { label, diffs: [], before: this.stableState, depth: 1 };
    this.notify();
  }

  endBatch(options: { label?: string } = {}): HistoryEntry<S> | null {
    const batch = this.batch;
    if (!batch) return null;
    if (--batch.depth > 0) return null;
    this.batch = null;
    const diff = squashDiffs(batch.diffs);
    let entry: HistoryEntry<S> | null = null;
    if (!isEmptyDiff(diff)) {
      entry = this.pushEntry({
        id: this.nextId++,
        label: options.label ?? batch.label,
        diff,
        before: batch.before,
        after: this.captureState(),
        coalesceKey: null,
        timestamp: this.now(),
      });
    }
    this.stableState = this.captureState();
    this.notify();
    return entry;
  }

  /** Reverts everything recorded in the open batch and discards it (e.g. Escape during a drag). */
  cancelBatch(): void {
    const batch = this.batch;
    if (!batch) return;
    this.batch = null;
    const diff = squashDiffs(batch.diffs);
    if (!isEmptyDiff(diff)) this.store.applyDiff(invertDiff(diff), { source: 'history', label: 'Cancel' });
    this.restoreState(batch.before);
    this.stableState = this.captureState();
    this.notify();
  }

  undo(): HistoryEntry<S> | null {
    if (this.batch) this.endBatch();
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.store.applyDiff(invertDiff(entry.diff), { source: 'history', label: `Undo ${entry.label}` });
    this.redoStack.push(entry);
    this.restoreState(entry.before);
    this.stableState = this.captureState();
    this.notify();
    return entry;
  }

  redo(): HistoryEntry<S> | null {
    if (this.batch) this.endBatch();
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.store.applyDiff(entry.diff, { source: 'history', label: `Redo ${entry.label}` });
    this.undoStack.push(entry);
    this.restoreState(entry.after);
    this.stableState = this.captureState();
    this.notify();
    return entry;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batch = null;
    this.stableState = this.captureState();
    this.notify();
  }

  private onStoreChange(change: StoreChange): void {
    if (change.source !== 'user' || this.recording) return;
    // A user change that bypassed run(): record it so nothing escapes undo.
    this.push(change.diff, this.batch ? this.batch.before : this.stableState, {
      label: change.label || 'Edit',
    });
  }

  private push(diff: RecordsDiff, before: S, options: RecordOptions): void {
    if (this.batch) {
      this.batch.diffs.push(diff);
      return;
    }
    const now = this.now();
    const key = options.coalesceKey ?? null;
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      key &&
      top &&
      top.coalesceKey === key &&
      this.redoStack.length === 0 &&
      now - top.timestamp <= this.coalesceWindowMs
    ) {
      top.diff = squashDiffs([top.diff, diff]);
      top.after = this.captureState();
      top.timestamp = now;
      if (isEmptyDiff(top.diff)) this.undoStack.pop();
      this.stableState = this.captureState();
      this.notify();
      return;
    }
    this.pushEntry({
      id: this.nextId++,
      label: options.label,
      diff,
      before,
      after: this.captureState(),
      coalesceKey: key,
      timestamp: now,
    });
    this.stableState = this.captureState();
    this.notify();
  }

  private pushEntry(entry: HistoryEntry<S>): HistoryEntry<S> {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.redoStack = [];
    return entry;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
