/**
 * Image upload pipeline: validate bytes (magic numbers, size, pixel count)
 * BEFORE decoding, sanitize SVG, content-hash, store locally, then create the
 * asset record.
 */
import type { AssetRecord } from '@opencanvas/core';
import { decodeBlob } from '@opencanvas/editor/dom';
import { checkImageUpload, contentHash, type UploadCheck } from '@opencanvas/export';
import type { DrawableImage } from '@opencanvas/renderer';
import DOMPurify from 'dompurify';
import { assetRecordFor, putAssetBlob } from './storage/assets';

export type UploadError = Exclude<UploadCheck, { ok: true }>['reason'] | 'decode' | 'storage';

export type PreparedImage =
  | { ok: true; asset: AssetRecord; image: DrawableImage }
  | { ok: false; reason: UploadError; name: string };

/**
 * Removes scripts, event handlers, foreignObject and external references from
 * SVG. Inline styles stay (many editors export them): uploads are only ever
 * drawn as images, where CSS cannot run code or fetch anything.
 */
export function sanitizeSvg(svg: string): string | null {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['href', 'xlink:href']) {
      const value = node.getAttribute(attr);
      if (value && !value.startsWith('#') && !value.startsWith('data:image/')) node.removeAttribute(attr);
    }
  });
  try {
    const clean = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'object', 'embed'],
    });
    return /<svg[\s>]/i.test(clean) ? clean : null;
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

/**
 * Gives an SVG an intrinsic size from its view box when it has none (or only
 * a relative one). Without it the browser falls back to a default size
 * (300×150, or 200×150 for a 4:3 view box) whose coordinates do not match the
 * drawing, so the canvas, which crops by intrinsic size, would show only a
 * corner of it. Small drawings (icons) are sized up to 512 px on their longer
 * side, a usable size when inserted.
 */
export function withIntrinsicSize(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return svg;
  const absolute = (name: string) => {
    const value = root.getAttribute(name)?.trim() ?? '';
    return /^\d*\.?\d+(px)?$/.test(value) ? Number.parseFloat(value) : null;
  };
  const width = absolute('width');
  const height = absolute('height');
  if (width && height) return svg;
  const box = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box.length !== 4 || !(box[2]! > 0) || !(box[3]! > 0)) return svg;
  const [, , boxWidth, boxHeight] = box as [number, number, number, number];
  let w = width ?? (height ? (height * boxWidth) / boxHeight : boxWidth);
  let h = height ?? (width ? (width * boxHeight) / boxWidth : boxHeight);
  const scale = Math.max(1, 512 / Math.max(w, h));
  w = Math.round(w * scale * 100) / 100;
  h = Math.round(h * scale * 100) / 100;
  root.setAttribute('width', String(w));
  root.setAttribute('height', String(h));
  return new XMLSerializer().serializeToString(doc);
}

export async function prepareImage(
  file: Blob,
  name: string,
  options: { library?: boolean } = {},
): Promise<PreparedImage> {
  let bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImageUpload(bytes);
  if (!check.ok) return { ok: false, reason: check.reason, name };
  let mimeType: string = check.info.mimeType;
  if (mimeType === 'image/svg+xml') {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    if (!clean) return { ok: false, reason: 'corrupt', name };
    bytes = new TextEncoder().encode(withIntrinsicSize(clean));
    mimeType = 'image/svg+xml';
  }
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
  let image: DrawableImage;
  try {
    image = await decodeBlob(blob);
  } catch {
    return { ok: false, reason: 'decode', name };
  }
  const hash = await contentHash(bytes);
  const width = image.width || 512;
  const height = image.height || 512;
  try {
    await putAssetBlob({ hash, blob, mimeType, width, height, name, library: options.library });
  } catch {
    // The browser refused to keep the file (Safari private windows cannot store files).
    return { ok: false, reason: 'storage', name };
  }
  return {
    ok: true,
    asset: assetRecordFor({ hash, mimeType, width, height, name, size: bytes.length }),
    image,
  };
}
