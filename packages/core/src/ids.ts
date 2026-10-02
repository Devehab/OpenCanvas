/**
 * Identifier generation.
 *
 * Every record in an OpenCanvas document has a stable, globally unique id. Ids are
 * prefixed with the record kind (`page_`, `node_`, `asset_`) so that serialized
 * documents stay readable and debuggable.
 *
 * Production code uses a cryptographically random generator. Tests use a seeded,
 * deterministic generator so that snapshots and golden files are reproducible.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RANDOM_LENGTH = 14;

export type IdPrefix = 'page' | 'node' | 'asset' | (string & {});

export type IdGenerator = (prefix: IdPrefix) => string;

/** Valid id: 1–64 chars of `[A-Za-z0-9_-]`. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Ids that would collide with Object.prototype members are never valid (prototype-pollution safety). */
const RESERVED_IDS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
]);

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !RESERVED_IDS.has(value);
}

function randomString(length: number, nextByte: () => number): string {
  let out = '';
  while (out.length < length) {
    // Rejection sampling keeps the distribution uniform over the 62-char alphabet.
    const byte = nextByte();
    if (byte < 248) out += ALPHABET[byte % 62];
  }
  return out;
}

/** Cryptographically random ids (Web Crypto, available in browsers and Node ≥ 19). */
export function createRandomIdGenerator(): IdGenerator {
  const buffer = new Uint8Array(64);
  let offset = buffer.length;
  const nextByte = () => {
    if (offset >= buffer.length) {
      globalThis.crypto.getRandomValues(buffer);
      offset = 0;
    }
    return buffer[offset++]!;
  };
  return (prefix) => `${prefix}_${randomString(RANDOM_LENGTH, nextByte)}`;
}

/** Deterministic ids for tests and reproducible fixtures (mulberry32 PRNG). */
export function createSeededIdGenerator(seed = 1): IdGenerator {
  let state = seed >>> 0;
  const nextByte = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 0xff;
  };
  return (prefix) => `${prefix}_${randomString(RANDOM_LENGTH, nextByte)}`;
}

/** Sequential ids (`node_1`, `node_2`, …) — the most readable option for unit tests. */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}
