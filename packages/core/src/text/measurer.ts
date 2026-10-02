/**
 * Text measurement abstraction.
 *
 * The layout engine is pure; all font-dependent numbers come from a
 * TextMeasurer. In the browser and in Node the measurer is backed by a 2D
 * canvas (see @opencanvas/renderer), so measuring and drawing use the same
 * font engine. Tests use the deterministic {@link MockTextMeasurer}.
 */

export interface FontDescriptor {
  family: string;
  size: number;
  weight: number;
  style: 'normal' | 'italic';
}

export interface FontMetrics {
  ascent: number;
  descent: number;
}

export interface TextMeasurer {
  /** CSS font shorthand used for both measuring and drawing. */
  fontString(font: FontDescriptor): string;
  /** Advance width of `text` in px (including letter spacing after each character). */
  measure(text: string, font: string, letterSpacing: number, direction: 'ltr' | 'rtl'): number;
  /** Font ascent/descent in px for the given CSS font. */
  metrics(font: string, fontSize: number): FontMetrics;
}

/** Quotes a family name for CSS font shorthand. */
export function quoteFamily(family: string): string {
  return /^[a-zA-Z-]+$/.test(family) &&
    ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'].includes(family)
    ? family
    : `"${family.replace(/["\\]/g, '')}"`;
}

/** Builds a CSS font shorthand, e.g. `italic 700 32px "Cairo", "Noto Sans Arabic", sans-serif`. */
export function cssFont(font: FontDescriptor, fallbacks: readonly string[] = []): string {
  const families = [quoteFamily(font.family), ...fallbacks.map(quoteFamily)].join(', ');
  const size = Math.round(font.size * 1000) / 1000;
  return `${font.style === 'italic' ? 'italic ' : ''}${font.weight} ${size}px ${families}`;
}

/** Adds an LRU-ish cache in front of any measurer. Measuring is the hot path of layout. */
export function withMeasureCache(measurer: TextMeasurer, maxEntries = 20_000): TextMeasurer {
  const widths = new Map<string, number>();
  const metrics = new Map<string, FontMetrics>();
  return {
    fontString: (font) => measurer.fontString(font),
    measure(text, font, letterSpacing, direction) {
      const key = `${font}\u0000${letterSpacing}\u0000${direction}\u0000${text}`;
      let w = widths.get(key);
      if (w === undefined) {
        w = measurer.measure(text, font, letterSpacing, direction);
        if (widths.size >= maxEntries) widths.clear();
        widths.set(key, w);
      }
      return w;
    },
    metrics(font, fontSize) {
      const key = `${font}\u0000${fontSize}`;
      let m = metrics.get(key);
      if (!m) {
        m = measurer.metrics(font, fontSize);
        metrics.set(key, m);
      }
      return m;
    },
  };
}

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Splits text into user-perceived characters (grapheme clusters). */
export function graphemes(text: string): string[] {
  if (!graphemeSegmenter) return Array.from(text);
  const out: string[] = [];
  for (const s of graphemeSegmenter.segment(text)) out.push(s.segment);
  return out;
}

/**
 * Deterministic measurer for tests: width depends only on the characters and
 * font size, so layout results are identical on every machine.
 */
export class MockTextMeasurer implements TextMeasurer {
  fontString(font: FontDescriptor): string {
    return cssFont(font);
  }

  private static sizeOf(font: string): number {
    const m = /(\d+(?:\.\d+)?)px/.exec(font);
    return m ? Number.parseFloat(m[1]!) : 16;
  }

  static charWidth(ch: string): number {
    if (ch === ' ' || ch === '\u00a0') return 0.25;
    if ("il.,:;!|'`".includes(ch)) return 0.25;
    if ('mwMW@'.includes(ch)) return 0.8;
    if (/[A-Z]/.test(ch)) return 0.65;
    if (/[\u0600-\u06ff]/.test(ch)) return 0.5;
    if (/[\u4e00-\u9fff]/.test(ch)) return 1;
    return 0.55;
  }

  measure(text: string, font: string, letterSpacing: number): number {
    const size = MockTextMeasurer.sizeOf(font);
    let w = 0;
    for (const g of graphemes(text)) w += MockTextMeasurer.charWidth(g[0]!) * size + letterSpacing;
    return w;
  }

  metrics(_font: string, fontSize: number): FontMetrics {
    return { ascent: fontSize * 0.8, descent: fontSize * 0.2 };
  }
}
