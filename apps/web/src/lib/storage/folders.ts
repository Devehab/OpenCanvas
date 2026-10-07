/** Projects: folders that organize designs and uploads. */
import { createRandomIdGenerator } from '@opencanvas/core';
import { type FolderRecord, getDB, updateRecordWithFiles } from './db';

export type { FolderRecord };

const newId = createRandomIdGenerator();

/** Folder colors offered in the UI (the first is the default). */
export const FOLDER_COLORS = ['#7c6cf8', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

/** Icons offered for template folders (lucide names; the first is the default). */
export const TEMPLATE_FOLDER_ICONS = [
  'folder',
  'megaphone',
  'presentation',
  'briefcase',
  'calendar',
  'gift',
  'heart',
  'star',
  'shopping-bag',
  'graduation-cap',
  'camera',
  'utensils',
  'music',
  'plane',
  'rocket',
  'sparkles',
] as const;

export type FolderKind = 'project' | 'template';

/** Project folders (default) or template folders. */
export async function listFolders(kind: FolderKind = 'project'): Promise<FolderRecord[]> {
  const folders = await (await getDB()).getAll('folders');
  return folders
    .filter((f) => (f.kind === 'template' ? 'template' : 'project') === kind)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFolder(id: string): Promise<FolderRecord | undefined> {
  return (await getDB()).get('folders', id);
}

export async function createFolder(
  name: string,
  color = FOLDER_COLORS[0]!,
  options: { kind?: FolderKind; icon?: string } = {},
): Promise<FolderRecord> {
  const now = Date.now();
  const folder: FolderRecord = {
    id: newId('folder'),
    name: name.trim().slice(0, 100) || 'Untitled folder',
    color,
    createdAt: now,
    updatedAt: now,
    ...(options.kind === 'template'
      ? { kind: 'template' as const, icon: options.icon ?? TEMPLATE_FOLDER_ICONS[0] }
      : {}),
  };
  await (await getDB()).put('folders', folder);
  return folder;
}

export async function updateFolder(
  id: string,
  patch: { name?: string; color?: string; icon?: string },
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('folders', 'readwrite');
  const current = await tx.store.get(id);
  if (current) {
    const name = patch.name?.trim().slice(0, 100);
    await tx.store.put({
      ...current,
      ...(name ? { name } : {}),
      ...(patch.color ? { color: patch.color } : {}),
      ...(patch.icon && current.kind === 'template' ? { icon: patch.icon } : {}),
      updatedAt: Date.now(),
    });
  }
  await tx.done;
}

/** Deletes a folder. Its designs and uploads are kept and move out of it. */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['folders', 'designs'], 'readwrite');
  await tx.objectStore('folders').delete(id);
  let cursor = await tx.objectStore('designs').openCursor();
  while (cursor) {
    if (cursor.value.folderId === id) await cursor.update({ ...cursor.value, folderId: null });
    cursor = await cursor.continue();
  }
  await tx.done;
  // Uploads hold their image: changed one by one without storing the read-back file.
  for (const asset of await db.getAll('assets')) {
    if (asset.folderId !== id) continue;
    await updateRecordWithFiles('assets', asset.hash, (current) =>
      current.folderId === id ? { ...current, folderId: null } : null,
    );
  }
}
