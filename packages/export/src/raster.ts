/**
 * Raster export (PNG / JPEG / WebP) built on the shared renderer, so exported
 * pixels are produced by exactly the code that draws the editor canvas.
 */
import type { DocumentStore, Id } from '@opencanvas/core';
import {
  type CanvasLike,
  context2d,
  type RenderPlatform,
  rasterizePage,
  type SceneRenderer,
} from '@opencanvas/renderer';
import { setJpegDpi, setPngDpi } from './dpi';
import { encodeIndexedPng, quantizeRgba } from './quantize';

export type RasterFormat = 'png' | 'jpeg' | 'webp';

export const RASTER_MIME: Record<RasterFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Encodes canvases; implemented per platform (browser: convertToBlob/toBlob, Node: Skia). */
export interface CanvasEncoder {
  encode(canvas: CanvasLike, format: RasterFormat, quality: number): Promise<Uint8Array>;
}

export interface ExportContext {
  store: DocumentStore;
  renderer: SceneRenderer;
  platform: RenderPlatform;
  encoder: CanvasEncoder;
}

export interface RasterExportOptions {
  format: RasterFormat;
  /** Output pixels per design pixel (1x, 2x, 4x…). Ignored when `dpi` is set. */
  scale?: number;
  /** Print resolution; the design is 96 DPI, so 300 DPI = scale 3.125. Also written into file metadata. */
  dpi?: number;
  /** Skip the page background (PNG/WebP only). */
  transparent?: boolean;
  /** 0–1 for JPEG/WebP. */
  quality?: number;
  /** Safety cap on output pixels. */
  maxPixels?: number;
  /** PNG only: reduce to a 256-color palette (much smaller files). */
  compress?: boolean;
}

export interface RasterExportResult {
  pageId: Id;
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

export const DESIGN_DPI = 96;

export function scaleForDpi(dpi: number): number {
  return dpi / DESIGN_DPI;
}

export async function exportPageRaster(
  ctx: ExportContext,
  pageId: Id,
  options: RasterExportOptions,
): Promise<RasterExportResult> {
  const scale = options.dpi ? scaleForDpi(options.dpi) : (options.scale ?? 1);
  const transparent = options.transparent === true && options.format !== 'jpeg';
  const raster = rasterizePage(ctx.renderer, ctx.platform, ctx.store, pageId, {
    scale,
    background: !transparent,
    quality: 'export',
    placeholders: false,
    maxPixels: options.maxPixels,
  });
  let data: Uint8Array;
  if (options.format === 'png' && options.compress) {
    const pixels = context2d(raster.canvas).getImageData(0, 0, raster.width, raster.height).data;
    data = await encodeIndexedPng(raster.width, raster.height, quantizeRgba(pixels, 256));
  } else {
    data = await ctx.encoder.encode(raster.canvas, options.format, options.quality ?? 0.92);
  }
  if (options.dpi) {
    if (options.format === 'png') data = setPngDpi(data, options.dpi);
    else if (options.format === 'jpeg') data = setJpegDpi(data, options.dpi);
  }
  return { pageId, data, mimeType: RASTER_MIME[options.format], width: raster.width, height: raster.height };
}

/** Parses page ranges like "1-3, 5" (1-based, inclusive) into page ids. Empty = all pages. */
export function resolvePageRange(pageIds: readonly Id[], range: string | null | undefined): Id[] {
  if (!range || !range.trim()) return [...pageIds];
  const out = new Set<number>();
  for (const part of range.split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) throw new Error(`Invalid page range: "${part.trim()}"`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= pageIds.length) out.add(i - 1);
  }
  if (out.size === 0) throw new Error('Page range does not include any page');
  return [...out].sort((x, y) => x - y).map((i) => pageIds[i]!);
}
