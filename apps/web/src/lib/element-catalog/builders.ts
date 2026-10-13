/**
 * Builders of element props: shapes, lines, frames and the composite frames
 * (photo frames, collages, device mockups) made of them. Kept apart from the
 * catalog's data so the Elements panel can show its first items without
 * loading the whole catalog.
 *
 * The pieces of composite elements give their outlines in their own pixels
 * (the size they are added at), so rounded corners stay round.
 */
import type { AnyNodeProps, ArrowHead, Fill, Shadow, ShapeKind, Stroke } from '@opencanvas/core';

export interface Label {
  en: string;
  ar: string;
}

export interface ElementItem {
  /** Stable id, e.g. `shape:star-8` or `frame:polaroid`. */
  id: string;
  label: Label;
  /** Extra search words (English). */
  keywords?: string;
  props: AnyNodeProps;
}

export interface ElementSection {
  id: string;
  title: Label;
  items: ElementItem[];
  /** Columns in the grid (wide items such as lines and devices use fewer). */
  columns: 2 | 3 | 4;
}

export const BRAND = '#7c6cf8';
export const INK = '#111827';
export const PLACEHOLDER = '#e5e7eb';

export const item = (
  id: string,
  en: string,
  ar: string,
  props: AnyNodeProps,
  keywords?: string,
): ElementItem => ({
  id,
  label: { en, ar },
  props,
  keywords,
});

type Box = { x?: number; y?: number; width: number; height: number };

export type ShapeOptions = {
  cornerRadius?: number;
  sides?: number;
  innerRatio?: number;
  width?: number;
  height?: number;
  fill?: Fill;
};

export function shape(kind: ShapeKind, options: ShapeOptions = {}): AnyNodeProps {
  return {
    type: 'shape',
    shape: kind,
    width: options.width ?? 200,
    height: options.height ?? 200,
    cornerRadius: options.cornerRadius ?? 0,
    sides: options.sides ?? (kind === 'scallop' ? 12 : kind === 'star' ? 5 : 6),
    innerRatio: options.innerRatio ?? (kind === 'ring' ? 0.6 : 0.5),
    fill: options.fill ?? { type: 'solid', color: BRAND },
  } as AnyNodeProps;
}

/** A shape with any outline (SVG path data), stretched to its box. */
export function customShape(
  path: string,
  options: Omit<ShapeOptions, 'sides' | 'innerRatio'> = {},
): AnyNodeProps {
  return { ...shape('custom', options), path } as AnyNodeProps;
}

export function line(options: {
  style?: 'solid' | 'dashed' | 'dotted';
  start?: ArrowHead;
  end?: ArrowHead;
  width?: number;
  cap?: 'round' | 'butt';
}): AnyNodeProps {
  const w = options.width ?? 4;
  return {
    type: 'line',
    width: 300,
    height: w,
    startArrow: options.start ?? 'none',
    endArrow: options.end ?? 'none',
    stroke: {
      color: INK,
      width: w,
      style: options.style ?? 'solid',
      cap: options.cap ?? (options.style === 'dashed' ? 'butt' : 'round'),
      join: 'round',
    },
  } as AnyNodeProps;
}

/** A stroked vector line (curves, waves, hand-drawn marks): its view box is its size. */
export function strokedPath(
  path: string,
  size: { width: number; height: number },
  stroke: Partial<Stroke> = {},
): AnyNodeProps {
  return {
    type: 'path',
    path,
    viewBox: { x: 0, y: 0, width: size.width, height: size.height },
    width: size.width,
    height: size.height,
    fill: null,
    fillRule: 'nonzero',
    stroke: {
      color: INK,
      width: 4,
      style: 'solid',
      cap: 'round',
      join: 'round',
      ...stroke,
    },
  } as AnyNodeProps;
}

/** A photo slot: an empty frame waiting for a picture. */
export const PHOTO_SLOT = { role: 'image-slot', description: '', slot: null };

export function frame(
  kind: ShapeKind,
  box: Box,
  extra: {
    cornerRadius?: number;
    rotation?: number;
    path?: string;
    stroke?: Stroke | null;
    shadow?: Shadow;
  } = {},
): AnyNodeProps {
  return {
    type: 'frame',
    shape: kind,
    ...(extra.path ? { path: extra.path } : {}),
    x: box.x ?? 0,
    y: box.y ?? 0,
    width: box.width,
    height: box.height,
    cornerRadius: extra.cornerRadius ?? 0,
    rotation: extra.rotation ?? 0,
    fill: { type: 'solid', color: PLACEHOLDER },
    stroke: extra.stroke ?? null,
    shadow: extra.shadow ?? null,
    clipContent: true,
    semantic: PHOTO_SLOT,
  } as AnyNodeProps;
}

/** A frame with any outline (SVG path data), stretched to its box. */
export const customFrame = (
  path: string,
  box: Box,
  extra: { cornerRadius?: number; rotation?: number } = {},
) => frame('custom', box, { ...extra, path });

/** A plain filled piece of a composite element (paper, bezel, button…). */
export function piece(
  box: { x: number; y: number; width: number; height: number },
  fill: string | Fill | null,
  extra: {
    cornerRadius?: number;
    shadow?: Shadow;
    kind?: ShapeKind;
    path?: string;
    name?: string;
    rotation?: number;
    opacity?: number;
    stroke?: Stroke;
  } = {},
): AnyNodeProps {
  return {
    type: 'shape',
    shape: extra.kind ?? (extra.path ? 'custom' : 'rect'),
    ...(extra.path ? { path: extra.path } : {}),
    ...box,
    name: extra.name ?? '',
    rotation: extra.rotation ?? 0,
    opacity: extra.opacity ?? 1,
    cornerRadius: extra.cornerRadius ?? 0,
    fill: typeof fill === 'string' ? { type: 'solid', color: fill } : fill,
    stroke: extra.stroke ?? null,
    shadow: extra.shadow ?? null,
  } as AnyNodeProps;
}

export function group(
  name: string,
  width: number,
  height: number,
  children: AnyNodeProps[],
  rotation = 0,
): AnyNodeProps {
  return { type: 'group', name, x: 0, y: 0, width, height, rotation, children } as AnyNodeProps;
}

export const SOFT_SHADOW: Shadow = { color: '#0f172a2e', offsetX: 0, offsetY: 8, blur: 24 };
export const DEEP_SHADOW: Shadow = { color: '#0f172a40', offsetX: 0, offsetY: 18, blur: 40 };

export function linear(angle: number, ...colors: string[]): Fill {
  return {
    type: 'linear-gradient',
    angle,
    stops: colors.map((color, i) => ({ offset: colors.length === 1 ? 0 : i / (colors.length - 1), color })),
  };
}

export function radial(cx: number, cy: number, ...colors: string[]): Fill {
  return {
    type: 'radial-gradient',
    cx,
    cy,
    stops: colors.map((color, i) => ({ offset: colors.length === 1 ? 0 : i / (colors.length - 1), color })),
  };
}

// ---------------------------------------------------------------------------
// Photo frames
// ---------------------------------------------------------------------------

export function polaroid(rotation: number): AnyNodeProps {
  return group(
    'Polaroid',
    300,
    360,
    [
      piece({ x: 0, y: 0, width: 300, height: 360 }, '#ffffff', { shadow: SOFT_SHADOW, name: 'Paper' }),
      frame('rect', { x: 18, y: 18, width: 264, height: 264 }),
    ],
    rotation,
  );
}

export function filmStrip(count: number): AnyNodeProps {
  const cell = 170;
  const gap = 16;
  const width = count * cell + (count + 1) * gap;
  const height = 210;
  const holes: AnyNodeProps[] = [];
  const holeCount = Math.floor(width / 26);
  const step = width / holeCount;
  for (let i = 0; i < holeCount; i++) {
    for (const y of [10, height - 22]) {
      holes.push(
        piece({ x: i * step + (step - 14) / 2, y, width: 14, height: 12 }, '#f8fafc', {
          cornerRadius: 3,
          name: 'Hole',
        }),
      );
    }
  }
  const frames = Array.from({ length: count }, (_, i) =>
    frame('rect', { x: gap + i * (cell + gap), y: 36, width: cell, height: height - 72 }),
  );
  return group('Film strip', width, height, [
    piece({ x: 0, y: 0, width, height }, '#111111', { name: 'Film' }),
    ...holes,
    ...frames,
  ]);
}

// ---------------------------------------------------------------------------
// Collages
// ---------------------------------------------------------------------------

export type Cell = [x: number, y: number, width: number, height: number];

/** Photo slots laid out as a collage (rectangles, or any frame kind / outline). */
export function collage(
  cells: Cell[],
  options: { cornerRadius?: number; kind?: ShapeKind; path?: string } = {},
): AnyNodeProps {
  const width = Math.max(...cells.map(([x, , w]) => x + w));
  const height = Math.max(...cells.map(([, y, , h]) => y + h));
  return group(
    'Grid',
    width,
    height,
    cells.map(([x, y, w, h]) =>
      frame(
        options.path ? 'custom' : (options.kind ?? 'rect'),
        { x, y, width: w, height: h },
        {
          cornerRadius: options.cornerRadius,
          path: options.path,
        },
      ),
    ),
  );
}

/**
 * Evenly split collage: `rows` lists how many photos each row has (e.g.
 * [1, 2] = one wide photo above two), in a `width` × `height` box.
 */
export function rowsCollage(rows: number[], width = 600, height = 600, gap = 12): Cell[] {
  const rowHeight = (height - gap * (rows.length - 1)) / rows.length;
  return rows.flatMap((count, r) => {
    const cellWidth = (width - gap * (count - 1)) / count;
    return Array.from(
      { length: count },
      (_, c): Cell => [c * (cellWidth + gap), r * (rowHeight + gap), cellWidth, rowHeight],
    );
  });
}

/** Like `rowsCollage`, by columns: [2, 1] = two photos stacked beside a tall one. */
export function columnsCollage(columns: number[], width = 600, height = 600, gap = 12): Cell[] {
  return rowsCollage(columns, height, width, gap).map(([y, x, h, w]): Cell => [x, y, w, h]);
}

// ---------------------------------------------------------------------------
// Device mockups (generic designs, no brand)
// ---------------------------------------------------------------------------

const METAL_DARK = linear(90, '#1f2025', '#45474f', '#26272c', '#4a4c54', '#1f2025');
const METAL_LIGHT = linear(90, '#b9bcc4', '#eef0f3', '#c9ccd2', '#f4f5f7', '#b5b8c0');
const GLASS = '#0a0a0c';

export type PhoneCamera = 'island' | 'punch-hole' | 'notch' | 'none';

/** A phone, portrait: metal edge, black glass, the screen as a photo slot. */
export function phone(
  options: {
    camera?: PhoneCamera;
    light?: boolean;
    width?: number;
    height?: number;
    radius?: number;
    homeButton?: boolean;
  } = {},
): AnyNodeProps {
  const { camera = 'island', light = false, homeButton = false } = options;
  const width = options.width ?? 300;
  const height = options.height ?? 612;
  const radius = options.radius ?? 50;
  const bezel = homeButton ? 14 : 12;
  const top = homeButton ? 76 : bezel;
  const bottom = homeButton ? 76 : bezel;
  const screenRadius = homeButton ? 4 : Math.max(0, radius - bezel - 2);
  const button = light ? '#c2c5cc' : '#2a2b30';
  const children: AnyNodeProps[] = [
    // Side buttons, behind the body.
    piece({ x: 0, y: height * 0.2, width: 6, height: 34 }, button, { cornerRadius: 2, name: 'Button' }),
    piece({ x: 0, y: height * 0.27, width: 6, height: 56 }, button, { cornerRadius: 2, name: 'Volume up' }),
    piece({ x: 0, y: height * 0.37, width: 6, height: 56 }, button, { cornerRadius: 2, name: 'Volume down' }),
    piece({ x: width - 6, y: height * 0.3, width: 6, height: 86 }, button, {
      cornerRadius: 2,
      name: 'Power',
    }),
    piece({ x: 3, y: 0, width: width - 6, height }, light ? METAL_LIGHT : METAL_DARK, {
      cornerRadius: radius,
      shadow: DEEP_SHADOW,
      name: 'Body',
    }),
    piece({ x: 7, y: 4, width: width - 14, height: height - 8 }, light && homeButton ? '#f8f9fb' : GLASS, {
      cornerRadius: radius - 4,
      name: 'Glass',
    }),
    frame(
      'rect',
      { x: 3 + bezel, y: top, width: width - 6 - 2 * bezel, height: height - top - bottom },
      {
        cornerRadius: screenRadius,
      },
    ),
  ];
  const cx = width / 2;
  if (camera === 'island')
    children.push(
      piece({ x: cx - 46, y: top + 14, width: 92, height: 27 }, '#000000', {
        cornerRadius: 14,
        name: 'Camera',
      }),
    );
  else if (camera === 'punch-hole')
    children.push(
      piece({ x: cx - 9, y: top + 14, width: 18, height: 18 }, '#000000', {
        kind: 'ellipse',
        name: 'Camera',
      }),
    );
  else if (camera === 'notch')
    children.push(
      piece({ x: cx - 70, y: top - 1, width: 140, height: 30 }, GLASS, {
        path: 'M0 0H140C135 0 132 3 132 8V14C132 23 125 30 116 30H24C15 30 8 23 8 14V8C8 3 5 0 0 0Z',
        name: 'Notch',
      }),
    );
  if (homeButton) {
    const ink = light ? '#d6d8dd' : '#1c1d21';
    children.push(
      piece({ x: cx - 25, y: height - bottom / 2 - 25, width: 50, height: 50 }, ink, {
        kind: 'ellipse',
        name: 'Home button',
      }),
      piece({ x: cx - 30, y: top / 2 - 3, width: 60, height: 6 }, ink, { cornerRadius: 3, name: 'Speaker' }),
      piece({ x: cx - 52, y: top / 2 - 5, width: 10, height: 10 }, ink, { kind: 'ellipse', name: 'Camera' }),
    );
  }
  return group('Phone', width, height, children);
}

/** A laptop: lid with a thin bezel, metal base. */
export function laptop(options: { light?: boolean } = {}): AnyNodeProps {
  const light = options.light ?? true;
  return group('Laptop', 680, 420, [
    piece({ x: 60, y: 0, width: 560, height: 372 }, light ? '#2a2c31' : '#1b1c20', {
      cornerRadius: 20,
      name: 'Lid',
    }),
    piece({ x: 64, y: 4, width: 552, height: 364 }, GLASS, { cornerRadius: 17, name: 'Bezel' }),
    frame('rect', { x: 78, y: 20, width: 524, height: 334 }, { cornerRadius: 3 }),
    piece({ x: 334, y: 9, width: 6, height: 6 }, '#1f2937', { kind: 'ellipse', name: 'Camera' }),
    piece({ x: 0, y: 372, width: 680, height: 28 }, light ? METAL_LIGHT : METAL_DARK, {
      path: 'M0 0H680V16C680 22.6 674.6 28 668 28H12C5.4 28 0 22.6 0 16Z',
      shadow: DEEP_SHADOW,
      name: 'Base',
    }),
    piece({ x: 290, y: 372, width: 100, height: 9 }, light ? '#9ca3af' : '#3b3d44', {
      path: 'M0 0H100C97 0 95 1.5 94 4C93 6.5 91 9 88 9H12C9 9 7 6.5 6 4C5 1.5 3 0 0 0Z',
      name: 'Notch',
    }),
  ]);
}

/** A browser window with an address bar. */
export function browser(options: { dark?: boolean } = {}): AnyNodeProps {
  const dark = options.dark ?? false;
  const chrome = dark ? '#1f2128' : '#eef1f5';
  const bar = dark ? '#2c2f38' : '#ffffff';
  return group('Browser', 680, 460, [
    piece({ x: 0, y: 0, width: 680, height: 460 }, chrome, {
      cornerRadius: 14,
      shadow: DEEP_SHADOW,
      name: 'Window',
    }),
    piece({ x: 18, y: 18, width: 12, height: 12 }, '#ff5f57', { kind: 'ellipse', name: 'Close' }),
    piece({ x: 38, y: 18, width: 12, height: 12 }, '#febc2e', { kind: 'ellipse', name: 'Minimize' }),
    piece({ x: 58, y: 18, width: 12, height: 12 }, '#28c840', { kind: 'ellipse', name: 'Zoom' }),
    piece({ x: 150, y: 11, width: 380, height: 26 }, bar, { cornerRadius: 13, name: 'Address bar' }),
    piece({ x: 166, y: 21, width: 120, height: 6 }, dark ? '#4b4f5c' : '#d4d9e1', {
      cornerRadius: 3,
      name: 'Address',
    }),
    // The page area: square at the top, rounded like the window at the bottom.
    customFrame('M0 0H680V398C680 405.7 673.7 412 666 412H14C6.3 412 0 405.7 0 398Z', {
      x: 0,
      y: 48,
      width: 680,
      height: 412,
    }),
  ]);
}
