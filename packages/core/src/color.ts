/**
 * Color parsing and normalization.
 *
 * Colors are stored in documents in one canonical form: lowercase `#rrggbb`, or
 * `#rrggbbaa` when not fully opaque. Canonical colors keep serialization
 * deterministic and make equality checks trivial.
 */

export interface RGBA {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
  a: number; // 0–1
}

export const CANONICAL_COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

const NAMED_COLORS: Record<string, string> = {
  transparent: '#00000000',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  navy: '#000080',
  purple: '#800080',
  teal: '#008080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  gold: '#ffd700',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function parseHex(hex: string): RGBA | null {
  const h = hex.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  if (h.length === 3 || h.length === 4) {
    const [r, g, b, a] = h.split('').map((c) => Number.parseInt(c + c, 16));
    return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
  }
  if (h.length === 6 || h.length === 8) {
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

function parseComponent(token: string, max: number): number | null {
  const t = token.trim();
  if (t.endsWith('%')) {
    const v = Number.parseFloat(t);
    return Number.isFinite(v) ? (v / 100) * max : null;
  }
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toRgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [toRgb(hue + 1 / 3) * 255, toRgb(hue) * 255, toRgb(hue - 1 / 3) * 255];
}

/** Parses hex, rgb(a), hsl(a) and a small set of named colors. Returns null when invalid. */
export function parseColor(input: string): RGBA | null {
  const value = input.trim().toLowerCase();
  if (value.startsWith('#')) return parseHex(value);
  const named = NAMED_COLORS[value];
  if (named) return parseHex(named);
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(value);
  if (!fn) return null;
  const kind = fn[1]!;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const alpha = parts[3] === undefined ? 1 : parseComponent(parts[3], 1);
  if (alpha === null) return null;
  if (kind.startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => parseComponent(p, 255));
    if (r == null || g == null || b == null) return null;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(alpha, 0, 1) };
  }
  const h = Number.parseFloat(parts[0]!);
  const s = parseComponent(parts[1]!, 1);
  const l = parseComponent(parts[2]!, 1);
  if (!Number.isFinite(h) || s == null || l == null) return null;
  const [r, g, b] = hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
  return { r, g, b, a: clamp(alpha, 0, 1) };
}

const hex2 = (n: number) =>
  Math.round(clamp(n, 0, 255))
    .toString(16)
    .padStart(2, '0');

export function rgbaToHex({ r, g, b, a }: RGBA): string {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const alpha = Math.round(clamp(a, 0, 1) * 255);
  return alpha === 255 ? base : base + hex2(alpha);
}

/** Converts any supported color string to canonical form, or returns null. */
export function normalizeColor(input: string): string | null {
  const rgba = parseColor(input);
  return rgba ? rgbaToHex(rgba) : null;
}

export function isCanonicalColor(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_COLOR_PATTERN.test(value);
}

/** CSS color string accepted by canvas, SVG and the DOM. */
export function toCssColor(color: string): string {
  const rgba = parseColor(color);
  if (!rgba) return '#000000';
  if (rgba.a >= 1) return rgbaToHex(rgba);
  return `rgba(${Math.round(rgba.r)}, ${Math.round(rgba.g)}, ${Math.round(rgba.b)}, ${Number(rgba.a.toFixed(4))})`;
}

export function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  return rgbaToHex({ ...rgba, a: clamp(alpha, 0, 1) });
}

export function colorAlpha(color: string): number {
  return parseColor(color)?.a ?? 1;
}

/** Opaque `#rrggbb` part of a color (drops alpha). */
export function opaqueHex(color: string): string {
  const rgba = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  return rgbaToHex({ ...rgba, a: 1 });
}

/** WCAG relative luminance. */
export function relativeLuminance(color: string): number {
  const rgba = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgba.r) + 0.7152 * channel(rgba.g) + 0.0722 * channel(rgba.b);
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
