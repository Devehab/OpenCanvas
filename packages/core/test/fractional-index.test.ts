import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareOrder, generateKeyBetween, generateNKeysBetween, isValidOrderKey } from '../src';

describe('fractional indexing', () => {
  it('generates keys between bounds', () => {
    expect(generateKeyBetween(null, null)).toBe('a0');
    expect(generateKeyBetween('a0', null)).toBe('a1');
    expect(generateKeyBetween(null, 'a0')).toBe('Zz');
    const mid = generateKeyBetween('a0', 'a1');
    expect(mid > 'a0' && mid < 'a1').toBe(true);
  });

  it('rejects invalid ordering', () => {
    expect(() => generateKeyBetween('a1', 'a0')).toThrow();
    expect(() => generateKeyBetween('a0', 'a0')).toThrow();
  });

  it('validates keys', () => {
    expect(isValidOrderKey('a0')).toBe(true);
    expect(isValidOrderKey('a0V')).toBe(true);
    expect(isValidOrderKey('a00')).toBe(false); // trailing zero
    expect(isValidOrderKey('')).toBe(false);
    expect(isValidOrderKey('#')).toBe(false);
    expect(isValidOrderKey(42)).toBe(false);
  });

  it('generates n sorted keys strictly within bounds', () => {
    const keys = generateNKeysBetween('a0', 'a1', 50);
    expect(keys).toHaveLength(50);
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
    expect(keys[0]! > 'a0').toBe(true);
    expect(keys[49]! < 'a1').toBe(true);
  });

  it('keeps total order under arbitrary insertions (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 200 }), (positions) => {
        const keys: string[] = [];
        for (const p of positions) {
          const i = keys.length === 0 ? 0 : p % (keys.length + 1);
          const key = generateKeyBetween(keys[i - 1] ?? null, keys[i] ?? null);
          keys.splice(i, 0, key);
        }
        for (let i = 1; i < keys.length; i++) {
          if (!(keys[i - 1]! < keys[i]!)) return false;
          if (!isValidOrderKey(keys[i]!)) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('breaks ties by id', () => {
    expect(compareOrder({ index: 'a0', id: 'b' }, { index: 'a0', id: 'a' })).toBe(1);
    expect(compareOrder({ index: 'a0', id: 'z' }, { index: 'a1', id: 'a' })).toBe(-1);
  });
});
