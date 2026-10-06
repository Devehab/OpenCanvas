import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  extractPalette,
  normalizeColor,
  parseColor,
  parseUserColor,
  toCssColor,
  withAlpha,
} from '../src';

describe('color', () => {
  it('normalizes many syntaxes to canonical hex', () => {
    expect(normalizeColor('#FFF')).toBe('#ffffff');
    expect(normalizeColor('#ff000080')).toBe('#ff000080');
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColor('rgba(0,0,0,0.5)')).toBe('#00000080');
    expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
    expect(normalizeColor('white')).toBe('#ffffff');
    expect(normalizeColor('transparent')).toBe('#00000000');
    expect(normalizeColor('#ff0000ff')).toBe('#ff0000');
  });

  it('rejects garbage', () => {
    expect(parseColor('nope')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('rgb(1,2)')).toBeNull();
    expect(normalizeColor('javascript:alert(1)')).toBeNull();
  });

  it('formats css colors', () => {
    expect(toCssColor('#ff000080')).toBe('rgba(255, 0, 0, 0.502)');
    expect(toCssColor('#123456')).toBe('#123456');
    expect(withAlpha('#123456', 0)).toBe('#12345600');
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('parseUserColor', () => {
  it('accepts hex with or without #, and pasted CSS', () => {
    expect(parseUserColor('285CFF')).toBe('#285cff');
    expect(parseUserColor('#285CFF')).toBe('#285cff');
    expect(parseUserColor('  fff ')).toBe('#ffffff');
    expect(parseUserColor('"#285CFF";')).toBe('#285cff');
    expect(parseUserColor('color: rgb(40, 92, 255);')).toBe('#285cff');
    expect(parseUserColor('285cff80')).toBe('#285cff80'); // with alpha
    expect(parseUserColor('teal')).toBe('#008080');
  });

  it('rejects things that are not colors', () => {
    expect(parseUserColor('')).toBeNull();
    expect(parseUserColor('12345')).toBeNull();
    expect(parseUserColor('#zzzzzz')).toBeNull();
    expect(parseUserColor('hello')).toBeNull();
  });
});

describe('extractPalette', () => {
  const pixels = (...runs: [number, number, number, number, number][]) => {
    const out: number[] = [];
    for (const [r, g, b, a, n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, a);
    return new Uint8ClampedArray(out);
  };

  it('returns the main colors, most used first, ignoring transparent pixels', () => {
    const data = pixels(
      [0, 0, 0, 0, 5000],
      [40, 92, 255, 255, 300],
      [255, 200, 0, 255, 100],
      [20, 20, 30, 255, 50],
    );
    expect(extractPalette(data)).toEqual(['#285cff', '#ffc800', '#14141e']);
  });

  it('merges near-identical shades (antialiasing) into one color', () => {
    const data = pixels([40, 92, 255, 255, 300], [44, 96, 250, 255, 40], [255, 255, 255, 255, 10]);
    expect(extractPalette(data)).toHaveLength(2);
  });

  it('limits the number of colors', () => {
    const data = pixels([255, 0, 0, 255, 10], [0, 255, 0, 255, 9], [0, 0, 255, 255, 8], [0, 0, 0, 255, 7]);
    expect(extractPalette(data, { count: 2 })).toEqual(['#ff0000', '#00ff00']);
  });
});
