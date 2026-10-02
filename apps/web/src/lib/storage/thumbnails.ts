import { getDB } from './db';

export async function putThumbnail(designId: string, blob: Blob): Promise<void> {
  await (await getDB()).put('thumbnails', { designId, blob, updatedAt: Date.now() });
}

export async function getThumbnail(designId: string): Promise<Blob | null> {
  return (await (await getDB()).get('thumbnails', designId))?.blob ?? null;
}
