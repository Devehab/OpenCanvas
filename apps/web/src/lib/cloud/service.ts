/**
 * Runs cloud sync in the background of every OpenCanvas tab:
 * - asks the local server whether cloud sync is on and the bucket reachable;
 * - syncs shortly after any change, every 20 seconds, when the connection
 *   comes back and when the tab becomes visible;
 * - only one tab syncs at a time (Web Locks), the others follow its results;
 * - tells the app what was downloaded, so lists and open editors update.
 *
 * Offline is a normal state: changes stay on this computer, marked as
 * waiting, and go up on the first round that can reach the bucket.
 */
import { broadcast, type ChannelMessage, onChannelMessage, TAB_ID } from '../channel';
import { getDB } from '../storage/db';
import { OfflineError, type RoundResult, SyncEngine } from './engine';
import { CloudError, HttpRemote, SYNC_HEADERS } from './http-remote';
import { IdbLocal, switchSyncTarget } from './idb-local';
import type { SyncStore } from './keys';

export interface CloudStatus {
  /** off: this computer only. */
  mode: 'unknown' | 'off' | 'cloud';
  state: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  /** Records ("<store>/<key>") saved on this computer only, waiting to go up. */
  pending: ReadonlySet<string>;
  lastSyncedAt: number | null;
  error: string | null;
  provider: string | null;
  bucket: string | null;
  /** Finished sync attempts in this tab (lets tests and the UI tell rounds apart). */
  rounds: number;
}

const LAST_SYNC_KEY = 'opencanvas-last-cloud-sync';

const INITIAL: CloudStatus = {
  mode: 'unknown',
  state: 'idle',
  pending: new Set(),
  lastSyncedAt: null,
  error: null,
  provider: null,
  bucket: null,
  rounds: 0,
};

const CHANGE_MESSAGES = new Set<ChannelMessage['type']>([
  'design-saved',
  'designs-changed',
  'uploads-changed',
  'folders-changed',
  'brands-changed',
  'fonts-changed',
  'icons-changed',
  'plugins-changed',
]);

const PULL_MESSAGES: Record<SyncStore, ChannelMessage['type'] | null> = {
  folders: 'folders-changed',
  brands: 'brands-changed',
  fonts: 'fonts-changed',
  iconPacks: 'icons-changed',
  plugins: 'plugins-changed',
  assets: 'uploads-changed',
  designs: 'designs-changed',
};

export class CloudSyncService {
  private status: CloudStatus = INITIAL;
  private readonly listeners = new Set<() => void>();
  private engine: SyncEngine | null = null;
  private target: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private cleanup: (() => void)[] = [];
  private stopped = false;
  /** Set while this service announces its own downloads (not local edits to upload). */
  private announcing = false;

  constructor(private readonly options: { conflictTitle: (title: string) => string }) {}

  get current(): CloudStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<CloudStatus>): void {
    if (patch.lastSyncedAt) {
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(patch.lastSyncedAt));
      } catch {
        // Storage blocked: only this tab remembers it.
      }
    }
    this.status = { ...this.status, ...patch };
    for (const l of [...this.listeners]) l();
  }

  start(): void {
    try {
      const last = Number(localStorage.getItem(LAST_SYNC_KEY));
      if (last > 0) this.status = { ...this.status, lastSyncedAt: last };
    } catch {
      // Storage blocked.
    }
    const onOnline = () => this.syncSoon(0);
    const onOffline = () => void this.refreshPending('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.syncSoon(500);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    this.cleanup.push(
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
      onChannelMessage((m) => {
        if (m.type === 'cloud-synced') void this.refreshPending();
        else if (CHANGE_MESSAGES.has(m.type) && !this.announcing) this.syncSoon(1500);
      }),
    );
    this.syncSoon(0);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.debounce);
    for (const c of this.cleanup.splice(0)) c();
  }

  /** Syncs after `delay` ms (merging calls made meanwhile). */
  syncSoon(delay = 1500): void {
    if (this.stopped) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(), delay);
  }

  private scheduleNext(ms: number): void {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => void this.syncNow(), ms);
  }

  /** Checks the server's settings; creates the engine when cloud sync is on. */
  private async connect(): Promise<{ online: boolean } | null> {
    let body: {
      enabled: boolean;
      online?: boolean;
      deviceId?: string;
      provider?: string;
      bucket?: string;
      target?: string;
    };
    try {
      const res = await fetch('/api/cloud/status', { headers: SYNC_HEADERS, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      body = await res.json();
    } catch {
      // The local server itself is unreachable (stopped?): keep the last known mode.
      return this.status.mode === 'cloud' ? { online: false } : null;
    }
    if (!body.enabled) {
      this.engine = null;
      this.set({ mode: 'off', state: 'idle', pending: new Set(), error: null });
      return null;
    }
    if (body.target && body.target !== this.target) {
      await switchSyncTarget(body.target);
      this.target = body.target;
      this.engine = null;
    }
    this.engine ??= new SyncEngine(new IdbLocal(), new HttpRemote(), {
      deviceId: body.deviceId ?? 'device',
      conflictTitle: this.options.conflictTitle,
    });
    this.set({ mode: 'cloud', provider: body.provider ?? null, bucket: body.bucket ?? null });
    return { online: !!body.online && navigator.onLine !== false };
  }

  private async refreshPending(state?: CloudStatus['state']): Promise<void> {
    if (!this.engine) return;
    const pending = await this.engine.pending();
    this.set({ pending, ...(state ? { state } : {}) });
  }

  /** One sync round now (skipped when another tab is syncing). */
  async syncNow(): Promise<void> {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const link = await this.connect();
    if (!link) {
      this.scheduleNext(60_000);
      return;
    }
    if (!link.online) {
      await this.refreshPending('offline');
      this.set({ rounds: this.status.rounds + 1 });
      this.scheduleNext(10_000);
      return;
    }
    this.set({ state: 'syncing' });
    let result: RoundResult | null = null;
    try {
      const run = () => this.engine!.sync();
      result = navigator.locks
        ? await navigator.locks.request('opencanvas-cloud-sync', { ifAvailable: true }, (lock) =>
            lock ? run() : null,
          )
        : await run();
    } catch (error) {
      const offline = error instanceof OfflineError;
      await this.refreshPending();
      this.set({
        state: offline ? 'offline' : 'error',
        error: offline ? null : error instanceof CloudError ? error.message : (error as Error).message,
        rounds: this.status.rounds + 1,
      });
      this.scheduleNext(offline ? 10_000 : 30_000);
      return;
    }
    if (!result) {
      // Another tab is syncing; its results arrive as a message.
      await this.refreshPending('synced');
      this.set({ rounds: this.status.rounds + 1 });
      this.scheduleNext(20_000);
      return;
    }
    await this.announce(result);
    const failed = result.errors.size > 0;
    this.set({
      pending: result.pending,
      state: result.offline ? 'offline' : failed ? 'error' : 'synced',
      error: failed ? [...result.errors.values()][0]! : null,
      lastSyncedAt: result.offline ? this.status.lastSyncedAt : Date.now(),
      rounds: this.status.rounds + 1,
    });
    this.scheduleNext(result.offline ? 10_000 : 20_000);
  }

  /** Tells every tab (this one included) what was downloaded. */
  private async announce(result: RoundResult): Promise<void> {
    if (result.pulled.size > 0) {
      this.announcing = true;
      const db = await getDB();
      for (const [store, keys] of result.pulled) {
        if (store === 'designs') {
          for (const designId of keys) {
            const record = await db.get('designs', designId);
            if (record)
              broadcast(
                { type: 'design-saved', designId, revision: record.revision, tabId: TAB_ID },
                { self: true },
              );
          }
        }
        const type = PULL_MESSAGES[store];
        if (type) broadcast({ type, tabId: TAB_ID } as ChannelMessage, { self: true });
      }
      this.announcing = false;
    }
    broadcast({ type: 'cloud-synced', tabId: TAB_ID });
  }
}
