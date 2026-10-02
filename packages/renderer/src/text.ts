/**
 * Draws laid-out text (fragments, list markers, decorations, effects).
 */
import { graphemes, type TextLayout, type TextNode, toCssColor } from '@opencanvas/core';
import type { Context2D, RenderPlatform } from './platform';

type Ctx = Context2D & { letterSpacing?: string };

function setFont(
  ctx: Ctx,
  font: string,
  direction: 'ltr' | 'rtl',
  letterSpacing: number,
  platform: RenderPlatform,
) {
  ctx.font = font;
  ctx.direction = direction;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (platform.supportsLetterSpacing) ctx.letterSpacing = `${letterSpacing}px`;
}

type DrawOp = 'fill' | 'stroke';

/** Draws one fragment, emulating letter spacing for LTR text where the platform lacks it. */
function drawFragmentText(
  ctx: Ctx,
  op: DrawOp,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  direction: 'ltr' | 'rtl',
  platform: RenderPlatform,
): void {
  if (platform.supportsLetterSpacing || letterSpacing === 0 || direction === 'rtl') {
    if (op === 'fill') ctx.fillText(text, x, y);
    else ctx.strokeText(text, x, y);
    return;
  }
  let cursor = x;
  for (const g of graphemes(text)) {
    if (op === 'fill') ctx.fillText(g, cursor, y);
    else ctx.strokeText(g, cursor, y);
    cursor += ctx.measureText(g).width + letterSpacing;
  }
}

export interface TextDrawOptions {
  platform: RenderPlatform;
  /** Uniform device scale of the current transform (shadow/glow sizes are in device px). */
  deviceScale: number;
}

function roundedRect(ctx: Context2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Bounding box of a line's ink area (used by the highlight background effect). */
export function lineInkBox(
  line: TextLayout['lines'][number],
): { x: number; y: number; width: number; height: number } | null {
  const items = line.marker ? [line.marker, ...line.fragments] : line.fragments;
  if (items.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let size = 0;
  for (const f of items) {
    minX = Math.min(minX, f.x);
    maxX = Math.max(maxX, f.x + f.width);
    size = Math.max(size, f.style.fontSize);
  }
  return { x: minX, y: line.baseline - size * 0.9, width: maxX - minX, height: size * 1.2 };
}

export function drawText(ctx: Ctx, node: TextNode, layout: TextLayout, options: TextDrawOptions): void {
  const { platform, deviceScale } = options;
  const effect = node.effect;

  if (effect?.type === 'background') {
    ctx.save();
    ctx.fillStyle = toCssColor(effect.color);
    for (const line of layout.lines) {
      const ink = lineInkBox(line);
      if (!ink) continue;
      const pad = effect.padding;
      roundedRect(ctx, ink.x - pad, ink.y - pad * 0.5, ink.width + pad * 2, ink.height + pad, effect.radius);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const line of layout.lines) {
    const items = line.marker ? [line.marker, ...line.fragments] : line.fragments;
    for (const f of items) {
      const s = f.style;
      setFont(ctx, s.font, f.direction, s.letterSpacing, platform);
      const color = toCssColor(s.color);
      const y = line.baseline;

      if (effect?.type === 'echo') {
        ctx.fillStyle = toCssColor(effect.color);
        drawFragmentText(
          ctx,
          'fill',
          f.text,
          f.x + effect.offsetX,
          y + effect.offsetY,
          s.letterSpacing,
          f.direction,
          platform,
        );
      }
      if (effect?.type === 'neon') {
        ctx.save();
        ctx.fillStyle = toCssColor(effect.color);
        // Glow radius as a gaussian std-deviation in device pixels.
        const glow = s.fontSize * (0.15 + effect.intensity / 250) * deviceScale;
        for (const sigma of [glow, glow / 2]) {
          if (platform.supportsFilter) {
            // Filter blur is unclipped and consistent across Chrome, Firefox and Skia.
            ctx.filter = `blur(${sigma}px)`;
          } else {
            // Safari: shadows (shadowBlur is twice the std-deviation).
            ctx.shadowColor = toCssColor(effect.color);
            ctx.shadowBlur = sigma * 2;
          }
          drawFragmentText(ctx, 'fill', f.text, f.x, y, s.letterSpacing, f.direction, platform);
        }
        ctx.restore();
      }
      if (effect?.type === 'outline' && effect.width > 0) {
        ctx.save();
        ctx.strokeStyle = toCssColor(effect.color);
        ctx.lineWidth = effect.width * 2;
        ctx.lineJoin = 'round';
        drawFragmentText(ctx, 'stroke', f.text, f.x, y, s.letterSpacing, f.direction, platform);
        ctx.restore();
      }
      if (effect?.type === 'hollow') {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, effect.width);
        ctx.lineJoin = 'round';
        drawFragmentText(ctx, 'stroke', f.text, f.x, y, s.letterSpacing, f.direction, platform);
        ctx.restore();
      } else {
        ctx.fillStyle = effect?.type === 'neon' ? toCssColor('#ffffff') : color;
        if (effect?.type === 'neon') ctx.globalAlpha *= 0.95;
        drawFragmentText(ctx, 'fill', f.text, f.x, y, s.letterSpacing, f.direction, platform);
        if (effect?.type === 'neon') ctx.globalAlpha /= 0.95;
      }
      if (s.underline || s.strikethrough) {
        const thickness = Math.max(1 / deviceScale, s.fontSize * 0.06);
        ctx.fillStyle = color;
        if (s.underline) ctx.fillRect(f.x, y + s.fontSize * 0.12, f.width, thickness);
        if (s.strikethrough) ctx.fillRect(f.x, y - s.fontSize * 0.3, f.width, thickness);
      }
    }
  }
  if (platform.supportsLetterSpacing) ctx.letterSpacing = '0px';
}
