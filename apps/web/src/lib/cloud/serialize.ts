/**
 * Records ↔ cloud documents. Files inside a record (Blobs, anywhere in it)
 * are stored once in the bucket by SHA-256 and referenced from the document
 * as { "$blob": "<sha256>", "type": "image/png", "size": 1234 }.
 */

export interface BlobRef {
  $blob: string;
  type: string;
  size: number;
}

function isBlobRef(value: unknown): value is BlobRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BlobRef).$blob === 'string' &&
    /^[a-f0-9]{64}$/.test((value as BlobRef).$blob)
  );
}

const hashes = new WeakMap<Blob, Promise<string>>();

export function sha256OfBlob(blob: Blob): Promise<string> {
  let hash = hashes.get(blob);
  if (!hash) {
    hash = blob
      .arrayBuffer()
      .then(async (bytes) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
      );
    hashes.set(blob, hash);
  }
  return hash;
}

/** The record as JSON-safe data, and the files it refers to. */
export async function toCloudValue(value: unknown): Promise<{ value: unknown; blobs: Map<string, Blob> }> {
  const blobs = new Map<string, Blob>();
  const walk = async (v: unknown): Promise<unknown> => {
    if (v instanceof Blob) {
      const hash = await sha256OfBlob(v);
      blobs.set(hash, v);
      return { $blob: hash, type: v.type, size: v.size } satisfies BlobRef;
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = await walk(x);
      return out;
    }
    return v;
  };
  return { value: await walk(value), blobs };
}

/** Rebuilds a record, downloading the files it refers to. */
export async function fromCloudValue(
  value: unknown,
  getBlob: (hash: string, type: string) => Promise<Blob>,
): Promise<unknown> {
  const walk = async (v: unknown): Promise<unknown> => {
    if (isBlobRef(v)) return getBlob(v.$blob, v.type);
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x);
      return out;
    }
    return v;
  };
  return walk(value);
}
