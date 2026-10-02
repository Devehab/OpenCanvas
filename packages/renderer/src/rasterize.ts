/**
 * Rasterization helpers shared by thumbnails and exporters.
 */
import type { DocumentStore, Id } from '@opencanvas/core';
import { type CanvasLike, context2d, type RenderPlatform } from './platform';
import type { RenderOptions, RenderStats, SceneRenderer } from './renderer';

export interface RasterizeOptions extends Omit<RenderOptions, 'transform'> {
  /** Output pixels per page pixel. Default 1. */
  scale?: number;
  /** Max output pixels (width × height); the scale is reduced to fit. Default 100M. */
  maxPixels?: number;
}

export interface RasterResult {
  canvas: CanvasLike;
  width: number;
  height: number;
  scale: number;
  stats: RenderStats;
}

/** Renders a page into a new canvas. */
export function rasterizePage(
  renderer: SceneRenderer,
  platform: RenderPlatform,
  store: DocumentStore,
  pageId: Id,
  options: RasterizeOptions = {},
): RasterResult {
  const page = store.getPage(pageId);
  if (!page) throw new Error(`Page ${pageId} not found`);
  let scale = options.scale ?? 1;
  const maxPixels = options.maxPixels ?? 100_000_000;
  if (page.width * page.height * scale * scale > maxPixels)
    scale = Math.sqrt(maxPixels / (page.width * page.height));
  const width = Math.max(1, Math.round(page.width * scale));
  const height = Math.max(1, Math.round(page.height * scale));
  const canvas = platform.createCanvas(width, height);
  const ctx = context2d(canvas);
  const sx = width / page.width;
  const sy = height / page.height;
  const stats = renderer.renderPage(ctx, store, pageId, {
    ...options,
    transform: { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 },
  });
  return { canvas, width, height, scale, stats };
}
