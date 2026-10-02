/**
 * Inlines the web fonts a page uses into SVG exports. Viewers rarely have
 * the design's fonts installed, and an SVG opened as an image cannot fetch
 * external files, so each used face (and only the unicode-range subsets the
 * text needs) is embedded as a data: URL.
 */
import type { DocumentStore, Id, TextNode } from '@opencanvas/core';

export interface FaceUsage {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  codePoints: Set<number>;
}

interface FontFaceSource {
  /** Family name as declared. */
  name: string;
  /** Lower-cased family for matching (CSS family names are case-insensitive). */
  family: string;
  style: string;
  weight: [number, number];
  weightText: string;
  ranges: [number, number][] | null;
  rangeText: string;
  url: string;
  format: string;
}

/** Faces (family/weight/style) used by text on a page, with the characters drawn in each. */
export function collectFaceUsage(store: DocumentStore, pageId: Id): FaceUsage[] {
  const faces = new Map<string, FaceUsage>();
  for (const id of store.getDescendantIds(pageId)) {
    const node = store.getNode(id);
    if (node?.type !== 'text') continue;
    const text = node as TextNode;
    for (const paragraph of text.content.paragraphs) {
      const marker = paragraph.list === 'bullet' ? '•' : paragraph.list === 'number' ? '0123456789.' : '';
      paragraph.runs.forEach((run, i) => {
        const style = { ...text.style, ...run.style };
        const key = `${style.fontFamily}|${style.fontWeight}|${style.fontStyle}`;
        let face = faces.get(key);
        if (!face) {
          face = {
            family: style.fontFamily,
            weight: style.fontWeight,
            style: style.fontStyle,
            codePoints: new Set(),
          };
          faces.set(key, face);
        }
        const chars = (i === 0 ? marker : '') + run.text;
        // Case transforms are applied at render time.
        for (const ch of chars + chars.toUpperCase() + chars.toLowerCase())
          face.codePoints.add(ch.codePointAt(0)!);
      });
    }
  }
  return [...faces.values()].filter((f) => f.codePoints.size > 0);
}

const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2');

function parseWeight(value: string): [number, number] {
  const parts = value
    .trim()
    .split(/\s+/)
    .map((p) => (p === 'normal' ? 400 : p === 'bold' ? 700 : Number(p)))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) return [400, 400];
  return [parts[0]!, parts[1] ?? parts[0]!];
}

/** Parses a CSS unicode-range ("U+0-FF, U+131, U+4??") into inclusive ranges. */
export function parseUnicodeRange(value: string): [number, number][] | null {
  if (!value.trim()) return null;
  const ranges: [number, number][] = [];
  for (const raw of value.split(',')) {
    const part = raw.trim().replace(/^u\+/i, '');
    if (!part) continue;
    if (part.includes('?')) {
      ranges.push([
        Number.parseInt(part.replace(/\?/g, '0'), 16),
        Number.parseInt(part.replace(/\?/g, 'F'), 16),
      ]);
    } else {
      const [a, b] = part.split('-');
      const start = Number.parseInt(a!, 16);
      ranges.push([start, b ? Number.parseInt(b, 16) : start]);
    }
  }
  return ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

function collectRules(rules: CSSRuleList, base: string, out: FontFaceSource[]): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSFontFaceRule) {
      const src = rule.style.getPropertyValue('src');
      const sources = [
        ...src.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/g),
      ];
      const best = sources.find((m) => m[3] === 'woff2') ?? sources[0];
      if (!best) continue;
      const rangeText = rule.style.getPropertyValue('unicode-range');
      const weightText = rule.style.getPropertyValue('font-weight') || '400';
      const name = unquote(rule.style.getPropertyValue('font-family'));
      out.push({
        name,
        family: name.toLowerCase(),
        style: rule.style.getPropertyValue('font-style') || 'normal',
        weight: parseWeight(weightText),
        weightText,
        ranges: parseUnicodeRange(rangeText),
        rangeText,
        url: new URL(best[2]!, base).href,
        format: best[3] ?? 'woff2',
      });
    } else if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) collectRules(rule.styleSheet.cssRules, rule.styleSheet.href ?? base, out);
    } else if ('cssRules' in rule) {
      collectRules((rule as CSSGroupingRule).cssRules, base, out);
    }
  }
}

function readFontFaces(): FontFaceSource[] {
  const out: FontFaceSource[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    collectRules(rules, sheet.href ?? location.href, out);
  }
  return out;
}

const weightDistance = (source: FontFaceSource, weight: number) =>
  weight < source.weight[0]
    ? source.weight[0] - weight
    : weight > source.weight[1]
      ? weight - source.weight[1]
      : 0;

/** The @font-face sources a face needs: closest style/weight, subsets covering the text. */
export function selectSources(sources: readonly FontFaceSource[], face: FaceUsage): FontFaceSource[] {
  const family = sources.filter((s) => s.family === face.family.toLowerCase());
  if (family.length === 0) return [];
  const styled = family.some((s) => s.style === face.style)
    ? family.filter((s) => s.style === face.style)
    : family;
  const best = Math.min(...styled.map((s) => weightDistance(s, face.weight)));
  return styled
    .filter((s) => weightDistance(s, face.weight) === best)
    .filter(
      (s) => !s.ranges || [...face.codePoints].some((cp) => s.ranges!.some(([a, b]) => cp >= a && cp <= b)),
    );
}

const FORMAT_MIME: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  truetype: 'font/ttf',
  opentype: 'font/otf',
};

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Builds self-contained @font-face rules for the given faces. Fonts that are
 * not web fonts of this app (e.g. system fonts) are skipped.
 */
export async function embeddedFontCss(
  faces: readonly FaceUsage[],
  cache: Map<string, Promise<string | null>> = new Map(),
): Promise<string> {
  if (faces.length === 0 || typeof document === 'undefined') return '';
  const sources = readFontFaces();
  const needed = new Map<string, FontFaceSource>();
  for (const face of faces)
    for (const s of selectSources(sources, face)) needed.set(`${s.family}|${s.url}`, s);
  const rules = await Promise.all(
    [...needed.values()].map(async (s) => {
      let data = cache.get(s.url);
      if (!data) {
        data = fetch(s.url)
          .then(async (res) =>
            res.ok
              ? toDataUrl(
                  new Blob([await res.arrayBuffer()], { type: FORMAT_MIME[s.format] ?? 'font/woff2' }),
                )
              : null,
          )
          .catch(() => null);
        cache.set(s.url, data);
      }
      const url = await data;
      if (!url) return '';
      const family = s.name.replace(/["\\]/g, '');
      const range = s.rangeText ? `unicode-range:${s.rangeText};` : '';
      return `@font-face{font-family:"${family}";font-style:${s.style};font-weight:${s.weightText};src:url(${url}) format("${s.format}");${range}}`;
    }),
  );
  return rules.filter(Boolean).join('\n');
}
