/**
 * Local-first persistence in IndexedDB.
 *
 *   designs     { id, title, …, snapshot, revision }      design documents
 *   assets      { hash, blob, mimeType, width, height }   content-addressed images
 *   thumbnails  { designId, blob, updatedAt }             dashboard previews
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
}

export interface AssetBlobRecord {
  hash: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  name: string;
  createdAt: number;
}

export interface ThumbnailRecord {
  designId: string;
  blob: Blob;
  updatedAt: number;
}

interface OpenCanvasDB extends DBSchema {
  designs: { key: string; value: DesignRecord; indexes: { updatedAt: number } };
  assets: { key: string; value: AssetBlobRecord; indexes: { createdAt: number } };
  thumbnails: { key: string; value: ThumbnailRecord };
}

const DB_NAME = 'opencanvas';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OpenCanvasDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<OpenCanvasDB>> {
  dbPromise ??= openDB<OpenCanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const designs = db.createObjectStore('designs', { keyPath: 'id' });
      designs.createIndex('updatedAt', 'updatedAt');
      const assets = db.createObjectStore('assets', { keyPath: 'hash' });
      assets.createIndex('createdAt', 'createdAt');
      db.createObjectStore('thumbnails', { keyPath: 'designId' });
    },
    blocking() {
      // Another tab upgrades the schema: release our connection.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}
