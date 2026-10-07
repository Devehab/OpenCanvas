/**
 * Local-first persistence in IndexedDB.
 *
 *   designs     { id, title, …, snapshot, revision }      design documents
 *   assets      { hash, blob, mimeType, width, height }   content-addressed images
 *   thumbnails  { designId, blob, updatedAt, revision }   dashboard previews
 *   folders     { id, name, … }                           projects: folders of designs and uploads
 *   brands      { id, name, colors, fonts, … }            brand kits
 *   fonts, iconPacks, plugins                             the person's fonts, icons and plugins
 *   syncState, syncBlobs                                  cloud sync bookkeeping
 */
import type { DocumentSnapshot } from '@opencanvas/core';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export interface DesignRecord {
  id: string;
  title: string;
  formatId: string | null;
  width: number;
  height: number;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Incremented on every save; used for optimistic concurrency between tabs. */
  revision: number;
  snapshot: DocumentSnapshot;
  /** Folder in Projects (absent/null = not in a folder). */
  folderId?: string | null;
  /** Starred designs are listed first in Projects. */
  starred?: boolean;
  /**
   * 'template': a template, listed under Templates only. Using it makes a
   * copy; the template itself changes only when edited on purpose. Absent in
   * designs (and in every record written before templates existed).
   */
  kind?: 'template';
}

export interface AssetBlobRecord {
  hash: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  name: string;
  createdAt: number;
  /** Byte size (absent in records written before it was stored). */
  size?: number;
  folderId?: string | null;
  /**
   * Removed from the uploads library. The bytes stay: designs that use the
   * image still need them (they are content-addressed and shared).
   */
  removedAt?: number | null;
}

export interface FolderRecord {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  /** 'template': a folder of templates (absent: a project folder). */
  kind?: 'template';
  /** Icon of a template folder (see TEMPLATE_FOLDER_ICONS). */
  icon?: string;
}

export interface BrandFont {
  family: string;
  weight: number;
  size: number;
}

export interface BrandPalette {
  id: string;
  name: string;
  colors: string[];
}

/** Images in a brand kit refer to library assets by content hash. */
export interface BrandImage {
  hash: string;
  mimeType: string;
  width: number;
  height: number;
  name: string;
}

export interface BrandRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  palettes: BrandPalette[];
  fonts: { heading: BrandFont; subheading: BrandFont; body: BrandFont };
  logos: BrandImage[];
  photos: BrandImage[];
  graphics: BrandImage[];
  icons: BrandImage[];
  voice: { description: string; tone: string[]; dos: string; donts: string };
  /** Designs marked as this brand's templates. */
  templateIds: string[];
}

export interface ThumbnailRecord {
  designId: string;
  blob: Blob;
  updatedAt: number;
  /** Design revision the preview shows (absent in older records = unknown). */
  revision?: number;
}

/** A font file the person uploaded (one weight/style of a family). */
export interface CustomFontRecord {
  id: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  format: 'woff2' | 'woff' | 'truetype' | 'opentype';
  fileName: string;
  size: number;
  data: Blob;
  createdAt: number;
  /** Set when a plugin installed the font (removed with the plugin). */
  pluginId?: string;
}

/** An icon added by the person or by a plugin: one SVG path, like the built-in library. */
export interface CustomIcon {
  id: string;
  name: string;
  /** Lower-case search words (English or Arabic). */
  keywords: string[];
  /** Path data of all shapes in the icon. */
  path: string;
  viewBox: { x: number; y: number; width: number; height: number };
  /** Outline icons are stroked, filled icons are filled. */
  style: 'outline' | 'filled';
  strokeWidth: number;
}

export interface IconPackRecord {
  id: string;
  name: string;
  /** Set when a plugin installed the pack (removed with the plugin). */
  pluginId?: string;
  icons: CustomIcon[];
  createdAt: number;
}

/** An installed plugin: its validated manifest and files. */
export interface PluginRecord {
  id: string;
  manifest: unknown;
  /** Plugin files by path inside the package. */
  files: Record<string, Blob>;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
}

/** Cloud sync bookkeeping (see lib/cloud/engine.ts). */
export interface SyncStateRecord {
  id: string;
  store: string;
  key: string;
  localFp: string | null;
  remoteEtag: string | null;
}

interface OpenCanvasDB extends DBSchema {
  designs: { key: string; value: DesignRecord; indexes: { updatedAt: number } };
  assets: { key: string; value: AssetBlobRecord; indexes: { createdAt: number } };
  thumbnails: { key: string; value: ThumbnailRecord };
  folders: { key: string; value: FolderRecord };
  brands: { key: string; value: BrandRecord };
  fonts: { key: string; value: CustomFontRecord };
  iconPacks: { key: string; value: IconPackRecord };
  plugins: { key: string; value: PluginRecord };
  syncState: { key: string; value: SyncStateRecord };
  syncBlobs: { key: string; value: { hash: string; at: number } };
}

const DB_NAME = 'opencanvas';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<OpenCanvasDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<OpenCanvasDB>> {
  dbPromise ??= openDB<OpenCanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Each step upgrades from the previous version; existing data is kept.
      if (oldVersion < 1) {
        const designs = db.createObjectStore('designs', { keyPath: 'id' });
        designs.createIndex('updatedAt', 'updatedAt');
        const assets = db.createObjectStore('assets', { keyPath: 'hash' });
        assets.createIndex('createdAt', 'createdAt');
        db.createObjectStore('thumbnails', { keyPath: 'designId' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('folders', { keyPath: 'id' });
        db.createObjectStore('brands', { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('fonts', { keyPath: 'id' });
        db.createObjectStore('iconPacks', { keyPath: 'id' });
        db.createObjectStore('plugins', { keyPath: 'id' });
      }
      if (oldVersion < 4) {
        db.createObjectStore('syncState', { keyPath: 'id' });
        db.createObjectStore('syncBlobs', { keyPath: 'hash' });
      }
    },
    blocking() {
      // Another tab upgrades the schema: release our connection.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
    terminated() {
      // The browser dropped the connection (Safari does under memory pressure or
      // after time in the background: "Connection to Indexed Database server
      // lost"). Open a new one next time instead of failing every save from now on.
      console.warn('IndexedDB connection lost; reopening it');
      dbPromise = null;
    },
  });
  // A failed open is not kept: the next call tries again.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Errors that mean the connection is gone, not that the operation was wrong. */
function isConnectionLost(error: unknown): boolean {
  if (!(error instanceof Error) && !(error instanceof DOMException)) return false;
  const e = error as { name?: string; message?: string };
  return (
    e.name === 'InvalidStateError' ||
    (e.name === 'UnknownError' && /connection|server/i.test(e.message ?? ''))
  );
}

/**
 * Runs a storage operation; if it failed because the browser dropped the
 * database connection, reopens the database and runs it once more. Used for
 * writes that must not get lost (saving designs, the uploads library).
 */
export async function withDB<T>(operation: (db: IDBPDatabase<OpenCanvasDB>) => Promise<T>): Promise<T> {
  const db = await getDB();
  try {
    return await operation(db);
  } catch (error) {
    if (!isConnectionLost(error)) throw error;
    console.warn('IndexedDB operation failed on a lost connection; retrying', error);
    if (dbPromise && (await dbPromise.catch(() => null)) === db) dbPromise = null;
    return operation(await getDB());
  }
}

/** In-memory copies of every file (Blob) in a value read from the database. */
async function copyFiles<T>(value: T): Promise<T> {
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof Blob !== 'undefined' && v instanceof Blob) {
      return new Blob([await v.arrayBuffer()], { type: v.type });
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x);
      return out;
    }
    return v;
  };
  return (await walk(value)) as T;
}

/** `target` with each file replaced by the copy at the same place in `copies`. */
function withFileCopies<T>(target: T, copies: unknown): T {
  const walk = (t: unknown, c: unknown): unknown => {
    if (typeof Blob !== 'undefined' && t instanceof Blob)
      return c instanceof Blob && c.size === t.size && c.type === t.type ? c : t;
    if (Array.isArray(t)) return t.map((x, i) => walk(x, Array.isArray(c) ? c[i] : undefined));
    if (t && typeof t === 'object') {
      const out: Record<string, unknown> = {};
      const src = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      for (const [k, x] of Object.entries(t)) out[k] = walk(x, src[k]);
      return out;
    }
    return t;
  };
  return walk(target, copies) as T;
}

type StoresWithFiles = 'assets' | 'fonts' | 'plugins';

/**
 * Changes a record that holds files (an upload, a font, a plugin) without
 * storing back the files read from the database: WebKit can fail to store a
 * Blob that came out of IndexedDB ("Error preparing Blob/File data to be
 * stored in object store"). The files are copied into memory first (they do
 * not change: uploads are content-addressed), then the latest record is
 * changed and stored with those copies. `change` returns null to leave it.
 */
export async function updateRecordWithFiles<S extends StoresWithFiles>(
  store: S,
  key: string,
  change: (current: OpenCanvasDB[S]['value']) => OpenCanvasDB[S]['value'] | null,
): Promise<void> {
  await withDB(async (db) => {
    const before = await db.get(store, key);
    if (!before) return;
    const copies = await copyFiles(before);
    const tx = db.transaction(store, 'readwrite');
    const latest = await tx.objectStore(store).get(key);
    const next = latest ? change(latest) : null;
    if (next) await tx.objectStore(store).put(withFileCopies(next, copies));
    await tx.done;
  });
}
