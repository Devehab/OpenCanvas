/**
 * Node.js platform for the renderer, backed by @napi-rs/canvas (Skia).
 *
 * Used for headless export workers, server-side thumbnails and the visual
 * regression test suite. Fonts must be registered explicitly with
 * {@link registerFont} (woff, woff2, ttf and otf are supported).
 */
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { DrawableImage } from './images';
import { type CanvasLike, detectCapabilities, type RenderPlatform } from './platform';

export function createNodePlatform(): RenderPlatform {
  const create = (width: number, height: number): CanvasLike =>
    createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height))) as unknown as CanvasLike;
  return { createCanvas: create, ...detectCapabilities(create(4, 4)) };
}

/** Registers a font file under a family name. Returns false if the file could not be loaded. */
export function registerFont(path: string, family: string): boolean {
  return Boolean(GlobalFonts.registerFromPath(path, family));
}

/** Decodes an encoded image (PNG, JPEG, WebP, GIF, SVG) into a drawable image. */
export async function decodeImage(data: Uint8Array | ArrayBuffer): Promise<DrawableImage> {
  const buffer =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return (await loadImage(buffer)) as unknown as DrawableImage;
}

/** Encodes a canvas created by {@link createNodePlatform}. */
export async function encodeCanvas(
  canvas: CanvasLike,
  format: 'png' | 'jpeg' | 'webp',
  quality = 0.92,
): Promise<Uint8Array> {
  const c = canvas as unknown as { encode(format: string, quality?: number): Promise<Buffer> };
  const buffer = format === 'png' ? await c.encode('png') : await c.encode(format, Math.round(quality * 100));
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
