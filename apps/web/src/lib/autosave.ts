/**
 * Autosave: local change → immediate (debounced) IndexedDB write, never
 * during a drag, flushed when the tab is hidden. Saves use optimistic
 * concurrency, so a second tab can never silently overwrite newer work.
 */
import { serializeDocument } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import { broadcast, onChannelMessage, TAB_ID } from './channel';
import { saveDesign } from './storage/designs';

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

  constructor(
    private readonly editor: Editor,
    private readonly designId: string,
    revision: number,
    private readonly options: { delay?: number; onSaved?: () => void } = {},
  ) {
    this.revision = revision;
    this.cleanup.push(
      editor.store.listen((change) => {
        if (change.source === 'load') return;
        this.markDirty();
      }),
    );
    this.cleanup.push(
      onChannelMessage((m) => {
        if (m.type === 'design-saved' && m.designId === designId && m.revision > this.revision)
          this.setStatus('conflict');
      }),
    );
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    });
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const c of this.cleanup.splice(0)) c();
    this.listeners.clear();
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

  private markDirty(): void {
    if (this.status === 'conflict') return;
    this.dirty = true;
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
          this.setStatus(this.dirty ? 'unsaved' : 'saved');
          this.options.onSaved?.();
        } else if (result.reason === 'conflict') {
          this.setStatus('conflict');
        } else {
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
