/**
 * Converts model paints (solid / gradients) into canvas styles.
 */
import { type Fill, toCssColor } from '@opencanvas/core';
import type { Context2D } from './platform';

export interface GradientGeometry {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * CSS linear-gradient geometry for a box: 0° points up, 90° points right, and
 * the gradient line is long enough for the corners to receive the end colors.
 */
export function linearGradientLine(angleDeg: number, width: number, height: number): GradientGeometry {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/** Radius reaching the farthest corner from (cx, cy) — CSS `farthest-corner`. */
export function radialGradientRadius(cx: number, cy: number, width: number, height: number): number {
  return Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy),
  );
}

/**
 * Canvas fill/stroke style for a paint over the box (ox, oy, width, height) in
 * the current coordinate space.
 */
export function toCanvasPaint(
  ctx: Context2D,
  fill: Fill,
  width: number,
  height: number,
  ox = 0,
  oy = 0,
): string | CanvasGradient {
  switch (fill.type) {
    case 'solid':
      return toCssColor(fill.color);
    case 'linear-gradient': {
      const g = linearGradientLine(fill.angle, width, height);
      const gradient = ctx.createLinearGradient(g.x0 + ox, g.y0 + oy, g.x1 + ox, g.y1 + oy);
      for (const stop of fill.stops)
        gradient.addColorStop(Math.min(1, Math.max(0, stop.offset)), toCssColor(stop.color));
      return gradient;
    }
    case 'radial-gradient': {
      const cx = fill.cx * width;
      const cy = fill.cy * height;
      const r = Math.max(1e-6, radialGradientRadius(cx, cy, width, height));
      const gradient = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      for (const stop of fill.stops)
        gradient.addColorStop(Math.min(1, Math.max(0, stop.offset)), toCssColor(stop.color));
      return gradient;
    }
  }
}

/** Canvas blend mode for a model blend mode. */
export function toCompositeOperation(mode: string): GlobalCompositeOperation {
  return (mode === 'normal' ? 'source-over' : mode) as GlobalCompositeOperation;
}

/** Dash pattern for a stroke style. */
export function dashPattern(style: 'solid' | 'dashed' | 'dotted', width: number): number[] {
  const w = Math.max(width, 0.5);
  if (style === 'dashed') return [w * 3, w * 2];
  if (style === 'dotted') return [0, w * 2];
  return [];
}
