/** Projects: folders that organize designs and uploads. */
import { createRandomIdGenerator } from '@opencanvas/core';
import { type FolderRecord, getDB } from './db';

export type { FolderRecord };

const newId = createRandomIdGenerator();

/** Folder colors offered in the UI (the first is the default). */
export const FOLDER_COLORS = ['#7c6cf8', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

export async function listFolders(): Promise<FolderRecord[]> {
  const folders = await (await getDB()).getAll('folders');
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFolder(id: string): Promise<FolderRecord | undefined> {
  return (await getDB()).get('folders', id);
}

export async function createFolder(name: string, color = FOLDER_COLORS[0]!): Promise<FolderRecord> {
  const now = Date.now();
  const folder: FolderRecord = {
    id: newId('folder'),
    name: name.trim().slice(0, 100) || 'Untitled folder',
    color,
    createdAt: now,
    updatedAt: now,
  };
  await (await getDB()).put('folders', folder);
  return folder;
}

export async function updateFolder(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('folders', 'readwrite');
  const current = await tx.store.get(id);
  if (current) {
    const name = patch.name?.trim().slice(0, 100);
    await tx.store.put({
      ...current,
      ...(name ? { name } : {}),
      ...(patch.color ? { color: patch.color } : {}),
      updatedAt: Date.now(),
    });
  }
  await tx.done;
}

/** Deletes a folder. Its designs and uploads are kept and move out of it. */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['folders', 'designs', 'assets'], 'readwrite');
  await tx.objectStore('folders').delete(id);
  for (const name of ['designs', 'assets'] as const) {
    let cursor = await tx.objectStore(name).openCursor();
    while (cursor) {
      if (cursor.value.folderId === id) await cursor.update({ ...cursor.value, folderId: null });
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}
