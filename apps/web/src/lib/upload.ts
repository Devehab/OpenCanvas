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

export async function prepareImage(file: Blob, name: string): Promise<PreparedImage> {
  let bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImageUpload(bytes);
  if (!check.ok) return { ok: false, reason: check.reason, name };
  let mimeType: string = check.info.mimeType;
  if (mimeType === 'image/svg+xml') {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    if (!clean) return { ok: false, reason: 'corrupt', name };
    bytes = new TextEncoder().encode(clean);
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
    await putAssetBlob({ hash, blob, mimeType, width, height, name });
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
