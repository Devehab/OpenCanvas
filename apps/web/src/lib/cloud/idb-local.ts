/**
 * The sync engine's view of this browser's IndexedDB (see engine.ts).
 */
import { createRandomIdGenerator } from '@opencanvas/core';
import { getDB } from '../storage/db';
import type { LocalEntry, LocalRecord, LocalSide, SyncState } from './engine';
import { changedAt, fingerprint } from './fingerprint';
import { SYNC_STORES, type SyncStore } from './keys';

const KEY_PATH: Record<SyncStore, string> = {
  folders: 'id',
  brands: 'id',
  fonts: 'id',
  iconPacks: 'id',
  plugins: 'id',
  assets: 'hash',
  designs: 'id',
};

const newId = createRandomIdGenerator();

type AnyRecord = Record<string, unknown>;

/** A design record renamed (title in the record and in its document). */
function retitleDesign(value: AnyRecord, title: string): AnyRecord {
  const snapshot = value.snapshot as { records?: AnyRecord[] } | undefined;
  return {
    ...value,
    title,
    snapshot: snapshot?.records
      ? {
          ...snapshot,
          records: snapshot.records.map((r) => (r.typeName === 'document' ? { ...r, title } : r)),
        }
      : snapshot,
  };
}

const TARGET_ID = '__target__';

/**
 * Forgets what was synced when the library changed (another bucket or
 * folder), so everything is compared and uploaded again.
 */
export async function switchSyncTarget(target: string): Promise<void> {
  const db = await getDB();
  const current = await db.get('syncState', TARGET_ID);
  if (current?.key === target) return;
  const tx = db.transaction(['syncState', 'syncBlobs'], 'readwrite');
  await tx.objectStore('syncState').clear();
  await tx.objectStore('syncBlobs').clear();
  await tx
    .objectStore('syncState')
    .put({ id: TARGET_ID, store: 'meta', key: target, localFp: null, remoteEtag: null });
  await tx.done;
}

export class IdbLocal implements LocalSide {
  async scan(): Promise<LocalEntry[]> {
    const db = await getDB();
    const entries: LocalEntry[] = [];
    for (const store of SYNC_STORES) {
      for (const value of (await db.getAll(store)) as unknown as AnyRecord[]) {
        const key = value[KEY_PATH[store]];
        if (typeof key === 'string') entries.push({ store, key, fp: fingerprint(store, value) });
      }
    }
    return entries;
  }

  async read(store: SyncStore, key: string): Promise<LocalRecord | null> {
    const value = (await (await getDB()).get(store, key)) as unknown as AnyRecord | undefined;
    if (!value) return null;
    return { store, key, value, fp: fingerprint(store, value), changedAt: changedAt(value) };
  }

  async write(
    store: SyncStore,
    key: string,
    incoming: unknown,
    expectedFp: string | null,
  ): Promise<string | null> {
    const db = await getDB();
    const tx = db.transaction(store, 'readwrite');
    const current = (await tx.store.get(key)) as unknown as AnyRecord | undefined;
    if ((current ? fingerprint(store, current) : null) !== expectedFp) {
      await tx.done;
      return null;
    }
    let value: AnyRecord = { ...(incoming as AnyRecord), [KEY_PATH[store]]: key };
    if (store === 'designs') {
      // A new local revision, so open editors notice and load it (or offer to keep their edits).
      value = { ...value, revision: ((current?.revision as number | undefined) ?? 0) + 1 };
    }
    await tx.store.put(value as never);
    await tx.done;
    return fingerprint(store, value);
  }

  async remove(store: SyncStore, key: string, expectedFp: string): Promise<boolean> {
    const db = await getDB();
    const tx = db.transaction(store, 'readwrite');
    const current = (await tx.store.get(key)) as unknown as AnyRecord | undefined;
    if (!current || fingerprint(store, current) !== expectedFp) {
      await tx.done;
      return false;
    }
    await tx.store.delete(key);
    await tx.done;
    if (store === 'designs') await db.delete('thumbnails', key);
    return true;
  }

  async addCopy(store: SyncStore, value: AnyRecord): Promise<string> {
    if (store !== 'designs') throw new Error(`Copies of ${store} are not supported`);
    const id = newId('design');
    const now = Date.now();
    const copy = retitleDesign(
      { ...value, id, revision: 1, createdAt: now, updatedAt: now },
      String(value.title ?? 'Untitled design'),
    );
    await (await getDB()).put('designs', copy as never);
    return id;
  }

  async states(): Promise<SyncState[]> {
    return ((await (await getDB()).getAll('syncState')) as SyncState[]).filter((s) => s.id !== TARGET_ID);
  }

  async setState(state: SyncState): Promise<void> {
    await (await getDB()).put('syncState', state);
  }

  async deleteState(id: string): Promise<void> {
    await (await getDB()).delete('syncState', id);
  }

  async blobUploaded(hash: string): Promise<boolean> {
    return !!(await (await getDB()).get('syncBlobs', hash));
  }

  async markBlobUploaded(hash: string): Promise<void> {
    await (await getDB()).put('syncBlobs', { hash, at: Date.now() });
  }
}
