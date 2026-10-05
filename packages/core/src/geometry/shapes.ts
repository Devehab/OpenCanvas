/**
 * Parametric shape outlines. Every generator returns a path inside the box
 * [0, width] × [0, height] so shapes scale with their node.
 */

import type { Vec } from '../math/vec';
import type { ShapeKind } from '../model/types';
import { type PathCommand, parseSvgPath, pathBounds } from './path';

export interface ShapeParams {
  cornerRadius: number;
  sides: number;
  innerRatio: number;
}

const KAPPA = 0.5522847498307936;

export function rectPath(x: number, y: number, w: number, h: number, radius = 0): PathCommand[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r <= 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  const k = r * KAPPA;
  return [
    ['M', x + r, y],
    ['L', x + w - r, y],
    ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    ['L', x + w, y + h - r],
    ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    ['L', x + r, y + h],
    ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    ['L', x, y + r],
    ['C', x, y + r - k, x + r - k, y, x + r, y],
    ['Z'],
  ];
}

export function ellipsePath(x: number, y: number, w: number, h: number): PathCommand[] {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', cx, y],
    ['C', cx + kx, y, x + w, cy - ky, x + w, cy],
    ['C', x + w, cy + ky, cx + kx, y + h, cx, y + h],
    ['C', cx - kx, y + h, x, cy + ky, x, cy],
    ['C', x, cy - ky, cx - kx, y, cx, y],
    ['Z'],
  ];
}

/** Polygon with optionally rounded corners (quadratic fillets). */
export function polygonPath(points: readonly Vec[], radius = 0): PathCommand[] {
  const n = points.length;
  if (n < 3) return [];
  if (radius <= 0) {
    const out: PathCommand[] = [['M', points[0]!.x, points[0]!.y]];
    for (let i = 1; i < n; i++) out.push(['L', points[i]!.x, points[i]!.y]);
    out.push(['Z']);
    return out;
  }
  const out: PathCommand[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 === 0 || l2 === 0) continue;
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    const angle = Math.acos(cos);
    // Tangent distance for a circular fillet of `radius`, clamped to half of each edge.
    const tangent = angle > 1e-6 ? radius / Math.tan(angle / 2) : 0;
    const d = Math.min(tangent, l1 / 2, l2 / 2);
    const a = { x: curr.x + (v1x / l1) * d, y: curr.y + (v1y / l1) * d };
    const b = { x: curr.x + (v2x / l2) * d, y: curr.y + (v2y / l2) * d };
    out.push([i === 0 ? 'M' : 'L', a.x, a.y]);
    out.push(['Q', curr.x, curr.y, b.x, b.y]);
  }
  out.push(['Z']);
  return out;
}

/** Scales points so their bounding box fills [0, w] × [0, h]. */
function fitPoints(points: Vec[], w: number, h: number): Vec[] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;
  return points.map((p) => ({ x: ((p.x - minX) / sx) * w, y: ((p.y - minY) / sy) * h }));
}

export function regularPolygonPoints(sides: number, w: number, h: number): Vec[] {
  const n = Math.max(3, Math.round(sides));
  const offset = n % 2 === 0 ? Math.PI / n : 0; // flat top for even polygons
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + offset + (i * 2 * Math.PI) / n;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return fitPoints(pts, w, h);
}

export function starPoints(points: number, innerRatio: number, w: number, h: number): Vec[] {
  const n = Math.max(3, Math.round(points));
  const pts: Vec[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return fitPoints(pts, w, h);
}

const templates = new Map<
  string,
  { commands: PathCommand[]; box: { x: number; y: number; width: number; height: number } }
>();

/** An SVG path (any coordinates) stretched to fill the box exactly. */
function templatePath(d: string, w: number, h: number): PathCommand[] {
  let template = templates.get(d);
  if (!template) {
    const commands = parseSvgPath(d);
    template = { commands, box: pathBounds(commands, 0.001) };
    templates.set(d, template);
  }
  const { commands, box } = template;
  const sx = w / (box.width || 1);
  const sy = h / (box.height || 1);
  const X = (x: number) => (x - box.x) * sx;
  const Y = (y: number) => (y - box.y) * sy;
  return commands.map((c): PathCommand => {
    switch (c[0]) {
      case 'M':
        return ['M', X(c[1]), Y(c[2])];
      case 'L':
        return ['L', X(c[1]), Y(c[2])];
      case 'C':
        return ['C', X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6])];
      case 'Q':
        return ['Q', X(c[1]), Y(c[2]), X(c[3]), Y(c[4])];
      default:
        return ['Z'];
    }
  });
}

const TEMPLATES = {
  heart:
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  arch: 'M0 100V50A50 50 0 0 1 100 50V100Z',
  'half-circle': 'M0 50A50 50 0 0 1 100 50Z',
  'quarter-circle': 'M0 0A100 100 0 0 1 100 100H0Z',
  crescent: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  drop: 'M50 0C50 0 90 40 90 66A40 40 0 0 1 10 66C10 40 50 0 50 0Z',
  cloud: 'M24 90A22 22 0 0 1 20 46A30 30 0 0 1 76 36A27 27 0 0 1 78 90Z',
  blob: 'M47 3C72-2 97 14 99 42C101 68 83 94 55 98C27 102 3 86 1 58C-1 31 22 8 47 3Z',
  shield: 'M50 0L95 14V46C95 74 76 92 50 100C24 92 5 74 5 46V14Z',
  'round-bubble': 'M50 0A50 44 0 1 1 33 85L6 98L14 72A50 44 0 0 1 50 0Z',
} as const;

/** Circle with `n` rounded bumps around its edge (badge / flower frame). */
function scallopPath(n: number, w: number, h: number): PathCommand[] {
  const count = Math.max(5, Math.min(40, Math.round(n)));
  const pts: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    pts.push({ x: Math.cos(a) * 0.86, y: Math.sin(a) * 0.86 });
  }
  const controls = pts.map((_, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / count;
    // Control point beyond the chord: each bump rises ~35% of its width.
    const r = 0.86 * Math.cos(Math.PI / count) + 2 * 0.86 * Math.sin(Math.PI / count) * 0.7;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const out: PathCommand[] = [['M', pts[0]!.x, pts[0]!.y]];
  for (let i = 0; i < count; i++) {
    const next = pts[(i + 1) % count]!;
    out.push(['Q', controls[i]!.x, controls[i]!.y, next.x, next.y]);
  }
  out.push(['Z']);
  // Normalize like a template so the bumps touch the box.
  const box = pathBounds(out, 0.0001);
  const sx = w / box.width;
  const sy = h / box.height;
  return out.map((c): PathCommand => {
    if (c[0] === 'M' || c[0] === 'L') return [c[0], (c[1] - box.x) * sx, (c[2] - box.y) * sy];
    if (c[0] === 'Q')
      return ['Q', (c[1] - box.x) * sx, (c[2] - box.y) * sy, (c[3] - box.x) * sx, (c[4] - box.y) * sy];
    return c;
  });
}

/** Superellipse (|x|^4 + |y|^4 = 1): the "app icon" rounded square. */
function squirclePath(w: number, h: number): PathCommand[] {
  const steps = 72;
  const pts: Vec[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push({
      x: (w / 2) * (1 + Math.sign(c) * Math.abs(c) ** 0.5),
      y: (h / 2) * (1 + Math.sign(s) * Math.abs(s) ** 0.5),
    });
  }
  return polygonPath(pts);
}

/** Donut: outer ellipse plus a reversed inner ellipse (a hole under any fill rule). */
function ringPath(w: number, h: number, innerRatio: number): PathCommand[] {
  const r = Math.max(0.1, Math.min(0.95, innerRatio));
  const iw = w * r;
  const ih = h * r;
  const inner = ellipsePath((w - iw) / 2, (h - ih) / 2, iw, ih);
  // Reverse the inner subpath's direction.
  const pts = inner.filter((c) => c[0] === 'C') as ['C', number, number, number, number, number, number][];
  const start = inner[0] as ['M', number, number];
  const reversed: PathCommand[] = [['M', start[1], start[2]]];
  for (let i = pts.length - 1; i >= 0; i--) {
    const c = pts[i]!;
    const prev = i > 0 ? pts[i - 1]! : null;
    const end = prev ? { x: prev[5], y: prev[6] } : { x: start[1], y: start[2] };
    reversed.push(['C', c[3], c[4], c[1], c[2], end.x, end.y]);
  }
  reversed.push(['Z']);
  return [...ellipsePath(0, 0, w, h), ...reversed];
}

function speechBubblePath(w: number, h: number, radius: number): PathCommand[] {
  const bh = h * 0.78;
  const r = Math.max(0, Math.min(radius || Math.min(w, bh) * 0.18, w / 2, bh / 2));
  const k = r * KAPPA;
  const tailStart = w * 0.36;
  const tailEnd = w * 0.18;
  const tip = { x: w * 0.12, y: h };
  return [
    ['M', r, 0],
    ['L', w - r, 0],
    ['C', w - r + k, 0, w, r - k, w, r],
    ['L', w, bh - r],
    ['C', w, bh - r + k, w - r + k, bh, w - r, bh],
    ['L', Math.max(tailStart, r), bh],
    ['L', tip.x, tip.y],
    ['L', Math.max(tailEnd, Math.min(r, tailStart)), bh],
    ['L', r, bh],
    ['C', r - k, bh, 0, bh - r + k, 0, bh - r],
    ['L', 0, r],
    ['C', 0, r - k, r - k, 0, r, 0],
    ['Z'],
  ];
}

/** Outline of a shape kind inside a `w` × `h` box. */
export function getShapePath(
  kind: ShapeKind,
  w: number,
  h: number,
  params: Partial<ShapeParams> = {},
): PathCommand[] {
  const radius = params.cornerRadius ?? 0;
  switch (kind) {
    case 'rect':
      return rectPath(0, 0, w, h, radius);
    case 'ellipse':
      return ellipsePath(0, 0, w, h);
    case 'triangle':
      return polygonPath(
        [
          { x: w / 2, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        radius,
      );
    case 'right-triangle':
      return polygonPath(
        [
          { x: 0, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        radius,
      );
    case 'diamond':
      return polygonPath(
        [
          { x: w / 2, y: 0 },
          { x: w, y: h / 2 },
          { x: w / 2, y: h },
          { x: 0, y: h / 2 },
        ],
        radius,
      );
    case 'pentagon':
      return polygonPath(regularPolygonPoints(5, w, h), radius);
    case 'hexagon':
      return polygonPath(regularPolygonPoints(6, w, h), radius);
    case 'octagon':
      return polygonPath(regularPolygonPoints(8, w, h), radius);
    case 'polygon':
      return polygonPath(regularPolygonPoints(params.sides ?? 5, w, h), radius);
    case 'star':
      return polygonPath(starPoints(params.sides ?? 5, params.innerRatio ?? 0.5, w, h), radius);
    case 'arrow-right': {
      const head = Math.min(w * 0.45, h * 0.8);
      return polygonPath(
        [
          { x: 0, y: h * 0.28 },
          { x: w - head, y: h * 0.28 },
          { x: w - head, y: 0 },
          { x: w, y: h / 2 },
          { x: w - head, y: h },
          { x: w - head, y: h * 0.72 },
          { x: 0, y: h * 0.72 },
        ],
        radius,
      );
    }
    case 'arrow-left': {
      const head = Math.min(w * 0.45, h * 0.8);
      return polygonPath(
        [
          { x: w, y: h * 0.28 },
          { x: w, y: h * 0.72 },
          { x: head, y: h * 0.72 },
          { x: head, y: h },
          { x: 0, y: h / 2 },
          { x: head, y: 0 },
          { x: head, y: h * 0.28 },
        ],
        radius,
      );
    }
    case 'chevron': {
      const d = Math.min(w * 0.35, h * 0.5);
      return polygonPath(
        [
          { x: 0, y: 0 },
          { x: w - d, y: 0 },
          { x: w, y: h / 2 },
          { x: w - d, y: h },
          { x: 0, y: h },
          { x: d, y: h / 2 },
        ],
        radius,
      );
    }
    case 'cross': {
      const tx = w / 3;
      const ty = h / 3;
      return polygonPath(
        [
          { x: tx, y: 0 },
          { x: w - tx, y: 0 },
          { x: w - tx, y: ty },
          { x: w, y: ty },
          { x: w, y: h - ty },
          { x: w - tx, y: h - ty },
          { x: w - tx, y: h },
          { x: tx, y: h },
          { x: tx, y: h - ty },
          { x: 0, y: h - ty },
          { x: 0, y: ty },
          { x: tx, y: ty },
        ],
        radius,
      );
    }
    case 'heart':
    case 'arch':
    case 'half-circle':
    case 'quarter-circle':
    case 'crescent':
    case 'drop':
    case 'cloud':
    case 'blob':
    case 'shield':
    case 'round-bubble':
      return templatePath(TEMPLATES[kind], w, h);
    case 'ring':
      return ringPath(w, h, params.innerRatio ?? 0.6);
    case 'scallop':
      return scallopPath(params.sides ?? 12, w, h);
    case 'squircle':
      return squirclePath(w, h);
    case 'banner': {
      const d = Math.min(w * 0.15, h * 0.5);
      return polygonPath(
        [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w - d, y: h / 2 },
          { x: w, y: h },
          { x: 0, y: h },
          { x: d, y: h / 2 },
        ],
        radius,
      );
    }
    case 'tag': {
      const d = Math.min(w * 0.3, h * 0.5);
      return polygonPath(
        [
          { x: 0, y: 0 },
          { x: w - d, y: 0 },
          { x: w, y: h / 2 },
          { x: w - d, y: h },
          { x: 0, y: h },
        ],
        radius,
      );
    }
    case 'double-arrow': {
      const head = Math.min(w * 0.3, h * 0.8);
      return polygonPath(
        [
          { x: 0, y: h / 2 },
          { x: head, y: 0 },
          { x: head, y: h * 0.28 },
          { x: w - head, y: h * 0.28 },
          { x: w - head, y: 0 },
          { x: w, y: h / 2 },
          { x: w - head, y: h },
          { x: w - head, y: h * 0.72 },
          { x: head, y: h * 0.72 },
          { x: head, y: h },
        ],
        radius,
      );
    }
    case 'speech-bubble':
      return speechBubblePath(w, h, radius);
    case 'parallelogram': {
      const d = w * 0.25;
      return polygonPath(
        [
          { x: d, y: 0 },
          { x: w, y: 0 },
          { x: w - d, y: h },
          { x: 0, y: h },
        ],
        radius,
      );
    }
    case 'trapezoid': {
      const d = w * 0.2;
      return polygonPath(
        [
          { x: d, y: 0 },
          { x: w - d, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        radius,
      );
    }
  }
}
