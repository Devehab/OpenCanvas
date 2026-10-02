/**
 * Vector paths: a minimal absolute command set shared by the renderer, SVG/PDF
 * exporters and hit-testing.
 *
 *   ['M', x, y] | ['L', x, y] | ['C', x1, y1, x2, y2, x, y] | ['Q', x1, y1, x, y] | ['Z']
 */
import type { Box } from '../math/box';
import type { Mat } from '../math/matrix';
import { applyToPoint } from '../math/matrix';
import { distanceToSegment, type Vec } from '../math/vec';

export type PathCommand =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Q', number, number, number, number]
  | ['Z'];

/** Anything with the subset of the CanvasRenderingContext2D / Path2D path API we need. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
}

export function tracePath(sink: PathSink, commands: readonly PathCommand[]): void {
  for (const c of commands) {
    switch (c[0]) {
      case 'M':
        sink.moveTo(c[1], c[2]);
        break;
      case 'L':
        sink.lineTo(c[1], c[2]);
        break;
      case 'C':
        sink.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        break;
      case 'Q':
        sink.quadraticCurveTo(c[1], c[2], c[3], c[4]);
        break;
      case 'Z':
        sink.closePath();
        break;
    }
  }
}

const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Serializes commands to compact SVG path data. */
export function pathToSvg(commands: readonly PathCommand[]): string {
  return commands
    .map((c) => (c[0] === 'Z' ? 'Z' : `${c[0]}${(c.slice(1) as number[]).map(fmt).join(' ')}`))
    .join('');
}

export function transformPath(commands: readonly PathCommand[], m: Mat): PathCommand[] {
  const p = (x: number, y: number) => applyToPoint(m, { x, y });
  return commands.map((c): PathCommand => {
    switch (c[0]) {
      case 'M': {
        const a = p(c[1], c[2]);
        return ['M', a.x, a.y];
      }
      case 'L': {
        const a = p(c[1], c[2]);
        return ['L', a.x, a.y];
      }
      case 'C': {
        const a = p(c[1], c[2]);
        const b = p(c[3], c[4]);
        const d = p(c[5], c[6]);
        return ['C', a.x, a.y, b.x, b.y, d.x, d.y];
      }
      case 'Q': {
        const a = p(c[1], c[2]);
        const d = p(c[3], c[4]);
        return ['Q', a.x, a.y, d.x, d.y];
      }
      default:
        return ['Z'];
    }
  });
}

// ---------------------------------------------------------------------------
// SVG path parsing
// ---------------------------------------------------------------------------

const PARAM_COUNTS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const NUMBER_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  let i = 0;
  let arcFlagIndex = -1; // position within an arc's parameter list, to read compact flags like "a1 1 0 011 1"
  let lastCommand = '';
  let paramIndex = 0;
  while (i < d.length) {
    const ch = d[i]!;
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      tokens.push(ch);
      lastCommand = ch.toLowerCase();
      paramIndex = 0;
      i++;
      continue;
    }
    arcFlagIndex = lastCommand === 'a' ? paramIndex % 7 : -1;
    if ((arcFlagIndex === 3 || arcFlagIndex === 4) && (ch === '0' || ch === '1')) {
      tokens.push(ch === '1' ? 1 : 0);
      paramIndex++;
      i++;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(d);
    if (!m) throw new Error(`Invalid path data near "${d.slice(i, i + 12)}"`);
    tokens.push(Number.parseFloat(m[0]));
    paramIndex++;
    i = NUMBER_RE.lastIndex;
  }
  return tokens;
}

/** Converts an SVG elliptical arc to cubic Béziers (SVG spec, appendix F.6). */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  angleDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): PathCommand[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2) - 1e-9));
  const delta = dTheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: PathCommand[] = [];
  let theta = theta1;
  for (let i = 0; i < segments; i++) {
    const cos1 = Math.cos(theta);
    const sin1 = Math.sin(theta);
    const theta2 = theta + delta;
    const cos2 = Math.cos(theta2);
    const sin2 = Math.sin(theta2);
    const p = (ex: number, ey: number) => ({
      x: cx + rx * ex * cosPhi - ry * ey * sinPhi,
      y: cy + rx * ex * sinPhi + ry * ey * cosPhi,
    });
    const c1 = p(cos1 - t * sin1, sin1 + t * cos1);
    const c2 = p(cos2 + t * sin2, sin2 - t * cos2);
    const end = i === segments - 1 ? { x: x2, y: y2 } : p(cos2, sin2);
    out.push(['C', c1.x, c1.y, c2.x, c2.y, end.x, end.y]);
    theta = theta2;
  }
  return out;
}

/** Parses SVG path data into absolute M/L/C/Q/Z commands. Throws on malformed data. */
export function parseSvgPath(d: string): PathCommand[] {
  const tokens = tokenize(d);
  const out: PathCommand[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCmd = '';
  let lastCtrlX = 0;
  let lastCtrlY = 0;
  let command = '';
  const num = (): number => {
    const t = tokens[i++];
    if (typeof t !== 'number') throw new Error('Invalid path data: expected number');
    return t;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      command = t;
      i++;
    } else if (!command) {
      throw new Error('Invalid path data: must start with a command');
    } else if (command === 'M') {
      command = 'L';
    } else if (command === 'm') {
      command = 'l';
    }
    const lower = command.toLowerCase();
    const rel = command !== command.toUpperCase();
    if (lower === 'z') {
      out.push(['Z']);
      cx = startX;
      cy = startY;
      prevCmd = 'z';
      continue;
    }
    const count = PARAM_COUNTS[lower];
    if (count === undefined) throw new Error(`Invalid path command ${command}`);
    if (i + count > tokens.length) throw new Error('Invalid path data: missing parameters');
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (lower) {
      case 'm': {
        cx = ox + num();
        cy = oy + num();
        startX = cx;
        startY = cy;
        out.push(['M', cx, cy]);
        break;
      }
      case 'l': {
        cx = ox + num();
        cy = oy + num();
        out.push(['L', cx, cy]);
        break;
      }
      case 'h': {
        cx = ox + num();
        out.push(['L', cx, cy]);
        break;
      }
      case 'v': {
        cy = (rel ? cy : 0) + num();
        out.push(['L', cx, cy]);
        break;
      }
      case 'c': {
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        const y2 = oy + num();
        cx = ox + num();
        cy = oy + num();
        out.push(['C', x1, y1, x2, y2, cx, cy]);
        lastCtrlX = x2;
        lastCtrlY = y2;
        break;
      }
      case 's': {
        const reflect = prevCmd === 'c' || prevCmd === 's';
        const x1 = reflect ? 2 * cx - lastCtrlX : cx;
        const y1 = reflect ? 2 * cy - lastCtrlY : cy;
        const x2 = ox + num();
        const y2 = oy + num();
        cx = ox + num();
        cy = oy + num();
        out.push(['C', x1, y1, x2, y2, cx, cy]);
        lastCtrlX = x2;
        lastCtrlY = y2;
        break;
      }
      case 'q': {
        const x1 = ox + num();
        const y1 = oy + num();
        cx = ox + num();
        cy = oy + num();
        out.push(['Q', x1, y1, cx, cy]);
        lastCtrlX = x1;
        lastCtrlY = y1;
        break;
      }
      case 't': {
        const reflect = prevCmd === 'q' || prevCmd === 't';
        const x1 = reflect ? 2 * cx - lastCtrlX : cx;
        const y1 = reflect ? 2 * cy - lastCtrlY : cy;
        cx = ox + num();
        cy = oy + num();
        out.push(['Q', x1, y1, cx, cy]);
        lastCtrlX = x1;
        lastCtrlY = y1;
        break;
      }
      case 'a': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const x = ox + num();
        const y = oy + num();
        out.push(...arcToCubics(cx, cy, rx, ry, rot, large ? 1 : 0, sweep ? 1 : 0, x, y));
        cx = x;
        cy = y;
        break;
      }
    }
    prevCmd = lower;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flattening, bounds, hit testing
// ---------------------------------------------------------------------------

/** Flattens a path into polylines (one per subpath). */
export function flattenPath(
  commands: readonly PathCommand[],
  tolerance = 0.5,
): { points: Vec[]; closed: boolean }[] {
  const polylines: { points: Vec[]; closed: boolean }[] = [];
  let current: Vec[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const flush = (closed: boolean) => {
    if (current.length > 0) polylines.push({ points: current, closed });
    current = [];
  };
  for (const c of commands) {
    switch (c[0]) {
      case 'M':
        flush(false);
        x = sx = c[1];
        y = sy = c[2];
        current.push({ x, y });
        break;
      case 'L':
        if (current.length === 0) current.push({ x, y });
        x = c[1];
        y = c[2];
        current.push({ x, y });
        break;
      case 'C': {
        if (current.length === 0) current.push({ x, y });
        const [, x1, y1, x2, y2, x3, y3] = c;
        const length =
          Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
        const steps = Math.min(64, Math.max(2, Math.ceil(Math.sqrt(length / tolerance))));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          current.push({
            x: mt * mt * mt * x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
            y: mt * mt * mt * y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
          });
        }
        x = x3;
        y = y3;
        break;
      }
      case 'Q': {
        if (current.length === 0) current.push({ x, y });
        const [, x1, y1, x2, y2] = c;
        const length = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.min(64, Math.max(2, Math.ceil(Math.sqrt(length / tolerance))));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          current.push({
            x: mt * mt * x + 2 * mt * t * x1 + t * t * x2,
            y: mt * mt * y + 2 * mt * t * y1 + t * t * y2,
          });
        }
        x = x2;
        y = y2;
        break;
      }
      case 'Z':
        if (current.length > 0) current.push({ x: sx, y: sy });
        flush(true);
        x = sx;
        y = sy;
        break;
    }
  }
  flush(false);
  return polylines;
}

/** Tight-ish bounds of a path (curves are flattened). */
export function pathBounds(commands: readonly PathCommand[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const poly of flattenPath(commands, 0.25)) {
    for (const p of poly.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Point-in-path test for the filled area (all subpaths treated as closed). */
export function pointInPath(
  commands: readonly PathCommand[],
  p: Vec,
  fillRule: 'nonzero' | 'evenodd' = 'nonzero',
): boolean {
  let winding = 0;
  let crossings = 0;
  for (const { points } of flattenPath(commands)) {
    const n = points.length;
    if (n < 3) continue;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = points[j]!;
      const b = points[i]!;
      if (a.y <= p.y) {
        if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) {
          winding++;
          crossings++;
        }
      } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) {
        winding--;
        crossings++;
      }
    }
  }
  return fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
}

/** Minimum distance from `p` to the path outline. */
export function distanceToPath(commands: readonly PathCommand[], p: Vec): number {
  let best = Number.POSITIVE_INFINITY;
  for (const { points } of flattenPath(commands)) {
    if (points.length === 1) best = Math.min(best, Math.hypot(points[0]!.x - p.x, points[0]!.y - p.y));
    for (let i = 1; i < points.length; i++)
      best = Math.min(best, distanceToSegment(p, points[i - 1]!, points[i]!));
  }
  return best;
}
