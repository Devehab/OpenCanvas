/**
 * Helpers for rich text content (paragraphs → runs → style overrides).
 */
import { DEFAULT_TEXT_STYLE } from './defaults';
import type { ListStyle, Paragraph, TextContent, TextNode, TextRun, TextStyle } from './types';

const STYLE_KEYS = Object.keys(DEFAULT_TEXT_STYLE) as (keyof TextStyle)[];

/** Builds content from plain text; `\n` separates paragraphs. */
export function textContentFromString(
  text: string,
  style: Partial<TextStyle> = {},
  list: ListStyle = 'none',
): TextContent {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return {
    paragraphs: lines.map((line) => ({ runs: [{ text: line, style: { ...style } }], list, indent: 0 })),
  };
}

export function paragraphText(paragraph: Paragraph): string {
  let out = '';
  for (const run of paragraph.runs) out += run.text;
  return out;
}

/** Plain text with `\n` between paragraphs. */
export function textContentToString(content: TextContent): string {
  return content.paragraphs.map(paragraphText).join('\n');
}

export function textContentLength(content: TextContent): number {
  let n = 0;
  for (const p of content.paragraphs) for (const r of p.runs) n += r.text.length;
  return n;
}

export function isTextContentEmpty(content: TextContent): boolean {
  return content.paragraphs.every((p) => p.runs.every((r) => r.text.trim().length === 0));
}

/** Effective style of a run: node base style + run overrides. */
export function resolveRunStyle(base: TextStyle, run: Pick<TextRun, 'style'> | undefined): TextStyle {
  if (!run || Object.keys(run.style).length === 0) return base;
  return { ...base, ...run.style };
}

function stylesEqual(a: Partial<TextStyle>, b: Partial<TextStyle>): boolean {
  for (const key of STYLE_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/** Removes overrides that equal the base style. */
export function pruneOverrides(base: TextStyle, overrides: Partial<TextStyle>): Partial<TextStyle> {
  const out: Partial<TextStyle> = {};
  for (const key of STYLE_KEYS) {
    const value = overrides[key];
    if (value !== undefined && value !== base[key]) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * Canonical content: merges adjacent runs with identical styles, removes empty
 * runs (keeping one per empty paragraph) and prunes overrides equal to the base style.
 */
export function normalizeTextContent(
  content: TextContent,
  base: TextStyle = DEFAULT_TEXT_STYLE,
): TextContent {
  const paragraphs: Paragraph[] = [];
  const source: Paragraph[] = content.paragraphs.length
    ? content.paragraphs
    : [{ runs: [], list: 'none', indent: 0 }];
  for (const paragraph of source) {
    const runs: TextRun[] = [];
    for (const run of paragraph.runs) {
      const style = pruneOverrides(base, run.style);
      const text = run.text.replace(/\r\n?|\n/g, ' ');
      if (text.length === 0) continue;
      const last = runs[runs.length - 1];
      if (last && stylesEqual(last.style, style)) {
        runs[runs.length - 1] = { text: last.text + text, style: last.style };
      } else {
        runs.push({ text, style });
      }
    }
    if (runs.length === 0) {
      const firstStyle = paragraph.runs[0] ? pruneOverrides(base, paragraph.runs[0].style) : {};
      runs.push({ text: '', style: firstStyle });
    }
    paragraphs.push({ runs, list: paragraph.list, indent: paragraph.indent });
  }
  return { paragraphs };
}

/** Applies `patch` to the base style and removes the same keys from all run overrides. */
export function applyStyleToAll(
  node: Pick<TextNode, 'style' | 'content'>,
  patch: Partial<TextStyle>,
): { style: TextStyle; content: TextContent } {
  const style = { ...node.style, ...patch };
  const keys = Object.keys(patch) as (keyof TextStyle)[];
  const content: TextContent = {
    paragraphs: node.content.paragraphs.map((p) => ({
      ...p,
      runs: p.runs.map((r) => {
        if (!keys.some((k) => k in r.style)) return r;
        const s: Partial<TextStyle> = { ...r.style };
        for (const k of keys) delete s[k];
        return { text: r.text, style: s };
      }),
    })),
  };
  return { style, content };
}

/** Transforms every style (base + overrides), e.g. to scale font sizes. */
export function mapTextStyles(
  node: Pick<TextNode, 'style' | 'content'>,
  fn: (style: Partial<TextStyle>, isBase: boolean) => Partial<TextStyle>,
): { style: TextStyle; content: TextContent } {
  const style = { ...node.style, ...fn(node.style, true) } as TextStyle;
  const content: TextContent = {
    paragraphs: node.content.paragraphs.map((p) => ({
      ...p,
      runs: p.runs.map((r) =>
        Object.keys(r.style).length ? { text: r.text, style: fn(r.style, false) } : r,
      ),
    })),
  };
  return { style, content };
}

/**
 * The value of a style property across all runs, or `'mixed'` when runs differ.
 * Used by the inspector to show "mixed" states.
 */
export function getUniformStyleValue<K extends keyof TextStyle>(
  node: Pick<TextNode, 'style' | 'content'>,
  key: K,
): TextStyle[K] | 'mixed' {
  let value: TextStyle[K] | undefined;
  for (const p of node.content.paragraphs) {
    for (const r of p.runs) {
      if (r.text.length === 0 && node.content.paragraphs.length > 1) continue;
      const v = (r.style[key] ?? node.style[key]) as TextStyle[K];
      if (value === undefined) value = v;
      else if (value !== v) return 'mixed';
    }
  }
  return value ?? node.style[key];
}

/** Replaces the plain text of a node while keeping the first run's style per paragraph. */
export function replaceText(content: TextContent, text: string): TextContent {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const template = content.paragraphs;
  return {
    paragraphs: lines.map((line, i) => {
      const source = template[Math.min(i, template.length - 1)];
      return {
        runs: [{ text: line, style: { ...(source?.runs[0]?.style ?? {}) } }],
        list: source?.list ?? 'none',
        indent: source?.indent ?? 0,
      };
    }),
  };
}
