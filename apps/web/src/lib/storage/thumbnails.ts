import { broadcast, TAB_ID } from '../channel';
import type { ThumbnailRecord } from './db';
import { getDB } from './db';

/** Stores a preview unless a newer revision's preview is already stored. */
export async function putThumbnail(designId: string, blob: Blob, revision: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('thumbnails', 'readwrite');
  const existing = await tx.store.get(designId);
  if (existing?.revision !== undefined && existing.revision > revision) {
    await tx.done;
    return;
  }
  await tx.store.put({ designId, blob, updatedAt: Date.now(), revision });
  await tx.done;
  broadcast({ type: 'thumbnail-updated', designId, tabId: TAB_ID }, { self: true });
}

export async function getThumbnailRecord(designId: string): Promise<ThumbnailRecord | null> {
  return (await (await getDB()).get('thumbnails', designId)) ?? null;
}

export async function getThumbnail(designId: string): Promise<Blob | null> {
  return (await getThumbnailRecord(designId))?.blob ?? null;
}
