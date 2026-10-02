import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  detectDirection,
  getBreakOpportunities,
  layoutText,
  reorderByLevels,
  type TextContent,
  type TextLayoutInput,
  textContentFromString,
} from '../src';
import { measurer } from './helpers';

const style = { ...DEFAULT_TEXT_STYLE, fontSize: 10 };

function input(content: TextContent | string, overrides: Partial<TextLayoutInput> = {}): TextLayoutInput {
  return {
    content: typeof content === 'string' ? textContentFromString(content) : content,
    style,
    align: 'left',
    verticalAlign: 'top',
    direction: 'auto',
    lineHeight: 1.5,
    paragraphSpacing: 0,
    sizing: 'auto-height',
    autoFit: false,
    width: 1000,
    height: 100,
    ...overrides,
  };
}

const lineTexts = (layout: ReturnType<typeof layoutText>) =>
  layout.lines.map((l) => l.fragments.map((f) => f.text).join(''));

describe('text layout', () => {
  it('lays out a single line with half-leading baseline', () => {
    const l = layoutText(input('hello'), measurer);
    expect(l.lines).toHaveLength(1);
    const line = l.lines[0]!;
    expect(line.height).toBe(15);
    // ascent 8, descent 2 → half leading (15-10)/2 = 2.5 → baseline 10.5
    expect(line.baseline).toBeCloseTo(10.5);
    expect(l.boxHeight).toBe(15);
    expect(line.width).toBeCloseTo(5 * 5.5 - (5.5 - 2.5) * 2); // h,e,o = 5.5; l,l = 2.5
  });

  it('wraps at word boundaries (UAX #14) and hangs trailing spaces', () => {
    // "aaaa " = 4*5.5 + 2.5; width 50 fits two words? 22 + 2.5 + 22 = 46.5 → yes; third wraps.
    const l = layoutText(input('aaaa aaaa aaaa', { width: 50 }), measurer);
    expect(lineTexts(l)).toEqual(['aaaa aaaa', 'aaaa']);
  });

  it('breaks overlong words between graphemes', () => {
    const l = layoutText(input('aaaaaaaaaa', { width: 23 }), measurer);
    expect(lineTexts(l)).toEqual(['aaaa', 'aaaa', 'aa']);
  });

  it('auto-width boxes grow to the widest line and never wrap', () => {
    const l = layoutText(input('short\nmuch longer line', { sizing: 'auto-width', width: 1 }), measurer);
    expect(l.lines).toHaveLength(2);
    expect(l.boxWidth).toBeCloseTo(l.lines[1]!.width, 1);
  });

  it('aligns lines', () => {
    const right = layoutText(input('ab', { align: 'right', width: 100 }), measurer);
    expect(right.lines[0]!.fragments[0]!.x).toBeCloseTo(100 - 11);
    const center = layoutText(input('ab', { align: 'center', width: 100 }), measurer);
    expect(center.lines[0]!.fragments[0]!.x).toBeCloseTo((100 - 11) / 2);
  });

  it('justifies all but the last line of a paragraph', () => {
    const l = layoutText(input('aa aa aa aa', { align: 'justify', width: 40 }), measurer);
    const first = l.lines[0]!;
    const last = l.lines[l.lines.length - 1]!;
    const lastFragment = first.fragments[first.fragments.length - 1]!;
    expect(lastFragment.x + lastFragment.width).toBeCloseTo(40);
    expect(last.fragments[0]!.x).toBe(0);
  });

  it('detects RTL paragraphs and right-aligns justified last lines', () => {
    expect(detectDirection('مرحبا hello')).toBe('rtl');
    expect(detectDirection('hello مرحبا')).toBe('ltr');
    expect(detectDirection('123 !')).toBeNull();
    const l = layoutText(input('مرحبا بالعالم', { align: 'justify', width: 500 }), measurer);
    const line = l.lines[0]!;
    expect(line.direction).toBe('rtl');
    expect(line.x + line.width).toBeCloseTo(500);
  });

  it('orders mixed Arabic and Latin fragments visually', () => {
    // RTL paragraph containing an English word: the Latin run sits at a higher (even) level.
    const l = layoutText(input('مرحبا OpenCanvas عالم'), measurer);
    const frags = l.lines[0]!.fragments;
    expect(frags.map((f) => f.direction)).toEqual(['rtl', 'ltr', 'rtl']);
    // Visual left-to-right: the last logical Arabic word comes first.
    // The space before عالم resolves to the RTL level, so it travels with that fragment.
    expect(frags[0]!.text).toBe(' عالم');
    expect(frags[1]!.text).toBe('OpenCanvas');
    expect(frags[2]!.text.trim()).toBe('مرحبا');
    for (let i = 1; i < frags.length; i++)
      expect(frags[i]!.x).toBeCloseTo(frags[i - 1]!.x + frags[i - 1]!.width);
  });

  it('keeps numbers in RTL text left-to-right', () => {
    const l = layoutText(input('السعر 120 ريال'), measurer);
    const texts = l.lines[0]!.fragments.map((f) => f.text.trim());
    expect(texts).toContain('120');
    expect(l.lines[0]!.fragments.find((f) => f.text.trim() === '120')!.direction).toBe('ltr');
  });

  it('inherits direction for empty paragraphs', () => {
    const l = layoutText(input('مرحبا\n\nhello'), measurer);
    expect(l.lines.map((x) => x.direction)).toEqual(['rtl', 'rtl', 'ltr']);
  });

  it('splits fragments at style changes', () => {
    const content: TextContent = {
      paragraphs: [
        {
          runs: [
            { text: 'bold', style: { fontWeight: 700 } },
            { text: ' text', style: {} },
          ],
          list: 'none',
          indent: 0,
        },
      ],
    };
    const l = layoutText(input(content), measurer);
    expect(l.lines[0]!.fragments.map((f) => [f.text, f.style.fontWeight])).toEqual([
      ['bold', 700],
      [' text', 400],
    ]);
  });

  it('uses the tallest run for line height', () => {
    const content: TextContent = {
      paragraphs: [
        {
          runs: [
            { text: 'a', style: {} },
            { text: 'B', style: { fontSize: 40 } },
          ],
          list: 'none',
          indent: 0,
        },
      ],
    };
    const l = layoutText(input(content), measurer);
    expect(l.lines[0]!.height).toBe(60);
  });

  it('applies text transforms and letter spacing', () => {
    const upper = layoutText(
      input({
        paragraphs: [
          { runs: [{ text: 'abc', style: { textTransform: 'uppercase' } }], list: 'none', indent: 0 },
        ],
      }),
      measurer,
    );
    expect(upper.lines[0]!.fragments[0]!.text).toBe('ABC');
    const spaced = layoutText(
      input({
        paragraphs: [{ runs: [{ text: 'ab', style: { letterSpacing: 100 } }], list: 'none', indent: 0 }],
      }),
      measurer,
    );
    expect(spaced.lines[0]!.width).toBeCloseTo(11 + 2 * 1); // 0.1em * 10px per char
  });

  it('renders bullets and numbers with hanging indents', () => {
    const content: TextContent = {
      paragraphs: [
        { runs: [{ text: 'one', style: {} }], list: 'number', indent: 0 },
        { runs: [{ text: 'two', style: {} }], list: 'number', indent: 0 },
        { runs: [{ text: 'dot', style: {} }], list: 'bullet', indent: 0 },
      ],
    };
    const l = layoutText(input(content), measurer);
    expect(l.lines.map((x) => x.marker?.text)).toEqual(['1.', '2.', '•']);
    expect(l.lines[0]!.fragments[0]!.x).toBe(15); // 1.5em indent
    expect(l.lines[0]!.marker!.x + l.lines[0]!.marker!.width).toBeLessThanOrEqual(15);
  });

  it('shrinks text to fit fixed boxes when autoFit is on', () => {
    const long = 'aaaa '.repeat(40);
    const fixed = layoutText(input(long, { sizing: 'fixed', width: 100, height: 40 }), measurer);
    expect(fixed.overflow).toBe(true);
    const fitted = layoutText(
      input(long, { sizing: 'fixed', width: 100, height: 40, autoFit: true }),
      measurer,
    );
    expect(fitted.overflow).toBe(false);
    expect(fitted.fontScale).toBeLessThan(1);
    expect(fitted.contentHeight).toBeLessThanOrEqual(40.5);
  });

  it('vertically aligns content in fixed boxes', () => {
    const l = layoutText(input('a', { sizing: 'fixed', height: 100, verticalAlign: 'bottom' }), measurer);
    expect(l.lines[0]!.y).toBeCloseTo(85);
    const m = layoutText(input('a', { sizing: 'fixed', height: 100, verticalAlign: 'middle' }), measurer);
    expect(m.lines[0]!.y).toBeCloseTo(42.5);
  });

  it('honours soft line breaks (U+2028)', () => {
    const l = layoutText(input('first second'), measurer);
    expect(lineTexts(l)).toEqual(['first', 'second']);
  });

  it('finds UAX #14 break opportunities', () => {
    expect(getBreakOpportunities('a b-c').map((b) => b.position)).toEqual([2, 4, 5]);
  });

  it('reorders by levels (rule L2)', () => {
    const items = [
      { t: 'A', level: 1 },
      { t: 'B', level: 2 },
      { t: 'C', level: 2 },
      { t: 'D', level: 1 },
    ];
    expect(reorderByLevels(items).map((i) => i.t)).toEqual(['D', 'B', 'C', 'A']);
  });
});
