import { type AssetRecord, createRandomIdGenerator } from '@opencanvas/core';
import { getDB } from './db';

const newId = createRandomIdGenerator();

export async function putAssetBlob(input: {
  hash: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  name: string;
}): Promise<void> {
  const db = await getDB();
  const existing = await db.get('assets', input.hash);
  if (existing) return; // content-addressed: identical bytes are stored once
  await db.put('assets', { ...input, createdAt: Date.now() });
}

export async function getAssetBlob(hash: string): Promise<Blob | null> {
  return (await (await getDB()).get('assets', hash))?.blob ?? null;
}

export async function listUploads(): Promise<
  { hash: string; mimeType: string; width: number; height: number; name: string; createdAt: number }[]
> {
  const db = await getDB();
  const all = await db.getAllFromIndex('assets', 'createdAt');
  return all.reverse().map(({ blob: _blob, ...rest }) => rest);
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
