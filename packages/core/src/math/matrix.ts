import type { Vec } from './vec';

/**
 * 2D affine matrix in canvas order:
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 *
 * x' = a·x + c·y + e,  y' = b·x + d·y + f
 */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Readonly<Mat> = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export const identity = (): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const translation = (tx: number, ty: number): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
export const scaling = (sx: number, sy: number = sx): Mat => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });

export function rotation(radians: number): Mat {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Returns `m1 · m2` — the transform that applies `m2` first, then `m1`. */
export function multiply(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Composes matrices left to right: `compose(A, B, C) = A · B · C` (C is applied first). */
export function compose(...matrices: Mat[]): Mat {
  let result = identity();
  for (const m of matrices) result = multiply(result, m);
  return result;
}

export const determinant = (m: Mat): number => m.a * m.d - m.b * m.c;

export function invert(m: Mat): Mat {
  const det = determinant(m);
  if (det === 0 || !Number.isFinite(det)) {
    throw new Error('matrix: cannot invert a singular matrix');
  }
  const inv = 1 / det;
  return {
    a: m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d: m.a * inv,
    e: (m.c * m.f - m.d * m.e) * inv,
    f: (m.b * m.e - m.a * m.f) * inv,
  };
}

export function applyToPoint(m: Mat, p: Vec): Vec {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Applies the linear part only (no translation) — for directions and deltas. */
export function applyToVector(m: Mat, v: Vec): Vec {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

export interface Decomposed {
  translateX: number;
  translateY: number;
  /** Radians. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** Shear factor along x (0 for pure rotation/scale transforms). */
  skewX: number;
}

/** QR-like decomposition: M = T · R · Skew · S. */
export function decompose(m: Mat): Decomposed {
  const scaleXAbs = Math.hypot(m.a, m.b);
  const rot = Math.atan2(m.b, m.a);
  const det = determinant(m);
  const scaleY = scaleXAbs === 0 ? 0 : det / scaleXAbs;
  const skewX = scaleXAbs === 0 ? 0 : (m.a * m.c + m.b * m.d) / (scaleXAbs * scaleXAbs);
  return { translateX: m.e, translateY: m.f, rotation: rot, scaleX: scaleXAbs, scaleY, skewX };
}

export function matEquals(a: Mat, b: Mat, epsilon = 1e-9): boolean {
  return (
    Math.abs(a.a - b.a) <= epsilon &&
    Math.abs(a.b - b.b) <= epsilon &&
    Math.abs(a.c - b.c) <= epsilon &&
    Math.abs(a.d - b.d) <= epsilon &&
    Math.abs(a.e - b.e) <= epsilon &&
    Math.abs(a.f - b.f) <= epsilon
  );
}

/** Uniform scale factor of the matrix (geometric mean of the axis scales). */
export function scaleFactor(m: Mat): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

/** CSS `matrix()` string, useful for positioning DOM overlays (e.g. the text editor). */
export function toCssMatrix(m: Mat): string {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;
}
