import { beforeEach, describe, expect, it } from 'vitest';
import {
  type CloudDoc,
  type LocalSide,
  OfflineError,
  type RemoteSide,
  recordId,
  SyncEngine,
  type SyncState,
} from '@/lib/cloud/engine';
import { changedAt, fingerprint } from '@/lib/cloud/fingerprint';
import type { SyncStore } from '@/lib/cloud/keys';

/** A bucket shared by several fake computers. */
class FakeBucket implements RemoteSide {
  objects = new Map<string, { doc: CloudDoc; etag: string }>();
  blobs = new Map<string, Blob>();
  offline = false;
  private n = 0;
  /** Runs before each put (to simulate another computer writing in between). */
  beforePut: ((path: string) => void) | null = null;
  puts = 0;

  private check() {
    if (this.offline) throw new OfflineError();
  }
  async list() {
    this.check();
    return new Map([...this.objects].map(([p, o]) => [p, o.etag]));
  }
  async get(path: string) {
    this.check();
    const o = this.objects.get(path);
    return o ? { doc: structuredClone(o.doc), etag: o.etag } : null;
  }
  async put(path: string, doc: CloudDoc, c: { ifMatch?: string; ifNoneMatch?: boolean }) {
    this.check();
    this.beforePut?.(path);
    const current = this.objects.get(path);
    if (c.ifNoneMatch && current) return { ok: false as const };
    if (c.ifMatch && current?.etag !== c.ifMatch) return { ok: false as const };
    const etag = `e${++this.n}`;
    this.objects.set(path, { doc: structuredClone(doc), etag });
    this.puts++;
    return { ok: true as const, etag };
  }
  async hasBlob(hash: string) {
    this.check();
    return this.blobs.has(hash);
  }
  async putBlob(hash: string, blob: Blob) {
    this.check();
    this.blobs.set(hash, blob);
  }
  async getBlob(hash: string, type: string) {
    this.check();
    const b = this.blobs.get(hash);
    if (!b) throw new Error(`missing blob ${hash}`);
    return new Blob([await b.arrayBuffer()], { type });
  }
}

/** One computer's IndexedDB. */
class FakeComputer implements LocalSide {
  stores = new Map<SyncStore, Map<string, Record<string, unknown>>>();
  syncStates = new Map<string, SyncState>();
  uploaded = new Set<string>();
  private copies = 0;
  engine: SyncEngine;

  constructor(
    bucket: FakeBucket,
    readonly name: string,
  ) {
    this.engine = new SyncEngine(this, bucket, {
      deviceId: name,
      conflictTitle: (t) => `${t} (from another computer)`,
    });
  }

  private s(store: SyncStore) {
    if (!this.stores.has(store)) this.stores.set(store, new Map());
    return this.stores.get(store)!;
  }
  /** Local edits, as the app makes them. */
  put(store: SyncStore, key: string, value: Record<string, unknown>) {
    this.s(store).set(key, value);
  }
  del(store: SyncStore, key: string) {
    this.s(store).delete(key);
  }
  get(store: SyncStore, key: string) {
    return this.s(store).get(key);
  }
  all(store: SyncStore) {
    return [...this.s(store).values()];
  }

  async scan() {
    return [...this.stores].flatMap(([store, m]) =>
      [...m].map(([key, value]) => ({ store, key, fp: fingerprint(store, value) })),
    );
  }
  async read(store: SyncStore, key: string) {
    const value = this.s(store).get(key);
    return value ? { store, key, value, fp: fingerprint(store, value), changedAt: changedAt(value) } : null;
  }
  async write(store: SyncStore, key: string, value: unknown, expectedFp: string | null) {
    const current = this.s(store).get(key);
    if ((current ? fingerprint(store, current) : null) !== expectedFp) return null;
    this.s(store).set(key, value as Record<string, unknown>);
    return fingerprint(store, value);
  }
  async remove(store: SyncStore, key: string, expectedFp: string) {
    const current = this.s(store).get(key);
    if (!current || fingerprint(store, current) !== expectedFp) return false;
    this.s(store).delete(key);
    return true;
  }
  async addCopy(store: SyncStore, value: Record<string, unknown>) {
    const key = `${this.name}-copy-${++this.copies}`;
    this.s(store).set(key, { ...value, id: key });
    return key;
  }
  async states() {
    return [...this.syncStates.values()];
  }
  async setState(state: SyncState) {
    this.syncStates.set(state.id, state);
  }
  async deleteState(id: string) {
    this.syncStates.delete(id);
  }
  async blobUploaded(hash: string) {
    return this.uploaded.has(hash);
  }
  async markBlobUploaded(hash: string) {
    this.uploaded.add(hash);
  }
  sync() {
    return this.engine.sync();
  }
}

let clock = 1000;
const design = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  updatedAt: ++clock,
  revision: 1,
  snapshot: { records: [{ typeName: 'document', title }] },
  ...extra,
});
const png = (bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: 'image/png' });

describe('cloud sync engine', () => {
  let bucket: FakeBucket;
  let a: FakeComputer;
  let b: FakeComputer;
  beforeEach(() => {
    bucket = new FakeBucket();
    a = new FakeComputer(bucket, 'A');
    b = new FakeComputer(bucket, 'B');
  });

  it('uploads everything, files once, and then has nothing left to do', async () => {
    a.put('designs', 'd1', design('d1', 'Poster'));
    a.put('assets', 'h1', { hash: 'h1', name: 'photo.png', createdAt: 1, blob: png([1, 2, 3]) });
    a.put('assets', 'h2', { hash: 'h2', name: 'same bytes.png', createdAt: 2, blob: png([1, 2, 3]) });
    const first = await a.sync();
    expect(first).toMatchObject({ offline: false, uploaded: 3, downloaded: 0 });
    expect(first.pending.size).toBe(0);
    expect(bucket.blobs.size).toBe(1);
    const puts = bucket.puts;
    const second = await a.sync();
    expect(second).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(bucket.puts).toBe(puts);
  });

  it('restores everything on a new computer (or after reinstalling), files included', async () => {
    a.put('folders', 'f1', { id: 'f1', name: 'Work', updatedAt: 5 });
    a.put('designs', 'd1', design('d1', 'Poster', { folderId: 'f1' }));
    a.put('assets', 'h1', { hash: 'h1', name: 'photo.png', createdAt: 1, blob: png([9, 8, 7]) });
    a.put('plugins', 'org.x', {
      id: 'org.x',
      files: { 'main.js': new Blob(['x()'], { type: 'text/javascript' }) },
    });
    await a.sync();

    const result = await b.sync();
    expect(result.downloaded).toBe(4);
    expect(b.get('designs', 'd1')).toMatchObject({ title: 'Poster', folderId: 'f1' });
    expect(b.get('folders', 'f1')).toMatchObject({ name: 'Work' });
    const blob = b.get('assets', 'h1')!.blob as Blob;
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 8, 7]);
    expect(blob.type).toBe('image/png');
    const file = (b.get('plugins', 'org.x')!.files as Record<string, Blob>)['main.js']!;
    expect(await file.text()).toBe('x()');
    // Restoring is not a change: nothing goes back up.
    expect((await b.sync()).uploaded).toBe(0);
    expect(result.pending.size).toBe(0);
  });

  it('works offline, marks changes as waiting, and uploads them when back online', async () => {
    a.put('designs', 'd1', design('d1', 'Poster'));
    await a.sync();
    bucket.offline = true;
    a.put('designs', 'd1', design('d1', 'Poster v2'));
    a.put('designs', 'd2', design('d2', 'New while offline'));
    a.del('designs', 'gone');
    const offline = await a.sync();
    expect(offline.offline).toBe(true);
    expect([...offline.pending].sort()).toEqual(['designs/d1', 'designs/d2']);
    // Still offline: nothing lost, still waiting.
    expect((await a.engine.pending()).size).toBe(2);

    bucket.offline = false;
    const online = await a.sync();
    expect(online).toMatchObject({ offline: false, uploaded: 2 });
    expect(online.pending.size).toBe(0);
    await b.sync();
    expect(
      b
        .all('designs')
        .map((d) => d.title)
        .sort(),
    ).toEqual(['New while offline', 'Poster v2']);
  });

  it('stops a round cleanly when the connection drops half way', async () => {
    for (let i = 0; i < 5; i++) a.put('designs', `d${i}`, design(`d${i}`, `D${i}`));
    let n = 0;
    bucket.beforePut = () => {
      if (++n === 3) bucket.offline = true;
    };
    const cut = await a.sync();
    expect(cut.offline).toBe(true);
    expect(cut.pending.size).toBeGreaterThan(0);
    bucket.beforePut = null;
    bucket.offline = false;
    expect((await a.sync()).pending.size).toBe(0);
    await b.sync();
    expect(b.all('designs')).toHaveLength(5);
  });

  it('carries edits and deletions both ways', async () => {
    a.put('designs', 'd1', design('d1', 'One'));
    a.put('brands', 'b1', { id: 'b1', name: 'Brand', updatedAt: 1 });
    await a.sync();
    await b.sync();

    b.put('designs', 'd1', design('d1', 'One, edited on B'));
    await b.sync();
    await a.sync();
    expect(a.get('designs', 'd1')!.title).toBe('One, edited on B');

    a.del('brands', 'b1');
    await a.sync();
    await b.sync();
    expect(b.get('brands', 'b1')).toBeUndefined();
    // The deletion stays deleted.
    await a.sync();
    await b.sync();
    expect(a.get('brands', 'b1')).toBeUndefined();
    expect(b.get('brands', 'b1')).toBeUndefined();
  });

  it('a new, empty computer never deletes the library', async () => {
    a.put('designs', 'd1', design('d1', 'Keep me'));
    await a.sync();
    const fresh = new FakeComputer(bucket, 'C');
    await fresh.sync();
    expect(fresh.get('designs', 'd1')).toBeDefined();
    expect(bucket.objects.get('records/designs/d1.json')!.doc.deleted).toBe(false);
  });

  it('keeps both versions when a design changed on two computers (nothing is lost)', async () => {
    a.put('designs', 'd1', design('d1', 'Plan'));
    await a.sync();
    await b.sync();
    // Both edit while out of touch; B's edit is the newer one.
    a.put('designs', 'd1', design('d1', 'Plan – A edit'));
    b.put('designs', 'd1', design('d1', 'Plan – B edit'));
    await b.sync();
    const merged = await a.sync();
    expect(merged.conflicts).toBe(1);
    // A now has B's newer version under the same id, and its own edit as a copy.
    expect(a.get('designs', 'd1')!.title).toBe('Plan – B edit');
    expect(a.all('designs').map((d) => d.title)).toContain('Plan – A edit (from another computer)');
    await a.sync();
    await b.sync();
    const titles = (c: FakeComputer) =>
      c
        .all('designs')
        .map((d) => d.title)
        .sort();
    expect(titles(b)).toEqual(titles(a));
    expect(titles(b)).toEqual(['Plan – A edit (from another computer)', 'Plan – B edit']);
  });

  it('when the local edit is newer, it wins and the other version is kept as a copy', async () => {
    a.put('designs', 'd1', design('d1', 'Plan'));
    await a.sync();
    await b.sync();
    b.put('designs', 'd1', design('d1', 'B older'));
    await b.sync();
    a.put('designs', 'd1', design('d1', 'A newer'));
    await a.sync();
    expect(a.get('designs', 'd1')!.title).toBe('A newer');
    expect(a.all('designs').map((d) => d.title)).toContain('B older (from another computer)');
    await b.sync();
    expect(b.get('designs', 'd1')!.title).toBe('A newer');
  });

  it('settles other records changed on both sides with the newest version', async () => {
    a.put('folders', 'f1', { id: 'f1', name: 'Old', updatedAt: 1 });
    await a.sync();
    await b.sync();
    a.put('folders', 'f1', { id: 'f1', name: 'A name', updatedAt: 10 });
    b.put('folders', 'f1', { id: 'f1', name: 'B name', updatedAt: 20 });
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.get('folders', 'f1')!.name).toBe('B name');
    expect(b.get('folders', 'f1')!.name).toBe('B name');
  });

  it('an edit wins over a deletion made elsewhere', async () => {
    a.put('designs', 'd1', design('d1', 'Draft'));
    await a.sync();
    await b.sync();
    b.del('designs', 'd1');
    await b.sync();
    a.put('designs', 'd1', design('d1', 'Draft, still being edited'));
    await a.sync();
    expect(a.get('designs', 'd1')!.title).toBe('Draft, still being edited');
    await b.sync();
    expect(b.get('designs', 'd1')!.title).toBe('Draft, still being edited');

    // And the other way round: deleted here, edited there.
    a.del('designs', 'd1');
    b.put('designs', 'd1', design('d1', 'Edited on B'));
    await b.sync();
    await a.sync();
    expect(a.get('designs', 'd1')!.title).toBe('Edited on B');
  });

  it('never overwrites a version written by another computer in between', async () => {
    a.put('designs', 'd1', design('d1', 'Base'));
    await a.sync();
    await b.sync();
    a.put('designs', 'd1', design('d1', 'A edit'));
    // Just before A uploads, B uploads its own edit.
    let once = true;
    bucket.beforePut = (path) => {
      if (once && path === 'records/designs/d1.json') {
        once = false;
        const etag = bucket.objects.get(path)!.etag;
        const doc = bucket.objects.get(path)!.doc;
        bucket.objects.set(path, {
          etag: `${etag}-b`,
          doc: { ...doc, fp: 'b', updatedAt: ++clock, value: { ...(doc.value as object), title: 'B edit' } },
        });
      }
    };
    const raced = await a.sync();
    expect(raced.uploaded).toBe(0);
    expect(bucket.objects.get('records/designs/d1.json')!.doc.value).toMatchObject({ title: 'B edit' });
    bucket.beforePut = null;
    await a.sync();
    const titles = a
      .all('designs')
      .map((d) => d.title)
      .sort();
    expect(titles).toEqual(['A edit (from another computer)', 'B edit']);
  });

  it('does not overwrite a local edit made while a download was in progress', async () => {
    a.put('designs', 'd1', design('d1', 'v1'));
    await a.sync();
    await b.sync();
    a.put('designs', 'd1', design('d1', 'v2 from A'));
    await a.sync();
    // B edits after scanning but before writing the download.
    const realWrite = b.write.bind(b);
    b.write = async (store, key, value, expected) => {
      b.put('designs', 'd1', design('d1', 'B typing'));
      return realWrite(store, key, value, expected);
    };
    await b.sync();
    b.write = realWrite;
    expect(b.get('designs', 'd1')!.title).toBe('B typing');
    await b.sync();
    expect(
      b
        .all('designs')
        .map((d) => d.title)
        .sort(),
    ).toEqual(['B typing', 'v2 from A (from another computer)']);
  });

  it('two computers end up identical after any mix of changes', async () => {
    a.put('designs', 'd1', design('d1', 'A1'));
    b.put('designs', 'd2', design('d2', 'B1'));
    a.put('folders', 'f', { id: 'f', name: 'F', updatedAt: 1 });
    await a.sync();
    await b.sync();
    a.put('designs', 'd2', design('d2', 'B1 edited by A'));
    b.del('folders', 'f');
    b.put('assets', 'h', { hash: 'h', name: 'x', createdAt: 3, blob: png([5]) });
    for (let i = 0; i < 3; i++) {
      await a.sync();
      await b.sync();
    }
    const view = (c: FakeComputer) =>
      JSON.stringify(
        [...c.stores]
          .map(([s, m]) => [s, [...m.keys()].sort().map((k) => [k, fingerprint(s, m.get(k))])])
          .sort(),
      );
    expect(view(a)).toBe(view(b));
    expect(a.get('folders', 'f')).toBeUndefined();
    expect(a.get('designs', 'd2')!.title).toBe('B1 edited by A');
  });

  it('ignores the local revision counter when comparing designs', () => {
    expect(fingerprint('designs', design('d', 'x', { updatedAt: 1, revision: 1 }))).toBe(
      fingerprint('designs', design('d', 'x', { updatedAt: 1, revision: 9 })),
    );
    expect(recordId('designs', 'd')).toBe('designs/d');
  });
});
