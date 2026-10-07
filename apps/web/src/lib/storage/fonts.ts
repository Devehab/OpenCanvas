/**
 * Fonts the person uploaded, stored in this browser like everything else.
 */
import { createRandomIdGenerator } from '@opencanvas/core';
import { broadcast, TAB_ID } from '../channel';
import { FONT_MIME, guessFontInfo, MAX_FONT_BYTES, sniffFontFormat } from '../font-files';
import { type CustomFontRecord, getDB, updateRecordWithFiles } from './db';

export type { CustomFontRecord };

const newId = createRandomIdGenerator();

export class FontUploadError extends Error {
  constructor(
    readonly reason: 'not-a-font' | 'too-large' | 'unreadable',
    readonly fileName: string,
  ) {
    super(`${fileName}: ${reason}`);
  }
}

export const fontsChanged = () => broadcast({ type: 'fonts-changed', tabId: TAB_ID }, { self: true });

export async function listCustomFonts(): Promise<CustomFontRecord[]> {
  const db = await getDB();
  const all = await db.getAll('fonts');
  return all.sort(
    (a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || a.createdAt - b.createdAt,
  );
}

/**
 * Checks and stores an uploaded font file. The file must really be a font
 * (signature) that the browser can load; family, weight and style are
 * guessed from the file name and can be changed afterwards.
 */
export async function addCustomFont(file: File): Promise<CustomFontRecord> {
  if (file.size > MAX_FONT_BYTES) throw new FontUploadError('too-large', file.name);
  const buffer = await file.arrayBuffer();
  const format = sniffFontFormat(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (!format) throw new FontUploadError('not-a-font', file.name);
  if (typeof FontFace !== 'undefined') {
    try {
      // Loading under a throwaway name proves the browser can use the file.
      await new FontFace(`oc-check-${newId('font')}`, buffer).load();
    } catch {
      throw new FontUploadError('unreadable', file.name);
    }
  }
  const guess = guessFontInfo(file.name);
  const record: CustomFontRecord = {
    id: newId('font'),
    family: guess.family,
    weight: guess.weight,
    style: guess.style,
    format,
    fileName: file.name.slice(0, 256),
    size: file.size,
    data: new Blob([buffer], { type: FONT_MIME[format] }),
    createdAt: Date.now(),
  };
  const db = await getDB();
  await db.put('fonts', record);
  fontsChanged();
  return record;
}

export async function updateCustomFont(
  id: string,
  patch: Partial<Pick<CustomFontRecord, 'family' | 'weight' | 'style'>>,
): Promise<void> {
  const family = patch.family?.trim().slice(0, 64);
  await updateRecordWithFiles('fonts', id, (font) => ({
    ...font,
    ...patch,
    family: family || font.family,
    weight: Math.min(900, Math.max(100, Math.round((patch.weight ?? font.weight) / 100) * 100)),
  }));
  fontsChanged();
}

export async function deleteCustomFont(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('fonts', id);
  fontsChanged();
}
