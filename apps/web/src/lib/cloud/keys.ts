/**
 * How the library is laid out in the bucket (shared by the browser and the
 * local server). Everything lives under the configured prefix:
 *
 *   space.json                      marks the folder as an OpenCanvas library
 *   records/<store>/<key>.json      one record of a local store (or a deletion marker)
 *   blobs/<sha256>                  file contents, content-addressed and immutable
 */

/**
 * The IndexedDB stores that are synced, in the order they are applied
 * (folders and files before the designs that use them). Thumbnails are not
 * synced: each computer redraws them from the designs.
 */
export const SYNC_STORES = [
  'folders',
  'brands',
  'fonts',
  'iconPacks',
  'plugins',
  'assets',
  'designs',
] as const;
export type SyncStore = (typeof SYNC_STORES)[number];

export function isSyncStore(value: string): value is SyncStore {
  return (SYNC_STORES as readonly string[]).includes(value);
}

const SAFE_KEY = /^[A-Za-z0-9._-]{1,200}$/;

function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): string {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** A record key as a file name: kept when plain, base64url (after "~") otherwise. */
export function encodeRecordKey(key: string): string {
  return SAFE_KEY.test(key) && !key.startsWith('~') ? key : `~${base64url(key)}`;
}

export function decodeRecordKey(name: string): string {
  return name.startsWith('~') ? fromBase64url(name.slice(1)) : name;
}

/** "designs/design_abc" → "records/designs/design_abc.json" */
export function recordPath(store: SyncStore, key: string): string {
  return `records/${store}/${encodeRecordKey(key)}.json`;
}

/** The record id ("<store>/<key>") of a record path, or null if it is not one. */
export function parseRecordPath(path: string): { store: SyncStore; key: string } | null {
  const m = path.match(/^records\/([A-Za-z]+)\/([A-Za-z0-9._~-]{1,300})\.json$/);
  if (!m || !isSyncStore(m[1]!)) return null;
  try {
    return { store: m[1], key: decodeRecordKey(m[2]!) };
  } catch {
    return null;
  }
}

export function blobPath(hash: string): string {
  return `blobs/${hash}`;
}

/** Paths the browser may read and write through the local server. */
export function isAllowedPath(path: string): boolean {
  return parseRecordPath(path) !== null || /^blobs\/[a-f0-9]{64}$/.test(path);
}
