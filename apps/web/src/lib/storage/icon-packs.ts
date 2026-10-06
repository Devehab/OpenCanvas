/**
 * Icon packs: the person's own icons (uploaded SVG files) and packs that
 * plugins install. They appear in the Elements panel next to the built-in
 * library.
 */
import { createRandomIdGenerator } from '@opencanvas/core';
import { broadcast, TAB_ID } from '../channel';
import { svgToIcon } from '../svg-icon';
import { type CustomIcon, getDB, type IconPackRecord } from './db';

export type { CustomIcon, IconPackRecord };

/** The pack that holds icons the person uploads. */
export const USER_PACK_ID = 'user-icons';
export const MAX_ICON_BYTES = 512 * 1024;
const MAX_ICONS_PER_PACK = 2000;

const newId = createRandomIdGenerator();
export const iconsChanged = () => broadcast({ type: 'icons-changed', tabId: TAB_ID }, { self: true });

export async function listIconPacks(): Promise<IconPackRecord[]> {
  const db = await getDB();
  return (await db.getAll('iconPacks')).sort((a, b) =>
    a.id === USER_PACK_ID ? -1 : b.id === USER_PACK_ID ? 1 : a.name.localeCompare(b.name),
  );
}

export interface IconUploadResult {
  added: CustomIcon[];
  failed: { name: string; reason: 'too-large' | 'invalid' | 'empty' }[];
}

/** Adds SVG files to the person's own icon pack. */
export async function addUserIcons(files: readonly File[], packName: string): Promise<IconUploadResult> {
  const result: IconUploadResult = { added: [], failed: [] };
  for (const file of files) {
    if (file.size > MAX_ICON_BYTES) {
      result.failed.push({ name: file.name, reason: 'too-large' });
      continue;
    }
    const converted = svgToIcon(await file.text(), file.name.replace(/\.svg$/i, ''));
    if (!converted.ok) result.failed.push({ name: file.name, reason: converted.reason });
    else result.added.push({ ...converted.icon, id: newId('icon') });
  }
  if (result.added.length) {
    const db = await getDB();
    const pack = (await db.get('iconPacks', USER_PACK_ID)) ?? {
      id: USER_PACK_ID,
      name: packName,
      icons: [],
      createdAt: Date.now(),
    };
    await db.put('iconPacks', {
      ...pack,
      icons: [...pack.icons, ...result.added].slice(-MAX_ICONS_PER_PACK),
    });
    iconsChanged();
  }
  return result;
}

export async function deleteUserIcon(iconId: string): Promise<void> {
  const db = await getDB();
  const pack = await db.get('iconPacks', USER_PACK_ID);
  if (!pack) return;
  await db.put('iconPacks', { ...pack, icons: pack.icons.filter((i) => i.id !== iconId) });
  iconsChanged();
}

/** Stores a pack contributed by a plugin (replacing an earlier version). */
export async function putPluginIconPack(pack: IconPackRecord): Promise<void> {
  const db = await getDB();
  await db.put('iconPacks', pack);
}
