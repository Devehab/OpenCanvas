/**
 * Small geometry kit for the element catalog's outlines. Outlines are built as
 * path commands and written as compact SVG path data, which `custom` shapes
 * and frames stretch to fill their box.
 *
 * Shapes are filled with the non-zero rule, so the parts of an outline that
 * should be solid all turn one way (`solid`) and its holes the other way
 * (`hole`): overlapping solid parts then simply merge.
 */
import { type PathCommand, polygonPath, type Vec } from '@opencanvas/core';

export type Path = PathCommand[];

const KAPPA = 0.5522847498307936;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const pt = (x: number, y: number): Vec => ({ x, y });

/** A closed polygon through `points`, optionally with rounded corners. */
export function polygon(points: readonly Vec[], radius = 0): Path {
  return polygonPath(points, radius);
}

/** A polygon from a flat list of coordinates: `poly(0,0, 10,0, 10,10)`. */
export function poly(...coords: number[]): Path {
  const points: Vec[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) points.push(pt(coords[i]!, coords[i + 1]!));
  return polygon(points);
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx): Path {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['Z'],
  ];
}

export const circle = (cx: number, cy: number, r: number): Path => ellipse(cx, cy, r, r);

export function rect(x: number, y: number, w: number, h: number, radius = 0): Path {
  return polygon([pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)], radius);
}

/** Points on a circle (angles in degrees, 0 = up, clockwise). */
export function onCircle(cx: number, cy: number, r: number, degrees: number): Vec {
  const a = ((degrees - 90) * Math.PI) / 180;
  return pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
}

/** A regular polygon or star's corners around (cx, cy). */
export function starPoints(
  count: number,
  outer: number,
  inner: number,
  { cx = 50, cy = 50, rotate = 0 }: { cx?: number; cy?: number; rotate?: number } = {},
): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i < count * 2; i++)
    points.push(onCircle(cx, cy, i % 2 === 0 ? outer : inner, rotate + (i * 180) / count));
  return points;
}

export function regularPoints(count: number, r: number, cx = 50, cy = 50, rotate = 0): Vec[] {
  return Array.from({ length: count }, (_, i) => onCircle(cx, cy, r, rotate + (i * 360) / count));
}

/**
 * A smooth closed curve through `points` (Catmull-Rom splines as cubic
 * Béziers). `tension` 1 is the classic curve; lower is tighter.
 */
export function smooth(points: readonly Vec[], tension = 1): Path {
  const n = points.length;
  const out: Path = [['M', points[0]!.x, points[0]!.y]];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    const t = tension / 6;
    out.push([
      'C',
      p1.x + (p2.x - p0.x) * t,
      p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t,
      p2.y - (p3.y - p1.y) * t,
      p2.x,
      p2.y,
    ]);
  }
  out.push(['Z']);
  return out;
}

/** A smooth open curve through `points` (for stroked lines). */
export function smoothOpen(points: readonly Vec[], tension = 1): Path {
  const n = points.length;
  const out: Path = [['M', points[0]!.x, points[0]!.y]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(n - 1, i + 2)]!;
    const t = tension / 6;
    out.push([
      'C',
      p1.x + (p2.x - p0.x) * t,
      p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t,
      p2.y - (p3.y - p1.y) * t,
      p2.x,
      p2.y,
    ]);
  }
  return out;
}

/**
 * A closed curve in polar form, r(θ) for θ in [0, 2π) (0 = up, clockwise),
 * drawn as cubic Béziers from its points and tangents: smooth with few points.
 */
export function polar(r: (theta: number) => number, samples: number, cx = 50, cy = 50, scale = 50): Path {
  const at = (theta: number) => {
    const radius = r(theta) * scale;
    return pt(cx + Math.sin(theta) * radius, cy - Math.cos(theta) * radius);
  };
  const step = (2 * Math.PI) / samples;
  const h = step / 1000;
  const tangent = (theta: number) => {
    const a = at(theta - h);
    const b = at(theta + h);
    return pt((b.x - a.x) / (2 * h), (b.y - a.y) / (2 * h));
  };
  const start = at(0);
  const out: Path = [['M', start.x, start.y]];
  for (let i = 0; i < samples; i++) {
    const t0 = i * step;
    const t1 = (i + 1) * step;
    const p0 = at(t0);
    const p1 = i === samples - 1 ? start : at(t1);
    const d0 = tangent(t0);
    const d1 = tangent(t1);
    out.push([
      'C',
      p0.x + (d0.x * step) / 3,
      p0.y + (d0.y * step) / 3,
      p1.x - (d1.x * step) / 3,
      p1.y - (d1.y * step) / 3,
      p1.x,
      p1.y,
    ]);
  }
  out.push(['Z']);
  return out;
}

/** A band along an arc (annulus sector), from `from` to `to` degrees (0 = up, clockwise). */
export function arcBand(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
): Path {
  const outerArc = arc(cx, cy, outer, from, to);
  const innerArc = arc(cx, cy, inner, to, from);
  const a = onCircle(cx, cy, outer, from);
  const b = onCircle(cx, cy, inner, to);
  return [['M', a.x, a.y], ...outerArc, ['L', b.x, b.y], ...innerArc, ['Z']];
}

/** Cubic segments of a circular arc (no initial move), `from` → `to` in degrees. */
export function arc(cx: number, cy: number, r: number, from: number, to: number): Path {
  const segments = Math.max(1, Math.ceil(Math.abs(to - from) / 90));
  const delta = (to - from) / segments;
  const k = (4 / 3) * Math.tan((delta * Math.PI) / 720);
  const out: Path = [];
  for (let i = 0; i < segments; i++) {
    const a0 = from + i * delta;
    const a1 = a0 + delta;
    const p0 = onCircle(cx, cy, r, a0);
    const p1 = onCircle(cx, cy, r, a1);
    // Tangent of a point at angle a (0 = up, clockwise): (cos, sin) rotated.
    const t0 = tangentAt(a0);
    const t1 = tangentAt(a1);
    out.push([
      'C',
      p0.x + t0.x * k * r,
      p0.y + t0.y * k * r,
      p1.x - t1.x * k * r,
      p1.y - t1.y * k * r,
      p1.x,
      p1.y,
    ]);
  }
  return out;
}

function tangentAt(degrees: number): Vec {
  const a = (degrees * Math.PI) / 180;
  return pt(Math.cos(a), Math.sin(a));
}

// ---------------------------------------------------------------------------
// Direction, transforms, output
// ---------------------------------------------------------------------------

/** Splits path commands into subpaths. */
export function subpaths(path: Path): Path[] {
  const out: Path[] = [];
  for (const c of path) {
    if (c[0] === 'M' || out.length === 0) out.push([]);
    out[out.length - 1]!.push(c);
  }
  return out.filter((s) => s.length > 1);
}

/**
 * Signed area of a subpath, positive when it turns clockwise on screen. Taken
 * over its end and control points: close enough to tell the direction, and
 * cheap (no flattening).
 */
function signedArea(path: Path): number {
  const points: Vec[] = [];
  for (const c of path) {
    if (c[0] === 'M' || c[0] === 'L') points.push(pt(c[1], c[2]));
    else if (c[0] === 'Q') points.push(pt(c[1], c[2]), pt(c[3], c[4]));
    else if (c[0] === 'C') points.push(pt(c[1], c[2]), pt(c[3], c[4]), pt(c[5], c[6]));
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** The same subpath drawn the other way round. */
export function reverse(path: Path): Path {
  const start = path[0];
  if (!start || start[0] !== 'M') return path;
  const segments: { from: Vec; command: PathCommand }[] = [];
  let at = pt(start[1], start[2]);
  for (const c of path.slice(1)) {
    if (c[0] === 'Z') continue;
    segments.push({ from: at, command: c });
    if (c[0] === 'L') at = pt(c[1], c[2]);
    else if (c[0] === 'Q') at = pt(c[3], c[4]);
    else if (c[0] === 'C') at = pt(c[5], c[6]);
  }
  const out: Path = [['M', at.x, at.y]];
  for (let i = segments.length - 1; i >= 0; i--) {
    const { from, command: c } = segments[i]!;
    if (c[0] === 'L') out.push(['L', from.x, from.y]);
    else if (c[0] === 'Q') out.push(['Q', c[1], c[2], from.x, from.y]);
    else if (c[0] === 'C') out.push(['C', c[3], c[4], c[1], c[2], from.x, from.y]);
  }
  out.push(['Z']);
  return out;
}

function orient(path: Path, clockwise: boolean): Path {
  return subpaths(path).flatMap((s) => (signedArea(s) > 0 === clockwise ? s : reverse(s)));
}

/** Parts that are filled (all turned clockwise, so overlaps merge). */
export const solid = (...parts: Path[]): Path => parts.flatMap((p) => orient(p, true));

/** Parts cut out of the solid ones (turned the other way). */
export const hole = (...parts: Path[]): Path => parts.flatMap((p) => orient(p, false));

/** Solid `outer` with `holes` cut out. */
export const cut = (outer: Path, ...holes: Path[]): Path => [...solid(outer), ...hole(...holes)];

export function mapPoints(path: Path, f: (p: Vec) => Vec): Path {
  return path.map((c): PathCommand => {
    switch (c[0]) {
      case 'M':
      case 'L': {
        const p = f(pt(c[1], c[2]));
        return [c[0], p.x, p.y];
      }
      case 'Q': {
        const a = f(pt(c[1], c[2]));
        const b = f(pt(c[3], c[4]));
        return ['Q', a.x, a.y, b.x, b.y];
      }
      case 'C': {
        const a = f(pt(c[1], c[2]));
        const b = f(pt(c[3], c[4]));
        const e = f(pt(c[5], c[6]));
        return ['C', a.x, a.y, b.x, b.y, e.x, e.y];
      }
      default:
        return c;
    }
  });
}

export const translate = (path: Path, dx: number, dy: number) =>
  mapPoints(path, (p) => pt(p.x + dx, p.y + dy));

export const scale = (path: Path, sx: number, sy = sx, cx = 0, cy = 0) =>
  mapPoints(path, (p) => pt(cx + (p.x - cx) * sx, cy + (p.y - cy) * sy));

export function rotate(path: Path, degrees: number, cx = 50, cy = 50): Path {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return mapPoints(path, (p) =>
    pt(cx + (p.x - cx) * cos - (p.y - cy) * sin, cy + (p.x - cx) * sin + (p.y - cy) * cos),
  );
}

/** Mirror left ↔ right around x = `cx` (turns the outline the other way: re-orient after). */
export const mirrorX = (path: Path, cx = 50) => mapPoints(path, (p) => pt(2 * cx - p.x, p.y));
export const mirrorY = (path: Path, cy = 50) => mapPoints(path, (p) => pt(p.x, 2 * cy - p.y));

const num = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString().replace(/^(-?)0\./, '$1.');
};

/** Compact SVG path data (two decimals). */
export function svg(path: Path): string {
  let d = '';
  for (const c of path) {
    const [command, ...values] = c;
    d += command;
    let first = true;
    for (const v of values as number[]) {
      const s = num(v);
      d += first || s.startsWith('-') ? s : ` ${s}`;
      first = false;
    }
  }
  return d;
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32): the same outline on every load. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
