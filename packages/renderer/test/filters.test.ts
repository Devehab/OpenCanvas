import { DEFAULT_IMAGE_ADJUSTMENTS } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { applyAdjustments, blurRGBA, hasAdjustments, linearGradientLine, radialGradientRadius } from '../src';

const px = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);

describe('filters', () => {
  it('detects no-op adjustments', () => {
    expect(hasAdjustments(DEFAULT_IMAGE_ADJUSTMENTS)).toBe(false);
    expect(hasAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS, sepia: 1 })).toBe(true);
  });

  it('brightness, contrast, grayscale and temperature behave as specified', () => {
    const d = px(100, 50, 25);
    applyAdjustments(d, 1, 1, { ...DEFAULT_IMAGE_ADJUSTMENTS, brightness: 100 });
    expect([...d.slice(0, 3)]).toEqual([200, 100, 50]);
    const g = px(200, 100, 50);
    applyAdjustments(g, 1, 1, { ...DEFAULT_IMAGE_ADJUSTMENTS, grayscale: 100 });
    expect(g[0]).toBe(g[1]);
    expect(g[1]).toBe(g[2]);
    const c = px(128, 128, 128);
    applyAdjustments(c, 1, 1, { ...DEFAULT_IMAGE_ADJUSTMENTS, contrast: 100 });
    expect([...c.slice(0, 3)]).toEqual([128, 128, 128]);
    const w = px(100, 100, 100);
    applyAdjustments(w, 1, 1, { ...DEFAULT_IMAGE_ADJUSTMENTS, temperature: 50 });
    expect(w[0]).toBeGreaterThan(100);
    expect(w[2]).toBeLessThan(100);
    expect(w[3]).toBe(255);
  });

  it('blur keeps uniform images unchanged and spreads a dot', () => {
    const size = 21;
    const uniform = new Uint8ClampedArray(size * size * 4).fill(200);
    blurRGBA(uniform, size, size, 3);
    expect(uniform.every((v) => Math.abs(v - 200) <= 1)).toBe(true);
    const dot = new Uint8ClampedArray(size * size * 4);
    const center = (10 * size + 10) * 4;
    dot.set([255, 0, 0, 255], center);
    blurRGBA(dot, size, size, 2);
    expect(dot[center + 3]!).toBeLessThan(255);
    expect(dot[center - 4 + 3]!).toBeGreaterThan(0);
    // Premultiplied blur keeps the color pure red where alpha > 0.
    expect(dot[center - 4]).toBe(255);
    expect(dot[center - 4 + 1]).toBe(0);
  });

  it('handles tiny images without crashing', () => {
    const one = px(10, 20, 30, 40);
    blurRGBA(one, 1, 1, 10);
    expect(one.length).toBe(4);
  });
});

describe('paint geometry', () => {
  it('follows CSS linear-gradient angles', () => {
    const right = linearGradientLine(90, 100, 50);
    expect(right.x0).toBeCloseTo(0);
    expect(right.y0).toBeCloseTo(25);
    expect(right.x1).toBeCloseTo(100);
    expect(right.y1).toBeCloseTo(25);
    const down = linearGradientLine(180, 100, 50);
    expect(down.x0).toBeCloseTo(50);
    expect(down.y0).toBeCloseTo(0);
    expect(down.y1).toBeCloseTo(50);
  });

  it('uses farthest-corner radius', () => {
    expect(radialGradientRadius(0, 0, 30, 40)).toBe(50);
  });
});
