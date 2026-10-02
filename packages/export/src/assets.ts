/**
 * Asset inspection: file type sniffing (magic numbers, never trusting the file
 * name or declared MIME type) and header-only dimension parsing, so oversized
 * images can be rejected before they are decoded.
 */
import { readU16BE, readU16LE, readU24LE, readU32BE, textDecoder } from './bytes';

export type ImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif'
  | 'image/svg+xml';

export const SUPPORTED_IMAGE_TYPES: readonly ImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
];

const startsWith = (d: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => d[offset + i] === b);
const ascii = (d: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...d.subarray(offset, offset + length));

/** Detects the image type from content. Returns null for anything that is not a supported image. */
export function detectImageType(data: Uint8Array): ImageMimeType | null {
  if (data.length < 12) return null;
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii(data, 0, 6) === 'GIF87a' || ascii(data, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(data, 4, 4) === 'ftyp' && /avi[fs]/.test(ascii(data, 8, Math.min(32, data.length - 8))))
    return 'image/avif';
  // SVG: text that starts (after BOM / whitespace / XML prolog / comments) with an <svg element.
  const head = textDecoder.decode(data.subarray(0, Math.min(data.length, 4096))).replace(/^﻿/, '');
  const stripped = head.replace(/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?/i, '');
  if (/^<svg[\s>]/i.test(stripped)) return 'image/svg+xml';
  return null;
}

export interface ImageInfo {
  mimeType: ImageMimeType;
  /** Display size (EXIF orientation applied for JPEG). Null when it needs a full decode (AVIF, SVG). */
  width: number | null;
  height: number | null;
}

function jpegOrientation(d: Uint8Array, app1: number, length: number): number {
  // APP1: "Exif\0\0" + TIFF header
  if (ascii(d, app1, 4) !== 'Exif') return 1;
  const tiff = app1 + 6;
  const little = ascii(d, tiff, 2) === 'II';
  const u16 = (o: number) => (little ? readU16LE(d, o) : readU16BE(d, o));
  const u32 = (o: number) =>
    little ? (readU16LE(d, o) | (readU16LE(d, o + 2) << 16)) >>> 0 : readU32BE(d, o);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > app1 + length) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > d.length) break;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

/** Reads dimensions from image headers without decoding pixels. */
export function readImageInfo(data: Uint8Array): ImageInfo | null {
  const mimeType = detectImageType(data);
  if (!mimeType) return null;
  try {
    switch (mimeType) {
      case 'image/png':
        if (ascii(data, 12, 4) !== 'IHDR') return null;
        return { mimeType, width: readU32BE(data, 16), height: readU32BE(data, 20) };
      case 'image/gif':
        return { mimeType, width: readU16LE(data, 6), height: readU16LE(data, 8) };
      case 'image/webp': {
        const chunk = ascii(data, 12, 4);
        if (chunk === 'VP8 ') {
          return { mimeType, width: readU16LE(data, 26) & 0x3fff, height: readU16LE(data, 28) & 0x3fff };
        }
        if (chunk === 'VP8L') {
          const b0 = data[21]!;
          const b1 = data[22]!;
          const b2 = data[23]!;
          const b3 = data[24]!;
          return {
            mimeType,
            width: 1 + (((b1 & 0x3f) << 8) | b0),
            height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
          };
        }
        if (chunk === 'VP8X')
          return { mimeType, width: 1 + readU24LE(data, 24), height: 1 + readU24LE(data, 27) };
        return null;
      }
      case 'image/jpeg': {
        let offset = 2;
        let orientation = 1;
        while (offset + 9 < data.length) {
          if (data[offset] !== 0xff) return null;
          const marker = data[offset + 1]!;
          if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            offset += 2;
            continue;
          }
          const length = readU16BE(data, offset + 2);
          if (marker === 0xe1) orientation = jpegOrientation(data, offset + 4, length - 2);
          const isSOF =
            marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
          if (isSOF) {
            const height = readU16BE(data, offset + 5);
            const width = readU16BE(data, offset + 7);
            const swap = orientation >= 5 && orientation <= 8;
            return { mimeType, width: swap ? height : width, height: swap ? width : height };
          }
          offset += 2 + length;
        }
        return null;
      }
      default:
        return { mimeType, width: null, height: null };
    }
  } catch {
    return null;
  }
}

export interface UploadPolicy {
  maxBytes: number;
  maxPixels: number;
  maxDimension: number;
  allowed: readonly ImageMimeType[];
}

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  maxBytes: 50 * 1024 * 1024,
  maxPixels: 100_000_000,
  maxDimension: 20_000,
  allowed: SUPPORTED_IMAGE_TYPES,
};

export type UploadCheck =
  | { ok: true; info: ImageInfo }
  | { ok: false; reason: 'empty' | 'too-large' | 'unsupported' | 'too-many-pixels' | 'corrupt' };

/** Validates an uploaded file BEFORE decoding it. */
export function checkImageUpload(
  data: Uint8Array,
  policy: UploadPolicy = DEFAULT_UPLOAD_POLICY,
): UploadCheck {
  if (data.length === 0) return { ok: false, reason: 'empty' };
  if (data.length > policy.maxBytes) return { ok: false, reason: 'too-large' };
  const info = readImageInfo(data);
  if (!info)
    return detectImageType(data) ? { ok: false, reason: 'corrupt' } : { ok: false, reason: 'unsupported' };
  if (!policy.allowed.includes(info.mimeType)) return { ok: false, reason: 'unsupported' };
  if (info.width !== null && info.height !== null) {
    if (info.width === 0 || info.height === 0) return { ok: false, reason: 'corrupt' };
    if (
      info.width > policy.maxDimension ||
      info.height > policy.maxDimension ||
      info.width * info.height > policy.maxPixels
    ) {
      return { ok: false, reason: 'too-many-pixels' };
    }
  }
  return { ok: true, info };
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}
