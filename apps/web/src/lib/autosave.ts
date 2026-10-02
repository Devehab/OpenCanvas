/**
 * Autosave: local change → debounced IndexedDB write, never during a drag,
 * flushed when the tab is hidden. Because a tab can close before an
 * asynchronous write finishes, unsaved edits are also journaled
 * synchronously on hide/unload (see ./journal) and recovered on next open.
 *
 * Saves use optimistic concurrency, so a second tab can never silently
 * overwrite newer work: a tab without local edits follows the other tab's
 * saves in place, and a tab with local edits reports a conflict instead.
 */
import { parseDocument, serializeDocument } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import { broadcast, onChannelMessage, TAB_ID } from './channel';
import { clearJournal, writeJournal } from './journal';
import { getDesign, saveDesign } from './storage/designs';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';

export class Autosave {
  status: SaveStatus = 'saved';
  private revision: number;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: (() => void)[] = [];
  private retryDelay = 1000;
  /** Newest revision another tab announced for this design. */
  private remoteRevision = 0;
  private following = false;
  private discarded = false;

  constructor(
    private readonly editor: Editor,
    private readonly designId: string,
    revision: number,
    private readonly options: { delay?: number; onSaved?: () => void } = {},
  ) {
    this.revision = revision;
    this.cleanup.push(
      editor.store.listen((change) => {
        // Loading and following another tab's save are not local edits.
        if (change.source === 'load' || change.source === 'remote') return;
        this.markDirty();
      }),
    );
    this.cleanup.push(
      onChannelMessage((m) => {
        if (m.type !== 'design-saved' || m.designId !== designId) return;
        this.remoteRevision = Math.max(this.remoteRevision, m.revision);
        if (m.revision > this.revision) void this.followRemote();
      }),
    );
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.persistNow();
    };
    const onPageHide = () => this.persistNow();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Last resort when the journal cannot be written (storage full or blocked).
      if (this.hasUnsavedChanges && !this.journal()) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    });
  }

  /** Stops saving. Unsaved edits are journaled first, then written if the page stays alive. */
  dispose(): void {
    clearTimeout(this.timer);
    this.persistNow();
    for (const c of this.cleanup.splice(0)) c();
    this.listeners.clear();
  }

  /** Forgets local edits (the user chose the other tab's version). */
  discardLocalChanges(): void {
    clearTimeout(this.timer);
    this.dirty = false;
    this.discarded = true;
    clearJournal(this.designId);
  }

  /** Marks the current state as unsaved, e.g. after recovering a journal. */
  markRecovered(): void {
    this.markDirty();
  }

  /** Journals unsaved edits synchronously, then starts the asynchronous write. */
  private persistNow(): void {
    if (this.discarded) return;
    if (this.hasUnsavedChanges) this.journal();
    void this.flush();
  }

  /** Synchronously records the current document for crash recovery. */
  private journal(): boolean {
    return writeJournal({
      designId: this.designId,
      baseRevision: this.revision,
      writtenAt: Date.now(),
      snapshot: serializeDocument(this.editor.store),
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private currentStatus(): SaveStatus {
    return this.status;
  }

  private setStatus(status: SaveStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const l of [...this.listeners]) l();
  }

  /** Revision of the last version this tab wrote or loaded. */
  get savedRevision(): number {
    return this.revision;
  }

  /** Whether local edits are waiting to be written (they are kept during a conflict). */
  get hasUnsavedChanges(): boolean {
    return this.dirty || this.saving !== null;
  }

  private canFollowRemote(): boolean {
    return (
      !this.dirty &&
      !this.saving &&
      this.status !== 'conflict' &&
      !this.editor.isGesturing &&
      !this.editor.editingTextId
    );
  }

  /** Loads newer revisions saved by another tab, or reports a conflict. */
  private async followRemote(): Promise<void> {
    if (this.following) return;
    this.following = true;
    try {
      while (this.remoteRevision > this.revision) {
        if (!this.canFollowRemote()) {
          this.setStatus('conflict');
          return;
        }
        const record = await getDesign(this.designId);
        if (!record || record.revision <= this.revision) return;
        // Local edits may have happened while reading.
        if (!this.canFollowRemote()) {
          this.setStatus('conflict');
          return;
        }
        const { snapshot } = parseDocument(record.snapshot);
        this.editor.store.replaceAll(snapshot.records, 'remote');
        // Undo steps refer to the replaced state.
        this.editor.history.clear();
        this.revision = record.revision;
      }
    } catch {
      this.setStatus('conflict');
    } finally {
      this.following = false;
    }
  }

  private markDirty(): void {
    if (this.discarded) return;
    this.dirty = true;
    // During a conflict edits are tracked (to keep them as a copy) but never written.
    if (this.status === 'conflict') return;
    this.setStatus('unsaved');
    this.schedule(this.options.delay ?? 400);
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // Never write in the middle of a drag; try again shortly.
      if (this.editor.isGesturing && !this.editor.editingTextId) this.schedule(250);
      else void this.flush();
    }, delay);
  }

  /** Writes pending changes now. */
  async flush(): Promise<void> {
    if (this.saving) await this.saving;
    if (!this.dirty || this.status === 'conflict') return;
    this.dirty = false;
    this.setStatus('saving');
    this.saving = (async () => {
      try {
        const result = await saveDesign(this.designId, serializeDocument(this.editor.store), this.revision);
        if (result.ok) {
          this.revision = result.revision;
          this.retryDelay = 1000;
          broadcast({
            type: 'design-saved',
            designId: this.designId,
            revision: result.revision,
            tabId: TAB_ID,
          });
          // Everything journaled is now stored (unless newer edits arrived meanwhile).
          if (!this.dirty) clearJournal(this.designId);
          this.setStatus(this.dirty ? 'unsaved' : 'saved');
          this.options.onSaved?.();
        } else if (result.reason === 'conflict') {
          // The edits were not written; keep them so they can be saved as a copy.
          this.dirty = true;
          this.setStatus('conflict');
        } else {
          // Not written (e.g. the design was deleted elsewhere): keep the edits journaled.
          this.dirty = true;
          this.setStatus('error');
        }
      } catch {
        this.dirty = true;
        this.setStatus('error');
        this.schedule(this.retryDelay);
        this.retryDelay = Math.min(30_000, this.retryDelay * 2);
      } finally {
        this.saving = null;
      }
    })();
    await this.saving;
    if (this.dirty && this.currentStatus() !== 'conflict') this.schedule(this.options.delay ?? 400);
  }
}
