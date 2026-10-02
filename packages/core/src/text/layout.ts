/**
 * Text layout engine.
 *
 * Turns rich text content into positioned lines and fragments. The same
 * layout feeds the canvas renderer, the SVG exporter and auto-sizing, so text
 * looks identical everywhere it is drawn.
 *
 * Pipeline per paragraph:
 *   runs → resolved styles → paragraph direction (auto = first strong char)
 *   → bidi embedding levels (UAX #9) → line break opportunities (UAX #14)
 *   → greedy line filling (+ emergency grapheme breaks for overlong words)
 *   → per-line fragments split by style and bidi level → visual reordering (L2)
 *   → alignment (left/center/right/justify) → vertical metrics.
 *
 * Fragments are drawn whole with their own direction, so the platform text
 * shaper (browser / Skia) handles Arabic joining, ligatures and kerning.
 */
import type {
  TextAlign,
  TextContent,
  TextDirection,
  TextNode,
  TextSizing,
  TextStyle,
  TextTransform,
  VerticalAlign,
} from '../model/types';
import { type Direction, detectDirection, embeddingLevels, reorderByLevels } from './bidi';
import { getBreakOpportunities, trimEndIndex } from './linebreak';
import { graphemes, type TextMeasurer } from './measurer';

export interface TextLayoutInput {
  content: TextContent;
  style: TextStyle;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  direction: TextDirection;
  lineHeight: number;
  paragraphSpacing: number;
  sizing: TextSizing;
  autoFit: boolean;
  width: number;
  height: number;
}

export interface FragmentStyle {
  font: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  underline: boolean;
  strikethrough: boolean;
  /** Letter spacing in px. */
  letterSpacing: number;
}

export interface LayoutFragment {
  /** Text in logical order (draw with `direction`). */
  text: string;
  /** Left edge in box coordinates. */
  x: number;
  width: number;
  direction: Direction;
  style: FragmentStyle;
}

export interface LayoutLine {
  paragraph: number;
  /** Top of the line box. */
  y: number;
  height: number;
  baseline: number;
  ascent: number;
  descent: number;
  /** Visual extent of the line content (trailing spaces excluded). */
  x: number;
  width: number;
  direction: Direction;
  fragments: LayoutFragment[];
  marker: LayoutFragment | null;
  isLastInParagraph: boolean;
}

export interface TextLayout {
  /** Resulting node width/height after applying the sizing mode. */
  boxWidth: number;
  boxHeight: number;
  contentWidth: number;
  contentHeight: number;
  /** Font scale applied by auto-fit (1 = none). */
  fontScale: number;
  /** True when content overflows a fixed box. */
  overflow: boolean;
  lines: LayoutLine[];
}

const MIN_AUTOFIT_SCALE = 0.05;
const BULLETS = ['•', '◦', '▪'];

export function textLayoutInput(node: TextNode): TextLayoutInput {
  return {
    content: node.content,
    style: node.style,
    align: node.align,
    verticalAlign: node.verticalAlign,
    direction: node.direction,
    lineHeight: node.lineHeight,
    paragraphSpacing: node.paragraphSpacing,
    sizing: node.sizing,
    autoFit: node.autoFit,
    width: node.width,
    height: node.height,
  };
}

function applyTransform(text: string, transform: TextTransform): string {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  return text;
}

interface Span {
  start: number;
  end: number;
  style: FragmentStyle;
}

function resolveStyle(
  base: TextStyle,
  overrides: Partial<TextStyle>,
  scale: number,
  measurer: TextMeasurer,
): FragmentStyle & { textTransform: TextTransform } {
  const s = Object.keys(overrides).length ? { ...base, ...overrides } : base;
  const fontSize = Math.max(0.5, Math.round(s.fontSize * scale * 100) / 100);
  return {
    font: measurer.fontString({
      family: s.fontFamily,
      size: fontSize,
      weight: s.fontWeight,
      style: s.fontStyle,
    }),
    fontFamily: s.fontFamily,
    fontSize,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle,
    color: s.color,
    underline: s.underline,
    strikethrough: s.strikethrough,
    letterSpacing: (s.letterSpacing / 1000) * fontSize,
    textTransform: s.textTransform,
  };
}

/** Measures [start, end) of the paragraph text, splitting by style spans. */
function measureRange(
  text: string,
  spans: readonly Span[],
  start: number,
  end: number,
  dir: Direction,
  m: TextMeasurer,
): number {
  if (end <= start) return 0;
  let w = 0;
  for (const span of spans) {
    const s = Math.max(start, span.start);
    const e = Math.min(end, span.end);
    if (e > s) w += m.measure(text.slice(s, e), span.style.font, span.style.letterSpacing, dir);
  }
  return w;
}

interface LineRange {
  start: number;
  end: number;
}

/** Greedy line breaking over UAX #14 opportunities. */
function breakLines(
  text: string,
  spans: readonly Span[],
  maxWidth: number,
  dir: Direction,
  m: TextMeasurer,
): LineRange[] {
  if (text.length === 0) return [{ start: 0, end: 0 }];
  const lines: LineRange[] = [];
  const opportunities = getBreakOpportunities(text);
  let lineStart = 0;
  let lineWidth = 0;
  let segStart = 0;
  for (const op of opportunities) {
    const segEnd = op.position;
    if (segEnd <= segStart) continue;
    const visibleEnd = trimEndIndex(text, segStart, segEnd);
    const visibleWidth = measureRange(text, spans, segStart, visibleEnd, dir, m);
    const fullWidth =
      visibleEnd === segEnd ? visibleWidth : measureRange(text, spans, segStart, segEnd, dir, m);
    if (lineStart < segStart && lineWidth + visibleWidth > maxWidth + 1e-6) {
      lines.push({ start: lineStart, end: segStart });
      lineStart = segStart;
      lineWidth = 0;
    }
    if (lineStart === segStart && visibleWidth > maxWidth + 1e-6) {
      // Overlong word: break between grapheme clusters.
      let pos = segStart;
      let acc = 0;
      let chunkStart = segStart;
      for (const g of graphemes(text.slice(segStart, visibleEnd))) {
        const gw = measureRange(text, spans, pos, pos + g.length, dir, m);
        if (acc + gw > maxWidth + 1e-6 && pos > chunkStart) {
          lines.push({ start: chunkStart, end: pos });
          chunkStart = pos;
          acc = 0;
        }
        acc += gw;
        pos += g.length;
      }
      lineStart = chunkStart;
      lineWidth = acc + (fullWidth - visibleWidth);
    } else {
      lineWidth += fullWidth;
    }
    segStart = segEnd;
    if (op.required) {
      lines.push({ start: lineStart, end: segEnd });
      lineStart = segEnd;
      lineWidth = 0;
    }
  }
  if (lineStart < text.length || lines.length === 0) lines.push({ start: lineStart, end: text.length });
  return lines;
}

interface PendingLine {
  paragraph: number;
  range: LineRange;
  visibleEnd: number;
  direction: Direction;
  fragments: { text: string; level: number; style: FragmentStyle; width: number }[];
  width: number;
  height: number;
  ascent: number;
  descent: number;
  indent: number;
  marker: { text: string; style: FragmentStyle; width: number } | null;
  isLastInParagraph: boolean;
  spacingAfter: number;
}

function layoutAtScale(input: TextLayoutInput, m: TextMeasurer, scale: number): TextLayout {
  const maxWidth = input.sizing === 'auto-width' ? Number.POSITIVE_INFINITY : Math.max(1, input.width);
  const pending: PendingLine[] = [];
  const counters: number[] = [];
  let previousDirection: Direction = input.direction === 'rtl' ? 'rtl' : 'ltr';
  const paragraphs = input.content.paragraphs.length
    ? input.content.paragraphs
    : [{ runs: [], list: 'none' as const, indent: 0 }];

  paragraphs.forEach((p, pi) => {
    const runs = p.runs.length ? p.runs : [{ text: '', style: {} }];
    let text = '';
    const spans: Span[] = [];
    for (const run of runs) {
      const style = resolveStyle(input.style, run.style, scale, m);
      const t = applyTransform(run.text, style.textTransform);
      spans.push({ start: text.length, end: text.length + t.length, style });
      text += t;
    }
    const firstStyle = spans[0]!.style;
    const direction: Direction =
      input.direction === 'auto' ? (detectDirection(text) ?? previousDirection) : input.direction;
    previousDirection = direction;
    const levels = text.length ? embeddingLevels(text, direction) : new Uint8Array(0);

    // Lists
    let marker: PendingLine['marker'] = null;
    if (p.list === 'none') {
      counters.length = 0;
    } else {
      counters.length = p.indent + 1;
      counters[p.indent] = p.list === 'number' ? (counters[p.indent] ?? 0) + 1 : 0;
      const markerText = p.list === 'bullet' ? BULLETS[p.indent % BULLETS.length]! : `${counters[p.indent]}.`;
      marker = {
        text: markerText,
        style: firstStyle,
        width: m.measure(markerText, firstStyle.font, 0, direction),
      };
    }
    const indentUnit = firstStyle.fontSize * 1.5;
    const indent = (p.indent + (p.list !== 'none' ? 1 : 0)) * indentUnit;
    const available = Math.max(1, maxWidth - indent);

    const ranges = breakLines(text, spans, available, direction, m);
    ranges.forEach((range, li) => {
      const visibleEnd = trimEndIndex(text, range.start, range.end);
      // Logical fragments split by bidi level and style span.
      const logical: PendingLine['fragments'] = [];
      let i = range.start;
      while (i < visibleEnd) {
        const level = levels[i] ?? (direction === 'rtl' ? 1 : 0);
        const span = spans.find((s) => i >= s.start && i < s.end) ?? spans[spans.length - 1]!;
        let j = i + 1;
        while (j < visibleEnd && (levels[j] ?? 0) === level && j < span.end) j++;
        const fragmentText = text.slice(i, j);
        const fragmentDir: Direction = level % 2 === 1 ? 'rtl' : 'ltr';
        logical.push({
          text: fragmentText,
          level,
          style: span.style,
          width: m.measure(fragmentText, span.style.font, span.style.letterSpacing, fragmentDir),
        });
        i = j;
      }
      const visual = reorderByLevels(logical);
      // Vertical metrics from the spans present on this line (or the first span when empty).
      const lineSpans = spans.filter(
        (s) => s.end > range.start && s.start < Math.max(visibleEnd, range.start + 1),
      );
      const metricSpans = lineSpans.length
        ? lineSpans
        : [spans.find((s) => s.start >= range.start) ?? spans[0]!];
      let ascent = 0;
      let descent = 0;
      let height = 0;
      for (const s of metricSpans) {
        const fm = m.metrics(s.style.font, s.style.fontSize);
        ascent = Math.max(ascent, fm.ascent);
        descent = Math.max(descent, fm.descent);
        height = Math.max(height, s.style.fontSize * input.lineHeight);
      }
      const isLast = li === ranges.length - 1;
      pending.push({
        paragraph: pi,
        range,
        visibleEnd,
        direction,
        fragments: visual,
        width: visual.reduce((sum, f) => sum + f.width, 0),
        height,
        ascent,
        descent,
        indent,
        marker: li === 0 ? marker : null,
        isLastInParagraph: isLast,
        spacingAfter: isLast && pi < paragraphs.length - 1 ? input.paragraphSpacing * scale : 0,
      });
    });
  });

  const contentWidth = pending.reduce((w, l) => Math.max(w, l.width + l.indent), 0);
  const contentHeight = pending.reduce((h, l) => h + l.height + l.spacingAfter, 0);
  const boxWidth =
    input.sizing === 'auto-width' ? Math.max(1, Math.ceil(contentWidth * 100) / 100) : input.width;
  const boxHeight = input.sizing === 'fixed' ? input.height : Math.max(1, contentHeight);
  let offsetY = 0;
  if (input.sizing === 'fixed') {
    if (input.verticalAlign === 'middle') offsetY = (boxHeight - contentHeight) / 2;
    else if (input.verticalAlign === 'bottom') offsetY = boxHeight - contentHeight;
  }

  const lines: LayoutLine[] = [];
  let y = offsetY;
  for (const line of pending) {
    const regionStart = line.direction === 'ltr' ? line.indent : 0;
    const regionEnd = line.direction === 'ltr' ? boxWidth : boxWidth - line.indent;
    const regionWidth = Math.max(0, regionEnd - regionStart);
    const free = regionWidth - line.width;
    let align = input.align;
    const justify = align === 'justify' && !line.isLastInParagraph && free > 0;
    if (align === 'justify') align = line.direction === 'rtl' ? 'right' : 'left';
    let x0 = regionStart;
    if (align === 'right') x0 = regionEnd - line.width;
    else if (align === 'center') x0 = regionStart + free / 2;

    const baseline = y + (line.height - (line.ascent + line.descent)) / 2 + line.ascent;
    const fragments: LayoutFragment[] = [];
    if (justify) {
      const spaceCount = line.fragments.reduce((n, f) => n + (f.text.match(/ /g)?.length ?? 0), 0);
      const extra = spaceCount > 0 ? free / spaceCount : 0;
      let cursor = regionStart;
      for (const f of line.fragments) {
        const dir: Direction = f.level % 2 === 1 ? 'rtl' : 'ltr';
        const tokens = f.text.split(/( +)/).filter((t) => t.length > 0);
        const ordered = dir === 'rtl' ? [...tokens].reverse() : tokens;
        for (const token of ordered) {
          const w = m.measure(token, f.style.font, f.style.letterSpacing, dir);
          if (token.trim().length === 0) {
            cursor += w + extra * token.length;
          } else {
            fragments.push({ text: token, x: cursor, width: w, direction: dir, style: f.style });
            cursor += w;
          }
        }
      }
    } else {
      let cursor = x0;
      for (const f of line.fragments) {
        fragments.push({
          text: f.text,
          x: cursor,
          width: f.width,
          direction: f.level % 2 === 1 ? 'rtl' : 'ltr',
          style: f.style,
        });
        cursor += f.width;
      }
    }
    let marker: LayoutFragment | null = null;
    if (line.marker) {
      const gap = line.marker.style.fontSize * 0.4;
      const mx = line.direction === 'ltr' ? regionStart - gap - line.marker.width : regionEnd + gap;
      marker = {
        text: line.marker.text,
        x: mx,
        width: line.marker.width,
        direction: line.direction,
        style: line.marker.style,
      };
    }
    lines.push({
      paragraph: line.paragraph,
      y,
      height: line.height,
      baseline,
      ascent: line.ascent,
      descent: line.descent,
      x: justify ? regionStart : x0,
      width: justify ? regionWidth : line.width,
      direction: line.direction,
      fragments,
      marker,
      isLastInParagraph: line.isLastInParagraph,
    });
    y += line.height + line.spacingAfter;
  }

  return {
    boxWidth,
    boxHeight,
    contentWidth,
    contentHeight,
    fontScale: scale,
    overflow: input.sizing === 'fixed' && contentHeight > boxHeight + 0.5,
    lines,
  };
}

/** Lays out text. For fixed boxes with `autoFit`, the font is scaled down until the text fits. */
export function layoutText(input: TextLayoutInput, measurer: TextMeasurer): TextLayout {
  const full = layoutAtScale(input, measurer, 1);
  if (!(input.sizing === 'fixed' && input.autoFit) || !full.overflow) return full;
  let lo = MIN_AUTOFIT_SCALE;
  let hi = 1;
  let best: TextLayout | null = null;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const candidate = layoutAtScale(input, measurer, mid);
    if (candidate.overflow) {
      hi = mid;
    } else {
      lo = mid;
      best = candidate;
    }
    if (hi - lo < 0.002) break;
  }
  return best ?? layoutAtScale(input, measurer, MIN_AUTOFIT_SCALE);
}

/** Box size a text node should have given its sizing mode. */
export function measureTextBox(node: TextNode, measurer: TextMeasurer): { width: number; height: number } {
  const layout = layoutText(textLayoutInput(node), measurer);
  return { width: layout.boxWidth, height: layout.boxHeight };
}

/** Normalized horizontal anchor that stays fixed when an auto-sized text box grows. */
export function textGrowthAnchorX(node: Pick<TextNode, 'align' | 'direction' | 'content'>): number {
  if (node.align === 'center') return 0.5;
  if (node.align === 'right') return 1;
  if (node.align === 'left') return 0;
  // justify: grow from the paragraph's start edge
  const first = node.content.paragraphs[0]?.runs.map((r) => r.text).join('') ?? '';
  const dir = node.direction === 'auto' ? (detectDirection(first) ?? 'ltr') : node.direction;
  return dir === 'rtl' ? 1 : 0;
}
