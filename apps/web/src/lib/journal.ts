/**
 * Crash journal. IndexedDB writes are asynchronous and may not finish while a
 * tab is closing or reloading, so the latest unsaved state of a design is also
 * written synchronously to localStorage when the page is hidden or unloaded.
 * The next time the design opens, the journal is recovered and saved.
 */
import type { DocumentSnapshot } from '@opencanvas/core';

const PREFIX = 'opencanvas:journal:';

export interface JournalEntry {
  designId: string;
  /** Stored revision the unsaved edits are based on. */
  baseRevision: number;
  writtenAt: number;
  snapshot: DocumentSnapshot;
}

/** Writes synchronously; returns false when storage is unavailable or full. */
export function writeJournal(entry: JournalEntry): boolean {
  try {
    localStorage.setItem(PREFIX + entry.designId, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

export function readJournal(designId: string): JournalEntry | null {
  try {
    const raw = localStorage.getItem(PREFIX + designId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as JournalEntry;
    return entry && entry.designId === designId && entry.snapshot ? entry : null;
  } catch {
    return null;
  }
}

export function clearJournal(designId: string): void {
  try {
    localStorage.removeItem(PREFIX + designId);
  } catch {
    // storage unavailable: nothing to clear
  }
}
