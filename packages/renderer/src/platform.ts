/**
 * Platform abstraction: everything the renderer needs from its host
 * environment (browser, Web Worker or Node). Keeps the renderer itself free of
 * DOM globals so it runs identically in all of them.
 */

/** Minimal canvas surface the renderer can draw into and read back. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): unknown;
}

export type Context2D = CanvasRenderingContext2D;

export interface RenderPlatform {
  /** Creates an offscreen canvas (used for layers, filters and image processing). */
  createCanvas(width: number, height: number): CanvasLike;
  /** Whether `ctx.filter = 'blur(…)'` works. */
  readonly supportsFilter: boolean;
  /** Whether `ctx.letterSpacing` works. */
  readonly supportsLetterSpacing: boolean;
}

export function context2d(canvas: CanvasLike): Context2D {
  const ctx = canvas.getContext('2d') as Context2D | null;
  if (!ctx) throw new Error('2D canvas context is not available');
  return ctx;
}

/** Detects context capabilities on a scratch canvas. */
export function detectCapabilities(canvas: CanvasLike): {
  supportsFilter: boolean;
  supportsLetterSpacing: boolean;
} {
  const ctx = context2d(canvas) as Context2D & { letterSpacing?: string };
  let supportsFilter = false;
  let supportsLetterSpacing = false;
  try {
    ctx.filter = 'blur(2px)';
    supportsFilter = ctx.filter === 'blur(2px)';
    ctx.filter = 'none';
  } catch {
    supportsFilter = false;
  }
  try {
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = '2px';
      supportsLetterSpacing = ctx.letterSpacing === '2px';
      ctx.letterSpacing = '0px';
    }
  } catch {
    supportsLetterSpacing = false;
  }
  return { supportsFilter, supportsLetterSpacing };
}

/** Browser / worker platform (OffscreenCanvas when available, otherwise <canvas>). */
export function createBrowserPlatform(): RenderPlatform {
  const create = (width: number, height: number): CanvasLike => {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as CanvasLike;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  };
  const caps = detectCapabilities(create(4, 4));
  return { createCanvas: create, ...caps };
}
