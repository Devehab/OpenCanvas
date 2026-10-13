/**
 * Item makers shared by the catalog's parts: they size each element from its
 * outline's own proportions.
 */
import { type AnyNodeProps, curveBounds, parseSvgPath, type Stroke } from '@opencanvas/core';
import { customFrame, customShape, type ElementItem, item, strokedPath } from './builders';
import { type Path, svg, translate } from './geometry';

export const parse = (d: string): Path => parseSvgPath(d);

const toPath = (outline: Path | string): Path => (typeof outline === 'string' ? parse(outline) : outline);

/** A box with the outline's proportions, its longer side `size` long. */
export function fitSize(outline: Path | string, size = 200): { width: number; height: number } {
  const b = curveBounds(toPath(outline));
  const ratio = b.width / b.height;
  return ratio >= 1
    ? { width: size, height: Math.round(size / ratio) }
    : { width: Math.round(size * ratio), height: size };
}

export interface OutlineOptions {
  /** Longer side, px (default 200 for shapes, 300 for frames). */
  size?: number;
  /** Explicit size instead (the outline is stretched to it). */
  width?: number;
  height?: number;
  cornerRadius?: number;
  keywords?: string;
}

function boxOf(outline: Path | string, options: OutlineOptions, size: number) {
  return options.width && options.height
    ? { width: options.width, height: options.height }
    : fitSize(outline, options.size ?? size);
}

/** A `custom` shape element. */
export function outlineShape(
  id: string,
  en: string,
  ar: string,
  outline: Path | string,
  options: OutlineOptions = {},
) {
  const box = boxOf(outline, options, 200);
  const d = typeof outline === 'string' ? outline : svg(outline);
  return item(
    `shape:${id}`,
    en,
    ar,
    customShape(d, { ...box, cornerRadius: options.cornerRadius }),
    options.keywords,
  );
}

/** A `custom` frame element (an empty photo slot with this outline). */
export function outlineFrame(
  id: string,
  en: string,
  ar: string,
  outline: Path | string,
  options: OutlineOptions = {},
) {
  const box = boxOf(outline, options, 300);
  const d = typeof outline === 'string' ? outline : svg(outline);
  return item(
    `frame:${id}`,
    en,
    ar,
    customFrame(d, box, { cornerRadius: options.cornerRadius }),
    `frame photo ${options.keywords ?? ''}`.trim(),
  );
}

/** A stroked line (curve, wave, hand-drawn mark) sized to its outline. */
export function strokeLine(
  id: string,
  en: string,
  ar: string,
  outline: Path,
  stroke: Partial<Stroke> = {},
  keywords?: string,
): ElementItem {
  const b = curveBounds(outline);
  const moved = translate(outline, -b.x, -b.y);
  return item(
    `line:${id}`,
    en,
    ar,
    strokedPath(
      svg(moved),
      { width: Math.round(b.width * 100) / 100, height: Math.round(b.height * 100) / 100 },
      stroke,
    ),
    keywords,
  );
}

/** A piece of a composite element whose outline is given in absolute coordinates (its box is the outline's bounds). */
export function placed(outline: Path | string): {
  x: number;
  y: number;
  width: number;
  height: number;
  path: string;
} {
  const path = toPath(outline);
  const b = curveBounds(path);
  const r = (n: number) => Math.round(n * 100) / 100;
  return { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height), path: svg(path) };
}

export type { AnyNodeProps };
