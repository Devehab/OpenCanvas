import {
  createDocumentSnapshot,
  createRandomIdGenerator,
  type DesignFormat,
  type DocumentSnapshot,
  parseDocument,
} from '@opencanvas/core';
import { type DesignRecord, getDB } from './db';

export type { DesignRecord };

const newId = createRandomIdGenerator();

export type DesignSummary = Omit<DesignRecord, 'snapshot'>;

function summarize(record: DesignRecord): DesignSummary {
  const { snapshot: _snapshot, ...summary } = record;
  return summary;
}

function metaFromSnapshot(snapshot: DocumentSnapshot) {
  const doc = snapshot.records.find((r) => r.typeName === 'document');
  const pages = snapshot.records
    .filter((r) => r.typeName === 'page')
    .sort((a, b) => (a.index < b.index ? -1 : 1));
  return {
    title: doc?.typeName === 'document' ? doc.title : 'Untitled design',
    formatId: doc?.typeName === 'document' ? doc.formatId : null,
    width: pages[0]?.typeName === 'page' ? pages[0].width : 1080,
    height: pages[0]?.typeName === 'page' ? pages[0].height : 1080,
    pageCount: pages.length,
  };
}

export async function listDesigns(options: { trashed?: boolean } = {}): Promise<DesignSummary[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('designs', 'updatedAt');
  return all
    .filter((d) => (options.trashed ? d.deletedAt !== null : d.deletedAt === null))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(summarize);
}

export async function getDesign(id: string): Promise<DesignRecord | undefined> {
  return (await getDB()).get('designs', id);
}

export async function createDesign(options: {
  title: string;
  width: number;
  height: number;
  format?: DesignFormat | null;
  snapshot?: DocumentSnapshot;
}): Promise<DesignRecord> {
  const snapshot =
    options.snapshot ??
    createDocumentSnapshot({
      title: options.title,
      formatId: options.format?.id ?? null,
      width: options.width,
      height: options.height,
    });
  const now = Date.now();
  const record: DesignRecord = {
    id: newId('design'),
    ...metaFromSnapshot(snapshot),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
    snapshot,
  };
  await (await getDB()).put('designs', record);
  return record;
}

export type SaveResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'missing'; revision?: number };

/**
 * Saves a snapshot if nobody else saved since `baseRevision` (another tab, for
 * example). The read-check-write happens in one IndexedDB transaction.
 */
export async function saveDesign(
  id: string,
  snapshot: DocumentSnapshot,
  baseRevision: number,
): Promise<SaveResult> {
  const db = await getDB();
  const tx = db.transaction('designs', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return { ok: false, reason: 'missing' };
  }
  if (current.revision !== baseRevision) {
    await tx.done;
    return { ok: false, reason: 'conflict', revision: current.revision };
  }
  const revision = current.revision + 1;
  await tx.store.put({
    ...current,
    ...metaFromSnapshot(snapshot),
    snapshot,
    revision,
    updatedAt: Date.now(),
  });
  await tx.done;
  return { ok: true, revision };
}

export async function renameDesign(id: string, title: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('designs', 'readwrite');
  const current = await tx.store.get(id);
  if (current) {
    const snapshot: DocumentSnapshot = {
      ...current.snapshot,
      records: current.snapshot.records.map((r) => (r.typeName === 'document' ? { ...r, title } : r)),
    };
    await tx.store.put({
      ...current,
      title,
      snapshot,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
  }
  await tx.done;
}

export async function setTrashed(id: string, trashed: boolean): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('designs', 'readwrite');
  const current = await tx.store.get(id);
  if (current) await tx.store.put({ ...current, deletedAt: trashed ? Date.now() : null });
  await tx.done;
}

export async function deleteDesignForever(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['designs', 'thumbnails'], 'readwrite');
  await tx.objectStore('designs').delete(id);
  await tx.objectStore('thumbnails').delete(id);
  await tx.done;
}

export async function duplicateDesign(id: string, title: string): Promise<DesignRecord | null> {
  const source = await getDesign(id);
  if (!source) return null;
  return createDesignCopy(source.snapshot, title);
}

/** Stores a snapshot as a new design with the given title. */
export async function createDesignCopy(source: DocumentSnapshot, title: string): Promise<DesignRecord> {
  // Re-parse so the copy is validated like any import.
  const { snapshot } = parseDocument(source);
  const renamed: DocumentSnapshot = {
    ...snapshot,
    records: snapshot.records.map((r) => (r.typeName === 'document' ? { ...r, title } : r)),
  };
  const meta = metaFromSnapshot(renamed);
  return createDesign({ title, width: meta.width, height: meta.height, snapshot: renamed });
}
