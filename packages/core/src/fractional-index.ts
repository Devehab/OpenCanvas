/**
 * Fractional indexing — order keys that allow inserting between any two siblings
 * without renumbering the others.
 *
 * Sibling order (z-order of layers, order of pages) is stored as a string key per
 * record instead of an array position. This keeps every reorder a single-record
 * change, which is what makes undo/redo diffs small and what will let concurrent
 * edits merge cleanly once real-time collaboration (CRDT) is added.
 *
 * Algorithm adapted from "Implementing Fractional Indexing" by David Greenspan
 * (https://observablehq.com/@dgreensp/implementing-fractional-indexing), released
 * to the public domain (CC0).
 *
 * Keys compare with plain `<` / `>` (UTF-16 code unit order), never `localeCompare`.
 */

export const BASE_62_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const SMALLEST_INTEGER = `A${'0'.repeat(26)}`;

function midpoint(a: string, b: string | null, digits: string): string {
  const zero = digits[0]!;
  if (b !== null && a >= b) throw new Error(`fractional-index: ${a} >= ${b}`);
  if (a.slice(-1) === zero || (b !== null && b.slice(-1) === zero)) {
    throw new Error('fractional-index: trailing zero');
  }
  if (b !== null) {
    // Remove the longest common prefix, padding `a` with zeros as we go.
    let n = 0;
    while ((a[n] ?? zero) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), digits);
  }
  // First digits (or lack of digit) are different.
  const digitA = a ? digits.indexOf(a[0]!) : 0;
  const digitB = b !== null ? digits.indexOf(b[0]!) : digits.length;
  if (digitB - digitA > 1) {
    return digits[Math.round(0.5 * (digitA + digitB))]!;
  }
  // First digits are consecutive.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  // `b` is null or a single digit: keep `a`'s first digit and recurse on the rest.
  return digits[digitA]! + midpoint(a.slice(1), null, digits);
}

function getIntegerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 97 + 2;
  if (head >= 'A' && head <= 'Z') return 90 - head.charCodeAt(0) + 2;
  throw new Error(`fractional-index: invalid order key head: ${head}`);
}

function validateInteger(int: string): void {
  if (int.length !== getIntegerLength(int[0]!)) {
    throw new Error(`fractional-index: invalid integer part of order key: ${int}`);
  }
}

function getIntegerPart(key: string): string {
  const length = getIntegerLength(key[0]!);
  if (length > key.length) throw new Error(`fractional-index: invalid order key: ${key}`);
  return key.slice(0, length);
}

function validateOrderKey(key: string, digits: string): void {
  if (key === SMALLEST_INTEGER) throw new Error(`fractional-index: invalid order key: ${key}`);
  const integer = getIntegerPart(key);
  const fraction = key.slice(integer.length);
  if (fraction.slice(-1) === digits[0]) throw new Error(`fractional-index: invalid order key: ${key}`);
}

/** Returns true if `key` is a structurally valid order key. */
export function isValidOrderKey(key: unknown, digits = BASE_62_DIGITS): key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) return false;
  for (const ch of key) if (!digits.includes(ch)) return false;
  try {
    validateOrderKey(key, digits);
    return true;
  } catch {
    return false;
  }
}

function incrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split('') as [string, ...string[]];
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = digits.indexOf(digs[i]!) + 1;
    if (d === digits.length) {
      digs[i] = digits[0]!;
    } else {
      digs[i] = digits[d]!;
      carry = false;
    }
  }
  if (carry) {
    if (head === 'Z') return `a${digits[0]}`;
    if (head === 'z') return null;
    const h = String.fromCharCode(head.charCodeAt(0) + 1);
    if (h > 'a') digs.push(digits[0]!);
    else digs.pop();
    return h + digs.join('');
  }
  return head + digs.join('');
}

function decrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split('') as [string, ...string[]];
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = digits.indexOf(digs[i]!) - 1;
    if (d === -1) {
      digs[i] = digits.slice(-1);
    } else {
      digs[i] = digits[d]!;
      borrow = false;
    }
  }
  if (borrow) {
    if (head === 'a') return `Z${digits.slice(-1)}`;
    if (head === 'A') return null;
    const h = String.fromCharCode(head.charCodeAt(0) - 1);
    if (h < 'Z') digs.push(digits.slice(-1));
    else digs.pop();
    return h + digs.join('');
  }
  return head + digs.join('');
}

/**
 * Generates a key that sorts strictly between `a` and `b`.
 * `null` means "unbounded" (before the first / after the last).
 */
export function generateKeyBetween(a: string | null, b: string | null, digits = BASE_62_DIGITS): string {
  if (a !== null) validateOrderKey(a, digits);
  if (b !== null) validateOrderKey(b, digits);
  if (a !== null && b !== null && a >= b) throw new Error(`fractional-index: ${a} >= ${b}`);
  if (a === null) {
    if (b === null) return `a${digits[0]}`;
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb, digits);
    if (ib < b) return ib;
    const res = decrementInteger(ib, digits);
    if (res === null) throw new Error('fractional-index: cannot decrement any more');
    return res;
  }
  if (b === null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia, digits);
    return i === null ? ia + midpoint(fa, null, digits) : i;
  }
  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb, digits);
  const i = incrementInteger(ia, digits);
  if (i === null) throw new Error('fractional-index: cannot increment any more');
  if (i < b) return i;
  return ia + midpoint(fa, null, digits);
}

/** Generates `n` ascending keys strictly between `a` and `b`, spread evenly. */
export function generateNKeysBetween(
  a: string | null,
  b: string | null,
  n: number,
  digits = BASE_62_DIGITS,
): string[] {
  if (n === 0) return [];
  if (n === 1) return [generateKeyBetween(a, b, digits)];
  if (b === null) {
    let c = generateKeyBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b, digits);
      result.push(c);
    }
    return result;
  }
  if (a === null) {
    let c = generateKeyBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c, digits);
      result.push(c);
    }
    result.reverse();
    return result;
  }
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b, digits);
  return [...generateNKeysBetween(a, c, mid, digits), c, ...generateNKeysBetween(c, b, n - mid - 1, digits)];
}

/** Comparator for order keys; ties are broken by id for deterministic ordering. */
export function compareOrder(a: { index: string; id: string }, b: { index: string; id: string }): number {
  if (a.index < b.index) return -1;
  if (a.index > b.index) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
