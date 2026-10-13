// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { withIntrinsicSize } from '@/lib/upload';

const size = (svg: string) => {
  const root = new DOMParser().parseFromString(withIntrinsicSize(svg), 'image/svg+xml').documentElement;
  return [root.getAttribute('width'), root.getAttribute('height')];
};

describe('withIntrinsicSize', () => {
  it('sizes an SVG with only a view box from it', () => {
    // Without this, the browser's default size (200×150 here) crops the drawing on the canvas.
    expect(
      size('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path d="M0 0h640v480H0z"/></svg>'),
    ).toEqual(['640', '480']);
  });

  it('keeps an absolute size, completes a partial one and replaces a relative one', () => {
    const fixed = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 10 5"/>';
    expect(withIntrinsicSize(fixed)).toBe(fixed);
    expect(size('<svg xmlns="http://www.w3.org/2000/svg" width="800" viewBox="0 0 640 480"/>')).toEqual([
      '800',
      '600',
    ]);
    expect(
      size('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 640 480"/>'),
    ).toEqual(['640', '480']);
  });

  it('gives small drawings a usable size, and leaves SVGs without a view box alone', () => {
    expect(size('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"/>')).toEqual(['512', '256']);
    const bare = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    expect(withIntrinsicSize(bare)).toBe(bare);
  });
});
