/// <reference path="./vendor.d.ts" />
/**
 * Line break opportunities per the Unicode Line Breaking Algorithm (UAX #14).
 * Handles spaces, hyphens, CJK, Arabic punctuation, emoji and mandatory
 * breaks (U+2028 LINE SEPARATOR is used for soft line breaks in paragraphs).
 */
import LineBreaker from 'linebreak';

export interface BreakOpportunity {
  /** Break is allowed before this index. */
  position: number;
  /** Mandatory break (e.g. after U+2028). */
  required: boolean;
}

export function getBreakOpportunities(text: string): BreakOpportunity[] {
  const out: BreakOpportunity[] = [];
  if (text.length === 0) return out;
  const breaker = new LineBreaker(text);
  let bk = breaker.nextBreak();
  while (bk) {
    out.push({ position: bk.position, required: bk.required && bk.position < text.length });
    bk = breaker.nextBreak();
  }
  if (out.length === 0 || out[out.length - 1]!.position !== text.length)
    out.push({ position: text.length, required: false });
  return out;
}

const TRAILING_SPACE = /[\s\u2028\u2029]+$/u;

/** Index after the last non-whitespace character within [start, end). */
export function trimEndIndex(text: string, start: number, end: number): number {
  const slice = text.slice(start, end);
  const m = TRAILING_SPACE.exec(slice);
  return m ? start + m.index : end;
}
