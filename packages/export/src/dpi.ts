/**
 * Embeds print resolution (DPI) metadata in PNG (pHYs chunk) and JPEG (JFIF
 * density) files, so print shops and editors see e.g. "300 dpi".
 */
import { concatBytes, crc32, readU16BE, readU32BE } from './bytes';

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33 || readU32BE(png, 12) !== 0x49484452) return png; // 'IHDR'
  const ppm = Math.round(dpi / 0.0254);
  const body = concatBytes([
    new Uint8Array([0x70, 0x48, 0x59, 0x73]),
    u32(ppm),
    u32(ppm),
    new Uint8Array([1]),
  ]);
  const chunk = concatBytes([u32(9), body, u32(crc32(body))]);
  // Drop an existing pHYs chunk, insert ours right after IHDR (8 sig + 25 IHDR bytes).
  const parts: Uint8Array[] = [png.subarray(0, 33), chunk];
  let offset = 33;
  while (offset + 8 <= png.length) {
    const length = readU32BE(png, offset);
    const type = readU32BE(png, offset + 4);
    const end = offset + 12 + length;
    if (type !== 0x70485973) parts.push(png.subarray(offset, end));
    offset = end;
  }
  return concatBytes(parts);
}

export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  // Expect SOI followed by a JFIF APP0 segment; otherwise insert one.
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0 && String.fromCharCode(...jpeg.subarray(6, 10)) === 'JFIF') {
    const out = jpeg.slice();
    out[13] = 1; // units: dots per inch
    out[14] = d >> 8;
    out[15] = d & 0xff;
    out[16] = d >> 8;
    out[17] = d & 0xff;
    return out;
  }
  const app0 = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    d >> 8,
    d & 0xff,
    d >> 8,
    d & 0xff,
    0x00,
    0x00,
  ]);
  return concatBytes([jpeg.subarray(0, 2), app0, jpeg.subarray(2)]);
}

export function readPngDpi(png: Uint8Array): number | null {
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = readU32BE(png, offset);
    if (readU32BE(png, offset + 4) === 0x70485973 && png[offset + 16] === 1) {
      return Math.round(readU32BE(png, offset + 8) * 0.0254);
    }
    offset += 12 + length;
  }
  return null;
}

export function readJpegDpi(jpeg: Uint8Array): number | null {
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0 && jpeg[13] === 1) return readU16BE(jpeg, 14);
  return null;
}
