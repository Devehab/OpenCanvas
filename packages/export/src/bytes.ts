/** Byte helpers shared by the file format writers. */

export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** SHA-256 of `data` as lowercase hex (Web Crypto: browsers, workers and Node ≥ 19). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  return toHex(new Uint8Array(digest));
}

/** Content hash in the document's asset format: `sha256-<hex>`. */
export async function contentHash(data: Uint8Array): Promise<string> {
  return `sha256-${await sha256Hex(data)}`;
}

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array, start = 0, end = data.length): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export const readU16BE = (d: Uint8Array, o: number) => (d[o]! << 8) | d[o + 1]!;
export const readU32BE = (d: Uint8Array, o: number) =>
  ((d[o]! << 24) | (d[o + 1]! << 16) | (d[o + 2]! << 8) | d[o + 3]!) >>> 0;
export const readU16LE = (d: Uint8Array, o: number) => d[o]! | (d[o + 1]! << 8);
export const readU24LE = (d: Uint8Array, o: number) => d[o]! | (d[o + 1]! << 8) | (d[o + 2]! << 16);
