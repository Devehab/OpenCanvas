/**
 * Runs cloud sync in the background of every OpenCanvas tab.
 *
 * Saving happens in two steps, and the status shows both: every change is
 * saved on this computer at once, and goes up to the cloud once editing
 * pauses (3 seconds without changes, or at the latest a minute after the
 * first one). Dragging, typing or switching pages never uploads anything
 * by itself, and files are uploaded once, whatever uses them.
 *
 * Looking for changes made on other computers is cheap: every computer that
 * uploads rewrites a tiny change marker, and the others compare the whole
 * bucket only when it changed (and every few minutes, to be sure). While
 * nobody else changed anything, uploads skip the comparison too.
 *
 * Only one tab syncs at a time (Web Locks); the others follow its results.
 * Offline is a normal state: changes stay on this computer, marked as
 * waiting, and go up on the first round that can reach the bucket.
 */
import { broadcast, type ChannelMessage, onAnyMessage, TAB_ID } from '../channel';
import { getDB } from '../storage/db';
import { OfflineError, type RoundResult, SyncEngine, type SyncProgress } from './engine';
import { CloudError, HttpRemote, SYNC_HEADERS } from './http-remote';
import { IdbLocal, switchSyncTarget } from './idb-local';
import type { SyncStore } from './keys';

export interface CloudStatus {
  /** off: this computer only. */
  mode: 'unknown' | 'off' | 'cloud';
  /**
   * waiting: changed here and not uploaded yet (it goes up once editing
   * pauses); syncing: uploading or downloading now; synced: the cloud has
   * everything this computer has.
   */
  state: 'idle' | 'waiting' | 'syncing' | 'synced' | 'offline' | 'error';
  /** Records ("<store>/<key>") saved on this computer only, waiting to go up. */
  pending: ReadonlySet<string>;
  /** While syncing: how far the round is. */
  progress: SyncProgress | null;
  lastSyncedAt: number | null;
  error: string | null;
  provider: string | null;
  bucket: string | null;
  /** Finished sync checks in this tab (lets tests and the UI tell rounds apart). */
  rounds: number;
}

/** Upload once editing pauses this long… */
export const IDLE_MS = 3000;
/** …or at the latest this long after the first change not uploaded yet. */
export const MAX_WAIT_MS = 60_000;
/** How often to check for changes made on other computers. */
const POLL_MS = 20_000;
const POLL_HIDDEN_MS = 60_000;
const OFFLINE_RETRY_MS = 10_000;
const ERROR_RETRY_MS = 30_000;
/** Compare the whole bucket at least this often, even when the marker did not change. */
const FULL_EVERY_MS = 5 * 60_000;

const LAST_SYNC_KEY = 'opencanvas-last-cloud-sync';
/** What the tabs of this browser have seen of the bucket (shared, so they do not each compare it). */
const SEEN_KEY = 'opencanvas-cloud-seen';

interface Seen {
  target: string;
  /** Version of the change marker caught up with (null: absent); undefined: unknown. */
  marker?: string | null;
  /** When the bucket was last compared in full. */
  fullAt: number;
}

type Reason = 'start' | 'manual' | 'online' | 'local' | 'retry' | 'poll';
/** Stronger reasons win when checks pile up. */
const STRENGTH: Record<Reason, number> = { poll: 0, retry: 1, local: 2, online: 3, start: 4, manual: 5 };

const INITIAL: CloudStatus = {
  mode: 'unknown',
  state: 'idle',
  pending: new Set(),
  progress: null,
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
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private uploadTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanup: (() => void)[] = [];
  private stopped = false;
  /** Set while this service announces its own downloads (not local edits to upload). */
  private announcing = false;
  /** When the first change not uploaded yet was made (null: none). */
  private dirtySince: number | null = null;
  private lastChangeAt = 0;
  private changeSeq = 0;
  /** The last upload was refused (the bucket had a newer version): compare in full. */
  private needsFull = false;
  private retryDelay = 1000;
  private checking = false;
  private queued: Reason | null = null;

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
    const onOnline = () => void this.check('online');
    const onOffline = () => void this.refreshPending('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.later('poll', 500);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    this.cleanup.push(
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
      // Changes saved by any tab, this one included.
      onAnyMessage((m) => {
        if (m.type === 'cloud-synced') {
          if (m.tabId !== TAB_ID) void this.refreshPending();
        } else if (CHANGE_MESSAGES.has(m.type) && !this.announcing && !m.fromCloud) this.localChange(m);
      }),
    );
    void this.check('start');
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.uploadTimer);
    for (const c of this.cleanup.splice(0)) c();
  }

  /** "Sync now": compares the whole bucket and uploads everything waiting. */
  syncNow(): Promise<void> {
    return this.check('manual');
  }

  /** Something was saved on this computer: show it as waiting, upload once editing pauses. */
  private localChange(m: ChannelMessage): void {
    const now = Date.now();
    this.changeSeq++;
    this.lastChangeAt = now;
    this.dirtySince ??= now;
    if (this.status.mode === 'cloud') {
      const pending = new Set(this.status.pending);
      if (m.type === 'design-saved') pending.add(`designs/${m.designId}`);
      const state = this.status.state;
      this.set({
        pending,
        state: state === 'offline' || state === 'error' || state === 'syncing' ? state : 'waiting',
      });
    }
    this.scheduleUpload();
  }

  private scheduleUpload(): void {
    if (this.stopped || this.dirtySince === null) return;
    const now = Date.now();
    const at = Math.min(this.lastChangeAt + IDLE_MS, this.dirtySince + MAX_WAIT_MS);
    clearTimeout(this.uploadTimer);
    this.uploadTimer = setTimeout(() => void this.check('local'), Math.max(0, at - now));
  }

  private later(reason: Reason, ms: number): void {
    clearTimeout(this.pollTimer);
    if (!this.stopped) this.pollTimer = setTimeout(() => void this.check(reason), ms);
  }

  private schedulePoll(ms?: number): void {
    this.later('poll', ms ?? (document.visibilityState === 'hidden' ? POLL_HIDDEN_MS : POLL_MS));
  }

  /** Runs one check; checks asked for meanwhile run after it (the strongest reason). */
  private async check(reason: Reason): Promise<void> {
    if (this.stopped) return;
    if (this.checking) {
      if (!this.queued || STRENGTH[reason] > STRENGTH[this.queued]) this.queued = reason;
      return;
    }
    this.checking = true;
    try {
      await this.checkOnce(reason);
    } finally {
      this.checking = false;
      const next = this.queued;
      this.queued = null;
      if (next && !this.stopped) await this.check(next);
    }
  }

  /** Checks the server's settings; creates the engine when cloud sync is on. */
  private async connect(): Promise<{ online: boolean; marker: string | null } | null> {
    let body: {
      enabled: boolean;
      online?: boolean;
      marker?: string | null;
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
      return this.status.mode === 'cloud' ? { online: false, marker: null } : null;
    }
    if (!body.enabled) {
      this.engine = null;
      this.set({ mode: 'off', state: 'idle', pending: new Set(), progress: null, error: null });
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
    return { online: !!body.online && navigator.onLine !== false, marker: body.marker ?? null };
  }

  private readSeen(): Seen {
    const none: Seen = { target: this.target ?? '', fullAt: 0 };
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as Seen | null;
      return seen && seen.target === this.target ? seen : none;
    } catch {
      return none;
    }
  }

  private writeSeen(seen: Omit<Seen, 'target'>): void {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen, target: this.target ?? '' }));
    } catch {
      // Storage blocked: this tab compares in full more often.
    }
  }

  /** What to show when nothing is moving. */
  private restingState(pending = this.status.pending): CloudStatus['state'] {
    return pending.size > 0 || this.dirtySince !== null ? 'waiting' : 'synced';
  }

  private async refreshPending(state?: CloudStatus['state']): Promise<void> {
    if (!this.engine) return;
    const pending = await this.engine.pending();
    const current = this.status.state;
    this.set({
      pending,
      state:
        state ??
        (current === 'syncing' || current === 'offline' || current === 'error'
          ? current
          : this.restingState(pending)),
    });
  }

  private async checkOnce(reason: Reason): Promise<void> {
    clearTimeout(this.pollTimer);
    const link = await this.connect();
    if (!link) {
      this.schedulePoll(60_000);
      return;
    }
    if (!link.online) {
      await this.refreshPending('offline');
      this.set({ progress: null, rounds: this.status.rounds + 1 });
      this.schedulePoll(OFFLINE_RETRY_MS);
      return;
    }
    const seen = this.readSeen();
    const remoteChanged = seen.marker === undefined || link.marker !== seen.marker;
    const forced =
      reason === 'start' ||
      reason === 'manual' ||
      reason === 'online' ||
      this.needsFull ||
      this.status.state === 'offline' ||
      this.status.state === 'error';
    const stale = Date.now() - seen.fullAt > FULL_EVERY_MS;
    const uploadDue = reason !== 'poll' && (this.dirtySince !== null || this.status.pending.size > 0);
    const kind = forced || remoteChanged || stale ? 'full' : uploadDue ? 'quick' : null;
    if (!kind) {
      // Nothing new anywhere: no request beyond the marker check.
      this.set({ state: this.restingState(), progress: null, rounds: this.status.rounds + 1 });
      if (this.dirtySince !== null) this.scheduleUpload();
      this.schedulePoll();
      return;
    }
    await this.round(kind, link.marker, seen);
  }

  private async round(kind: 'full' | 'quick', marker: string | null, seen: Seen): Promise<void> {
    const seqAtStart = this.changeSeq;
    const dirtyBefore = this.dirtySince;
    this.dirtySince = null;
    clearTimeout(this.uploadTimer);
    // Uploads show at once; a check that finds nothing to do never flashes "Syncing".
    if (dirtyBefore !== null || this.status.pending.size > 0) this.set({ state: 'syncing', progress: null });
    let result: RoundResult | null = null;
    try {
      const run = () =>
        this.engine!.sync({
          quick: kind === 'quick',
          marker,
          onProgress: (progress) => this.set({ state: 'syncing', progress }),
        });
      result = navigator.locks
        ? await navigator.locks.request('opencanvas-cloud-sync', { ifAvailable: true }, (lock) =>
            lock ? run() : null,
          )
        : await run();
    } catch (error) {
      const offline = error instanceof OfflineError;
      this.restoreDirty(dirtyBefore);
      await this.refreshPending(offline ? 'offline' : 'error');
      this.set({
        progress: null,
        error: offline ? null : error instanceof CloudError ? error.message : (error as Error).message,
        rounds: this.status.rounds + 1,
      });
      this.schedulePoll(offline ? OFFLINE_RETRY_MS : ERROR_RETRY_MS);
      return;
    }
    if (!result) {
      // Another tab is syncing; try again shortly (its results arrive meanwhile).
      this.restoreDirty(dirtyBefore);
      this.set({ state: this.restingState(), progress: null, rounds: this.status.rounds + 1 });
      this.later('retry', 2000);
      return;
    }
    if (result.offline) this.restoreDirty(dirtyBefore);
    else if (this.changeSeq !== seqAtStart) this.dirtySince ??= this.lastChangeAt;
    this.writeSeen({ marker: result.marker, fullAt: result.full ? Date.now() : seen.fullAt });
    await this.announce(result);
    const failed = result.errors.size > 0;
    this.needsFull = result.refused > 0;
    const state = result.offline ? 'offline' : failed ? 'error' : this.restingState(result.pending);
    this.set({
      pending: result.pending,
      progress: null,
      state,
      error: failed ? [...result.errors.values()][0]! : null,
      lastSyncedAt: state === 'synced' ? Date.now() : this.status.lastSyncedAt,
      rounds: this.status.rounds + 1,
    });
    if (result.offline) this.schedulePoll(OFFLINE_RETRY_MS);
    else if (failed) this.schedulePoll(ERROR_RETRY_MS);
    else if (this.dirtySince !== null) {
      this.scheduleUpload();
      this.schedulePoll();
    } else if (this.needsFull || result.pending.size > 0) {
      // Refused (another computer wrote first), or a conflict copy to upload: soon, backing off.
      this.later('retry', this.retryDelay);
      this.retryDelay = Math.min(30_000, this.retryDelay * 2);
    } else {
      this.retryDelay = 1000;
      this.schedulePoll();
    }
  }

  /** Changes a round did not get to upload are still waiting. */
  private restoreDirty(before: number | null): void {
    if (before !== null) this.dirtySince = Math.min(before, this.dirtySince ?? before);
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
                {
                  type: 'design-saved',
                  designId,
                  revision: record.revision,
                  tabId: TAB_ID,
                  fromCloud: true,
                },
                { self: true },
              );
          }
        }
        const type = PULL_MESSAGES[store];
        if (type) broadcast({ type, tabId: TAB_ID, fromCloud: true } as ChannelMessage, { self: true });
      }
      this.announcing = false;
    }
    broadcast({ type: 'cloud-synced', tabId: TAB_ID });
  }
}
