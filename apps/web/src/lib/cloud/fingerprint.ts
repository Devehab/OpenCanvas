/**
 * Fingerprints of local records, used to notice changes without reading file
 * contents: a stable JSON of the record (files reduced to type and size,
 * bookkeeping fields left out) hashed with cyrb53 twice (~106 bits).
 * Synchronous, so it can run inside an IndexedDB transaction.
 */
import type { SyncStore } from './keys';

/** Fields that change without the content changing. */
const VOLATILE: Partial<Record<SyncStore, readonly string[]>> = {
  // A local counter for tabs editing the same design.
  designs: ['revision'],
};

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

/** JSON with sorted keys; Blobs become {type, size}; `skip` drops top-level fields. */
export function stableStringify(value: unknown, skip: readonly string[] = []): string {
  const walk = (v: unknown, top: boolean): string => {
    if (v === null || v === undefined) return 'null';
    if (isBlob(v)) return `{"$blob":${JSON.stringify(v.type)},"size":${v.size}}`;
    if (Array.isArray(v)) return `[${v.map((x) => walk(x, false)).join(',')}]`;
    if (typeof v === 'object') {
      const keys = Object.keys(v as object)
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined && !(top && skip.includes(k)))
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${walk((v as Record<string, unknown>)[k], false)}`).join(',')}}`;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return 'null';
    return JSON.stringify(v);
  };
  return walk(value, true);
}

function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function fingerprint(store: SyncStore, record: unknown): string {
  const text = stableStringify(record, VOLATILE[store] ?? []);
  return `${cyrb53(text, 1)}${cyrb53(text, 7)}${text.length.toString(36)}`;
}

/** When the record last changed, from its own fields (for "newest wins"). */
export function changedAt(record: Record<string, unknown>): number {
  const num = (k: string) => (typeof record[k] === 'number' ? (record[k] as number) : 0);
  return Math.max(num('updatedAt'), num('createdAt'), num('removedAt'), num('installedAt'));
}
