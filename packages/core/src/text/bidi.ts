/**
 * Bidirectional text support (Unicode Bidirectional Algorithm, UAX #9) via
 * bidi-js. Needed for Arabic/Hebrew paragraphs and for mixed Arabic + Latin
 * text, numbers and punctuation.
 */
import bidiFactory from 'bidi-js';

let bidiInstance: ReturnType<typeof bidiFactory> | null = null;
function bidi() {
  bidiInstance ??= bidiFactory();
  return bidiInstance;
}

export type Direction = 'ltr' | 'rtl';

/** Direction of the first strong character (UBA rules P2/P3), or null if none. */
export function detectDirection(text: string): Direction | null {
  const b = bidi();
  for (const ch of text) {
    const type = b.getBidiCharTypeName(ch);
    if (type === 'L') return 'ltr';
    if (type === 'R' || type === 'AL') return 'rtl';
  }
  return null;
}

/** True if the text contains any right-to-left characters. */
export function containsRtl(text: string): boolean {
  const b = bidi();
  for (const ch of text) {
    const type = b.getBidiCharTypeName(ch);
    if (type === 'R' || type === 'AL') return true;
  }
  return false;
}

/** Resolved embedding level per UTF-16 code unit (odd = RTL). */
export function embeddingLevels(text: string, base: Direction): Uint8Array {
  return bidi().getEmbeddingLevels(text, base).levels;
}

/**
 * Reorders items with uniform embedding levels into visual (left-to-right)
 * order using rule L2 of the UBA: from the highest level down to the lowest
 * odd level, reverse every maximal run of items at that level or higher.
 */
export function reorderByLevels<T extends { level: number }>(items: readonly T[]): T[] {
  const out = [...items];
  if (out.length < 2) return out;
  let max = 0;
  let minOdd = Number.POSITIVE_INFINITY;
  for (const it of out) {
    max = Math.max(max, it.level);
    if (it.level % 2 === 1) minOdd = Math.min(minOdd, it.level);
  }
  for (let level = max; level >= minOdd && level > 0; level--) {
    let i = 0;
    while (i < out.length) {
      if (out[i]!.level >= level) {
        let j = i;
        while (j + 1 < out.length && out[j + 1]!.level >= level) j++;
        const reversed = out.slice(i, j + 1).reverse();
        out.splice(i, reversed.length, ...reversed);
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  return out;
}

/** Mirrors brackets for RTL runs drawn manually (canvas fillText mirrors on its own). */
export function mirroredCharacter(ch: string): string | null {
  return bidi().getMirroredCharacter(ch);
}
