/**
 * TextMeasurer backed by a real 2D canvas context, so layout uses exactly the
 * font engine that draws the text (browser shaper or Skia in Node).
 */
import {
  cssFont,
  type FontDescriptor,
  type FontMetrics,
  graphemes,
  type TextMeasurer,
  withMeasureCache,
} from '@opencanvas/core';
import { type Context2D, context2d, type RenderPlatform } from './platform';

/** Fallback fonts appended to every family so Arabic always has a glyph source. */
export const DEFAULT_FONT_FALLBACKS = ['Noto Sans Arabic', 'Noto Sans', 'sans-serif'];

export class CanvasTextMeasurer implements TextMeasurer {
  private readonly ctx: Context2D & { letterSpacing?: string };
  private readonly metricsCache = new Map<string, FontMetrics>();

  constructor(
    private readonly platform: RenderPlatform,
    private readonly fallbacks: readonly string[] = DEFAULT_FONT_FALLBACKS,
  ) {
    this.ctx = context2d(platform.createCanvas(8, 8));
  }

  fontString(font: FontDescriptor): string {
    return cssFont(font, this.fallbacks);
  }

  measure(text: string, font: string, letterSpacing: number, direction: 'ltr' | 'rtl'): number {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.direction = direction;
    if (this.platform.supportsLetterSpacing) {
      ctx.letterSpacing = `${letterSpacing}px`;
      return ctx.measureText(text).width;
    }
    const width = ctx.measureText(text).width;
    // Manual letter spacing is only applied to LTR text (see drawText for the matching rule).
    return direction === 'rtl' || letterSpacing === 0
      ? width
      : width + letterSpacing * graphemes(text).length;
  }

  metrics(font: string, fontSize: number): FontMetrics {
    let m = this.metricsCache.get(font);
    if (!m) {
      const ctx = this.ctx;
      ctx.font = font;
      ctx.direction = 'ltr';
      if (this.platform.supportsLetterSpacing) ctx.letterSpacing = '0px';
      const tm = ctx.measureText('Hgجق');
      const ascent = tm.fontBoundingBoxAscent;
      const descent = tm.fontBoundingBoxDescent;
      m =
        Number.isFinite(ascent) && Number.isFinite(descent) && ascent > 0
          ? { ascent, descent }
          : { ascent: fontSize * 0.9, descent: fontSize * 0.25 };
      this.metricsCache.set(font, m);
    }
    return m;
  }

  /** Clears cached metrics, e.g. after a web font finished loading. */
  invalidate(): void {
    this.metricsCache.clear();
  }
}

/** Measurer with a width cache in front (what the editor and exporters use). */
export function createCanvasMeasurer(
  platform: RenderPlatform,
  fallbacks?: readonly string[],
): TextMeasurer & { invalidate(): void } {
  const base = new CanvasTextMeasurer(platform, fallbacks);
  let cached = withMeasureCache(base);
  return {
    fontString: (f) => cached.fontString(f),
    measure: (t, f, l, d) => cached.measure(t, f, l, d),
    metrics: (f, s) => cached.metrics(f, s),
    invalidate() {
      base.invalidate();
      cached = withMeasureCache(base);
    },
  };
}
