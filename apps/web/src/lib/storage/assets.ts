import { type AssetRecord, createRandomIdGenerator } from '@opencanvas/core';
import { type AssetBlobRecord, getDB, withDB } from './db';

const newId = createRandomIdGenerator();

export async function putAssetBlob(input: {
  hash: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  name: string;
}): Promise<void> {
  return withDB(async (db) => {
    const tx = db.transaction('assets', 'readwrite');
    const existing = await tx.store.get(input.hash);
    if (!existing) {
      await tx.store.put({
        ...input,
        size: input.blob.size,
        createdAt: Date.now(),
        folderId: null,
        removedAt: null,
      });
    } else if (existing.removedAt) {
      // Content-addressed: identical bytes are stored once. Uploading a removed
      // image again brings it back to the top of the library.
      await tx.store.put({ ...existing, removedAt: null, createdAt: Date.now() });
    }
    await tx.done;
  });
}

export async function getAssetBlob(hash: string): Promise<Blob | null> {
  return (await (await getDB()).get('assets', hash))?.blob ?? null;
}

export type UploadSummary = Omit<AssetBlobRecord, 'blob'> & { size: number };

/** The uploads library, newest first (removed uploads excluded). */
export async function listUploads(options: { folderId?: string | null } = {}): Promise<UploadSummary[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('assets', 'createdAt');
  return all
    .reverse()
    .filter((a) => !a.removedAt)
    .filter((a) => options.folderId === undefined || (a.folderId ?? null) === options.folderId)
    .map(({ blob, ...rest }) => ({ ...rest, size: rest.size ?? blob.size }));
}

/** Renames an upload or moves it to a folder (null = out of any folder). */
export async function updateUpload(
  hash: string,
  patch: { name?: string; folderId?: string | null },
): Promise<void> {
  return withDB(async (db) => {
    const tx = db.transaction('assets', 'readwrite');
    const current = await tx.store.get(hash);
    if (current) {
      await tx.store.put({
        ...current,
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 200) || current.name } : {}),
        ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      });
    }
    await tx.done;
  });
}

/** Removes an upload from the library; designs using it keep working. */
export async function removeUpload(hash: string): Promise<void> {
  return withDB(async (db) => {
    const tx = db.transaction('assets', 'readwrite');
    const current = await tx.store.get(hash);
    if (current) await tx.store.put({ ...current, removedAt: Date.now() });
    await tx.done;
  });
}

/** Brings a removed upload back (undo). */
export async function restoreUpload(hash: string): Promise<void> {
  return withDB(async (db) => {
    const tx = db.transaction('assets', 'readwrite');
    const current = await tx.store.get(hash);
    if (current) await tx.store.put({ ...current, removedAt: null });
    await tx.done;
  });
}

/** Asset record for the document (metadata only; bytes stay in IndexedDB by hash). */
export function assetRecordFor(input: {
  hash: string;
  mimeType: string;
  width: number;
  height: number;
  name: string;
  size: number;
}): AssetRecord {
  return {
    typeName: 'asset',
    id: newId('asset'),
    kind: 'image',
    name: input.name.slice(0, 200),
    mimeType: input.mimeType,
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    size: input.size,
    hash: input.hash,
    src: null,
  };
}
