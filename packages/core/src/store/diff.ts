/**
 * Record diffs — the unit of change for undo/redo, persistence and (later) sync.
 */
import type { AnyRecord, Id } from '../model/types';
import { deepEqual } from './equality';

export interface RecordsDiff {
  added: Record<Id, AnyRecord>;
  updated: Record<Id, [from: AnyRecord, to: AnyRecord]>;
  removed: Record<Id, AnyRecord>;
}

export const createEmptyDiff = (): RecordsDiff => ({ added: {}, updated: {}, removed: {} });

export function isEmptyDiff(diff: RecordsDiff): boolean {
  for (const _ in diff.added) return false;
  for (const _ in diff.updated) return false;
  for (const _ in diff.removed) return false;
  return true;
}

export function invertDiff(diff: RecordsDiff): RecordsDiff {
  const updated: RecordsDiff['updated'] = {};
  for (const [id, [from, to]] of Object.entries(diff.updated)) updated[id] = [to, from];
  return { added: { ...diff.removed }, updated, removed: { ...diff.added } };
}

/** Ids touched by a diff. */
export function diffIds(diff: RecordsDiff): Id[] {
  return [...Object.keys(diff.added), ...Object.keys(diff.updated), ...Object.keys(diff.removed)];
}

/** Combines sequential diffs into one equivalent diff (no-op changes cancel out). */
export function squashDiffs(diffs: readonly RecordsDiff[]): RecordsDiff {
  const state = new Map<Id, { from: AnyRecord | undefined; to: AnyRecord | undefined }>();
  for (const diff of diffs) {
    for (const [id, rec] of Object.entries(diff.added)) {
      const s = state.get(id);
      if (s) s.to = rec;
      else state.set(id, { from: undefined, to: rec });
    }
    for (const [id, [from, to]] of Object.entries(diff.updated)) {
      const s = state.get(id);
      if (s) s.to = to;
      else state.set(id, { from, to });
    }
    for (const [id, rec] of Object.entries(diff.removed)) {
      const s = state.get(id);
      if (s) {
        if (s.from === undefined) state.delete(id);
        else s.to = undefined;
      } else {
        state.set(id, { from: rec, to: undefined });
      }
    }
  }
  const out = createEmptyDiff();
  for (const [id, { from, to }] of state) {
    if (from === undefined && to !== undefined) out.added[id] = to;
    else if (from !== undefined && to === undefined) out.removed[id] = from;
    else if (from !== undefined && to !== undefined && !deepEqual(from, to)) out.updated[id] = [from, to];
  }
  return out;
}

/** Top-level keys whose values differ between two versions of a record. */
export function changedKeys(from: AnyRecord, to: AnyRecord): string[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const out: string[] = [];
  const f = from as unknown as Record<string, unknown>;
  const t = to as unknown as Record<string, unknown>;
  for (const k of keys) if (!deepEqual(f[k], t[k])) out.push(k);
  return out;
}
