/**
 * Turns an SVG file into an icon like the built-in library's: one path with
 * a view box, stroked (outline icons) or filled. The SVG is sanitized first;
 * basic shapes are converted to path data. Shapes with a `transform` are not
 * supported and are skipped (export icons with transforms flattened).
 */
import type { CustomIcon } from './storage/db';
import { sanitizeSvg } from './upload';

const MAX_PATH_LENGTH = 200_000;
const SKIP = new Set(['defs', 'clipPath', 'mask', 'pattern', 'symbol', 'title', 'desc', 'metadata', 'style']);

const num = (el: Element, name: string, fallback = 0) => {
  const v = Number.parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : fallback;
};
const fmt = (n: number) => Number(n.toFixed(3)).toString();

function points(el: Element): number[] {
  return (el.getAttribute('points') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);
}

/** Path data for one SVG element, or null if it is not a drawable shape. */
function shapeToPath(el: Element): string | null {
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d')?.trim() || null;
    case 'rect': {
      const x = num(el, 'x');
      const y = num(el, 'y');
      const w = num(el, 'width');
      const h = num(el, 'height');
      if (w <= 0 || h <= 0) return null;
      let rx = num(el, 'rx', Number.NaN);
      let ry = num(el, 'ry', Number.NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`;
      const arc = (dx: number, dy: number) => `a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`;
      return `M${fmt(x + rx)} ${fmt(y)}h${fmt(w - 2 * rx)}${arc(rx, ry)}v${fmt(h - 2 * ry)}${arc(-rx, ry)}h${fmt(-(w - 2 * rx))}${arc(-rx, -ry)}v${fmt(-(h - 2 * ry))}${arc(rx, -ry)}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(el, 'cx');
      const cy = num(el, 'cy');
      const rx = el.localName === 'circle' ? num(el, 'r') : num(el, 'rx');
      const ry = el.localName === 'circle' ? num(el, 'r') : num(el, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`;
    }
    case 'line':
      return `M${fmt(num(el, 'x1'))} ${fmt(num(el, 'y1'))}L${fmt(num(el, 'x2'))} ${fmt(num(el, 'y2'))}`;
    case 'polyline':
    case 'polygon': {
      const p = points(el);
      if (p.length < 4) return null;
      let d = `M${fmt(p[0]!)} ${fmt(p[1]!)}`;
      for (let i = 2; i + 1 < p.length; i += 2) d += `L${fmt(p[i]!)} ${fmt(p[i + 1]!)}`;
      return el.localName === 'polygon' ? `${d}Z` : d;
    }
    default:
      return null;
  }
}

/** The effective value of a presentation attribute (own, inherited, or in a style attribute). */
function paint(el: Element, name: 'fill' | 'stroke' | 'stroke-width'): string | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = node.getAttribute('style');
    const fromStyle = style
      ? new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style)?.[1]?.trim()
      : undefined;
    const value = fromStyle ?? node.getAttribute(name);
    if (value) return value;
  }
  return null;
}

export type SvgIconResult =
  | { ok: true; icon: Omit<CustomIcon, 'id'> }
  | { ok: false; reason: 'invalid' | 'empty' };

export function svgToIcon(svgText: string, name: string, keywords: string[] = []): SvgIconResult {
  const clean = sanitizeSvg(svgText);
  if (!clean) return { ok: false, reason: 'invalid' };
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return { ok: false, reason: 'invalid' };
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const viewBox =
    vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0
      ? { x: vb[0]!, y: vb[1]!, width: vb[2]!, height: vb[3]! }
      : { x: 0, y: 0, width: num(root, 'width', 24) || 24, height: num(root, 'height', 24) || 24 };

  const parts: string[] = [];
  let first: Element | null = null;
  const walk = (el: Element, transformed: boolean) => {
    for (const child of Array.from(el.children)) {
      if (SKIP.has(child.localName)) continue;
      const t = transformed || child.hasAttribute('transform');
      const d = t ? null : shapeToPath(child);
      if (d) {
        parts.push(d);
        first ??= child;
      }
      walk(child, t);
    }
  };
  walk(root, false);
  const path = parts.join(' ');
  if (!path || path.length > MAX_PATH_LENGTH) return { ok: false, reason: 'empty' };

  // Outline icons (fill none, a stroke) stay stroked; everything else is filled.
  const sample = first ?? root;
  const fill = paint(sample, 'fill');
  const stroke = paint(sample, 'stroke');
  const outline = fill === 'none' && !!stroke && stroke !== 'none';
  const strokeWidth = Number.parseFloat(paint(sample, 'stroke-width') ?? '') || 2;
  const words = [
    ...new Set([...name.toLowerCase().split(/[\s_-]+/), ...keywords.map((k) => k.toLowerCase())]),
  ].filter(Boolean);
  return {
    ok: true,
    icon: {
      name: name.replace(/[-_]+/g, ' ').trim().slice(0, 64) || 'icon',
      keywords: words.slice(0, 30),
      path,
      viewBox,
      style: outline ? 'outline' : 'filled',
      strokeWidth: outline ? strokeWidth : 0,
    },
  };
}
