import { describe, expect, it } from 'vitest';
import { contrastRatio, normalizeColor, parseColor, toCssColor, withAlpha } from '../src';

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
