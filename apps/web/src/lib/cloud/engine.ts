/**
 * Offline-first cloud sync: this computer's IndexedDB stays the working copy,
 * and the bucket is kept in step with it.
 *
 * Every record (a design, an upload, a folder, a brand kit, a font…) is
 * compared three ways: what this computer has now, what the bucket has now,
 * and what both had at the last sync (kept per record in SyncState).
 *
 *   changed here only   → upload          changed there only → download
 *   deleted here only   → delete there    deleted there only → delete here
 *   changed on both     → designs: keep both (the older one becomes a copy);
 *                         anything else: the newest wins
 *   deleted on one side, edited on the other → the edit wins (nothing lost)
 *
 * Writes to the bucket are conditional (If-Match on the version we saw), so
 * two computers syncing at once can never overwrite each other: the loser
 * sees a newer version on its next round and merges. Local writes check the
 * record did not change since it was read. With no connection a round stops
 * at once, and everything changed meanwhile simply stays "pending" until a
 * later round can upload it.
 */
import { changedAt as recordChangedAt } from './fingerprint';
import { parseRecordPath, recordPath, SYNC_STORES, type SyncStore } from './keys';
import { fromCloudValue, toCloudValue } from './serialize';

/** A record's state in the bucket: its content, or a deletion marker. */
export interface CloudDoc {
  v: 1;
  store: SyncStore;
  key: string;
  deleted: boolean;
  /** When the record last changed (ms), for "newest wins". */
  updatedAt: number;
  /** The computer that wrote it. */
  device: string;
  /** Fingerprint of the content (null for deletions). */
  fp: string | null;
  value?: unknown;
}

/** What both sides had at the last successful sync of one record. */
export interface SyncState {
  /** "<store>/<key>" */
  id: string;
  store: SyncStore;
  key: string;
  /** Local fingerprint then (null: the record was absent/deleted). */
  localFp: string | null;
  /** Bucket version (ETag) then (null: absent). */
  remoteEtag: string | null;
}

export interface LocalEntry {
  store: SyncStore;
  key: string;
  fp: string;
}

export interface LocalRecord extends LocalEntry {
  value: Record<string, unknown>;
  changedAt: number;
}

export interface LocalSide {
  /** Fingerprint of every local record (cheap: no file contents are read). */
  scan(): Promise<LocalEntry[]>;
  read(store: SyncStore, key: string): Promise<LocalRecord | null>;
  /** Writes the record if it still has `expectedFp` (null: absent). New fingerprint, or null if it changed. */
  write(store: SyncStore, key: string, value: unknown, expectedFp: string | null): Promise<string | null>;
  /** Deletes the record if it still has `expectedFp`. False if it changed. */
  remove(store: SyncStore, key: string, expectedFp: string): Promise<boolean>;
  /** Stores a record under a new key (a conflict copy of a design). */
  addCopy(store: SyncStore, value: Record<string, unknown>): Promise<string>;
  states(): Promise<SyncState[]>;
  setState(state: SyncState): Promise<void>;
  deleteState(id: string): Promise<void>;
  /** Whether a file was already uploaded (so it is not checked again). */
  blobUploaded(hash: string): Promise<boolean>;
  markBlobUploaded(hash: string): Promise<void>;
}

export interface RemoteSide {
  /** Every record path in the bucket with its version. */
  list(): Promise<Map<string, string>>;
  get(path: string): Promise<{ doc: CloudDoc; etag: string } | null>;
  put(
    path: string,
    doc: CloudDoc,
    condition: { ifMatch?: string; ifNoneMatch?: boolean },
  ): Promise<{ ok: true; etag: string } | { ok: false }>;
  hasBlob(hash: string): Promise<boolean>;
  putBlob(hash: string, blob: Blob): Promise<void>;
  getBlob(hash: string, type: string): Promise<Blob>;
}

/** The bucket (or this computer's link to it) cannot be reached. */
export class OfflineError extends Error {
  constructor(message = 'The cloud cannot be reached') {
    super(message);
    this.name = 'OfflineError';
  }
}

export interface RoundResult {
  offline: boolean;
  uploaded: number;
  downloaded: number;
  /** Designs changed on both sides and kept as two designs. */
  conflicts: number;
  /** Records that changed locally and are not in the bucket yet. */
  pending: Set<string>;
  /** Records written locally from the bucket, by store. */
  pulled: Map<SyncStore, Set<string>>;
  /** Records that failed for another reason (they are retried next round). */
  errors: Map<string, string>;
}

export interface EngineOptions {
  deviceId: string;
  /** Title of the copy kept when a design changed on two computers. */
  conflictTitle?: (title: string) => string;
  now?: () => number;
}

export const recordId = (store: SyncStore, key: string) => `${store}/${key}`;

const STORE_ORDER = new Map<string, number>(SYNC_STORES.map((s, i) => [s, i]));

export class SyncEngine {
  private running: Promise<RoundResult> | null = null;

  constructor(
    private readonly local: LocalSide,
    private readonly remote: RemoteSide,
    private readonly options: EngineOptions,
  ) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Records changed locally since their last sync (or never synced). */
  async pending(): Promise<Set<string>> {
    const [entries, states] = await Promise.all([this.local.scan(), this.local.states()]);
    return pendingOf(entries, new Map(states.map((s) => [s.id, s])));
  }

  /** One sync round. Concurrent calls share the same round. */
  sync(): Promise<RoundResult> {
    this.running ??= this.round().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async round(): Promise<RoundResult> {
    const result: RoundResult = {
      offline: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      pending: new Set(),
      pulled: new Map(),
      errors: new Map(),
    };
    const [entries, stateList] = await Promise.all([this.local.scan(), this.local.states()]);
    const local = new Map(entries.map((e) => [recordId(e.store, e.key), e]));
    const states = new Map(stateList.map((s) => [s.id, s]));
    let remote: Map<string, string>;
    try {
      remote = new Map();
      for (const [path, etag] of await this.remote.list()) {
        const parsed = parseRecordPath(path);
        if (parsed) remote.set(recordId(parsed.store, parsed.key), etag);
      }
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;
      result.offline = true;
      result.pending = pendingOf(entries, states);
      return result;
    }

    const ids = [...new Set([...local.keys(), ...states.keys(), ...remote.keys()])].sort((a, b) => {
      const sa = STORE_ORDER.get(a.slice(0, a.indexOf('/'))) ?? 99;
      const sb = STORE_ORDER.get(b.slice(0, b.indexOf('/'))) ?? 99;
      return sa - sb || (a < b ? -1 : 1);
    });
    for (const id of ids) {
      const slash = id.indexOf('/');
      const store = id.slice(0, slash) as SyncStore;
      const key = id.slice(slash + 1);
      try {
        await this.syncOne(
          store,
          key,
          local.get(id) ?? null,
          states.get(id) ?? null,
          remote.get(id) ?? null,
          result,
        );
      } catch (error) {
        if (error instanceof OfflineError) {
          result.offline = true;
          break;
        }
        result.errors.set(id, (error as Error).message);
      }
    }
    result.pending = await this.pending();
    return result;
  }

  private async syncOne(
    store: SyncStore,
    key: string,
    local: LocalEntry | null,
    state: SyncState | null,
    remoteEtag: string | null,
    result: RoundResult,
  ): Promise<void> {
    const localFp = local?.fp ?? null;
    const localChanged = state ? localFp !== state.localFp : local !== null;
    const remoteChanged = state ? remoteEtag !== state.remoteEtag : remoteEtag !== null;
    if (!localChanged && !remoteChanged) return;
    if (localChanged && !remoteChanged) return this.push(store, key, remoteEtag, result);
    if (!localChanged && remoteChanged) {
      // The object vanished from the bucket (removed by hand): upload ours again.
      if (remoteEtag === null) return local ? this.push(store, key, null, result) : this.forget(store, key);
      return this.pull(store, key, localFp, result);
    }
    return this.merge(store, key, local, remoteEtag, result);
  }

  private async forget(store: SyncStore, key: string): Promise<void> {
    await this.local.deleteState(recordId(store, key));
  }

  /** Uploads the local record (or a deletion marker), only over version `remoteEtag`. */
  private async push(store: SyncStore, key: string, remoteEtag: string | null, result: RoundResult) {
    const id = recordId(store, key);
    const record = await this.local.read(store, key);
    let doc: CloudDoc;
    if (record) {
      const { value, blobs } = await toCloudValue(record.value);
      for (const [hash, blob] of blobs) {
        if (await this.local.blobUploaded(hash)) continue;
        if (!(await this.remote.hasBlob(hash))) await this.remote.putBlob(hash, blob);
        await this.local.markBlobUploaded(hash);
      }
      doc = {
        v: 1,
        store,
        key,
        deleted: false,
        updatedAt: record.changedAt,
        device: this.options.deviceId,
        fp: record.fp,
        value,
      };
    } else {
      // Deleted here. Nothing to tell the bucket if it never had it.
      if (remoteEtag === null) return this.forget(store, key);
      doc = {
        v: 1,
        store,
        key,
        deleted: true,
        updatedAt: this.now(),
        device: this.options.deviceId,
        fp: null,
      };
    }
    const put = await this.remote.put(
      recordPath(store, key),
      doc,
      remoteEtag ? { ifMatch: remoteEtag } : { ifNoneMatch: true },
    );
    // Another computer wrote first: the next round sees its version and merges.
    if (!put.ok) return;
    await this.local.setState({ id, store, key, localFp: record?.fp ?? null, remoteEtag: put.etag });
    result.uploaded++;
  }

  /** Applies the bucket's version locally, if the local record is still `expectedFp`. */
  private async pull(
    store: SyncStore,
    key: string,
    expectedFp: string | null,
    result: RoundResult,
    fetched?: { doc: CloudDoc; etag: string },
  ) {
    const got = fetched ?? (await this.remote.get(recordPath(store, key)));
    if (!got) return;
    const id = recordId(store, key);
    let newFp: string | null = null;
    if (got.doc.deleted) {
      if (expectedFp !== null && !(await this.local.remove(store, key, expectedFp))) return;
    } else {
      const value = await fromCloudValue(got.doc.value, (hash, type) => this.remote.getBlob(hash, type));
      newFp = await this.local.write(store, key, value, expectedFp);
      // Changed here meanwhile: merged next round.
      if (newFp === null) return;
    }
    await this.local.setState({ id, store, key, localFp: newFp, remoteEtag: got.etag });
    if (!result.pulled.has(store)) result.pulled.set(store, new Set());
    result.pulled.get(store)!.add(key);
    result.downloaded++;
  }

  /** Both sides changed since the last sync. */
  private async merge(
    store: SyncStore,
    key: string,
    local: LocalEntry | null,
    remoteEtag: string | null,
    result: RoundResult,
  ) {
    const id = recordId(store, key);
    const got = remoteEtag ? await this.remote.get(recordPath(store, key)) : null;
    const remoteDoc = got && !got.doc.deleted ? got.doc : null;

    // Both deleted, or both now identical: just remember that they agree.
    if (!local && !remoteDoc) {
      if (got) await this.local.setState({ id, store, key, localFp: null, remoteEtag: got.etag });
      else await this.forget(store, key);
      return;
    }
    if (local && remoteDoc && remoteDoc.fp === local.fp) {
      await this.local.setState({ id, store, key, localFp: local.fp, remoteEtag: got!.etag });
      return;
    }
    // Deleted on one side, edited on the other: keep the edit.
    if (!local) return this.pull(store, key, null, result, got!);
    if (!remoteDoc) return this.push(store, key, got?.etag ?? null, result);

    const record = await this.local.read(store, key);
    if (!record) return;
    const remoteNewer = remoteDoc.updatedAt > record.changedAt;
    if (store === 'designs') {
      // Never lose a design: the older version is kept as a copy.
      result.conflicts++;
      if (remoteNewer) {
        await this.local.addCopy(store, this.asCopy(record.value));
        return this.pull(store, key, record.fp, result, got!);
      }
      const theirs = (await fromCloudValue(remoteDoc.value, (h, t) => this.remote.getBlob(h, t))) as Record<
        string,
        unknown
      >;
      await this.local.addCopy(store, this.asCopy(theirs));
      return this.push(store, key, got!.etag, result);
    }
    if (remoteNewer) return this.pull(store, key, record.fp, result, got!);
    return this.push(store, key, got!.etag, result);
  }

  private asCopy(value: Record<string, unknown>): Record<string, unknown> {
    const title = typeof value.title === 'string' ? value.title : 'Untitled design';
    const copyTitle = this.options.conflictTitle?.(title) ?? `${title} (conflict copy)`;
    return { ...value, title: copyTitle, updatedAt: Math.max(recordChangedAt(value), 0) };
  }
}

function pendingOf(entries: LocalEntry[], states: Map<string, SyncState>): Set<string> {
  const pending = new Set<string>();
  const seen = new Set<string>();
  for (const e of entries) {
    const id = recordId(e.store, e.key);
    seen.add(id);
    const s = states.get(id);
    if (!s || s.localFp !== e.fp) pending.add(id);
  }
  // Deleted here, not yet deleted there.
  for (const [id, s] of states) if (!seen.has(id) && s.localFp !== null) pending.add(id);
  return pending;
}
