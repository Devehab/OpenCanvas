import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  boxUnion,
  compose,
  decompose,
  degToRad,
  getLocalTransform,
  invert,
  matEquals,
  multiply,
  normalizeDegrees,
  rotation,
  scaling,
  translation,
} from '../src';

describe('matrix', () => {
  it('composes and inverts', () => {
    const m = compose(translation(10, 20), rotation(degToRad(30)), scaling(2, 3));
    const inv = invert(m);
    expect(matEquals(multiply(m, inv), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBe(true);
    const p = { x: 3, y: -4 };
    const q = applyToPoint(inv, applyToPoint(m, p));
    expect(q.x).toBeCloseTo(3, 10);
    expect(q.y).toBeCloseTo(-4, 10);
  });

  it('decomposes rotation and scale', () => {
    const d = decompose(compose(translation(5, 6), rotation(degToRad(45)), scaling(2, 2)));
    expect(d.translateX).toBeCloseTo(5);
    expect(d.rotation).toBeCloseTo(degToRad(45));
    expect(d.scaleX).toBeCloseTo(2);
    expect(d.scaleY).toBeCloseTo(2);
    expect(d.skewX).toBeCloseTo(0);
  });

  it('throws on singular matrices', () => {
    expect(() => invert(scaling(0, 1))).toThrow();
  });
});

describe('node transforms', () => {
  it('rotates and flips around the box center', () => {
    const node = { x: 10, y: 10, width: 100, height: 50, rotation: 90, flipX: false, flipY: false };
    const m = getLocalTransform(node);
    const center = applyToPoint(m, { x: 50, y: 25 });
    expect(center.x).toBeCloseTo(60);
    expect(center.y).toBeCloseTo(35);
    const flipped = getLocalTransform({ ...node, rotation: 0, flipX: true });
    expect(applyToPoint(flipped, { x: 0, y: 0 }).x).toBeCloseTo(110);
  });

  it('normalizes angles', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-190)).toBe(170);
    expect(normalizeDegrees(180)).toBe(180);
    expect(Object.is(normalizeDegrees(-360), 0)).toBe(true);
  });

  it('unions boxes', () => {
    expect(boxUnion([])).toBeNull();
    expect(
      boxUnion([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: -5, width: 10, height: 5 },
      ]),
    ).toEqual({
      x: 0,
      y: -5,
      width: 15,
      height: 15,
    });
  });
});
