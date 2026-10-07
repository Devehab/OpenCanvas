/**
 * How records are stored in the bucket (local server only).
 *
 * Larger records (designs, mostly) are gzip-compressed, which makes them
 * five to ten times smaller to upload and download. They are stored with
 * Content-Encoding: gzip, so any HTTP client (older OpenCanvas versions
 * included) gets the JSON back; a service that returns the compressed bytes
 * as they are is handled too. Files (blobs) are never touched: images and
 * fonts are compressed already, and they are kept byte for byte.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

/** Records smaller than this are stored as plain JSON (compressing them saves little). */
export const COMPRESS_FROM_BYTES = 4096;

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** The bytes to store for a record's JSON, and their Content-Encoding. */
export function encodeRecord(json: Uint8Array): { body: Uint8Array; contentEncoding?: 'gzip' } {
  if (json.byteLength < COMPRESS_FROM_BYTES) return { body: json };
  return { body: new Uint8Array(gzipSync(json, { level: 6 })), contentEncoding: 'gzip' };
}

/** A stored record's JSON, compressed or not. */
export function decodeRecord(body: Uint8Array): Uint8Array {
  return isGzip(body) ? new Uint8Array(gunzipSync(body)) : body;
}
