/**
 * The Elements panel catalog: shapes, lines and photo frames, grouped the way
 * people look for them. Every item is plain node props (composite frames are
 * groups with children), so whatever the panel inserts is fully editable.
 */
import type { AnyNodeProps, ArrowHead, Shadow, ShapeKind } from '@opencanvas/core';
import { normalizeArabic } from './icon-library/arabic';

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

const BRAND = '#7c6cf8';
const INK = '#111827';

type ShapeOptions = {
  cornerRadius?: number;
  sides?: number;
  innerRatio?: number;
  width?: number;
  height?: number;
};

function shape(kind: ShapeKind, options: ShapeOptions = {}): AnyNodeProps {
  return {
    type: 'shape',
    shape: kind,
    width: options.width ?? 200,
    height: options.height ?? 200,
    cornerRadius: options.cornerRadius ?? 0,
    sides: options.sides ?? (kind === 'scallop' ? 12 : kind === 'star' ? 5 : 6),
    innerRatio: options.innerRatio ?? (kind === 'ring' ? 0.6 : 0.5),
    fill: { type: 'solid', color: BRAND },
  } as AnyNodeProps;
}

const item = (id: string, en: string, ar: string, props: AnyNodeProps, keywords?: string): ElementItem => ({
  id,
  label: { en, ar },
  props,
  keywords,
});

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export const BASIC_SHAPES: ElementItem[] = [
  item('shape:square', 'Square', 'مربع', shape('rect'), 'rect rectangle box'),
  item(
    'shape:rounded-square',
    'Rounded square',
    'مربع بزوايا مستديرة',
    shape('rect', { cornerRadius: 36 }),
    'rect rounded',
  ),
  item('shape:circle', 'Circle', 'دائرة', shape('ellipse'), 'ellipse round oval'),
  item('shape:triangle', 'Triangle', 'مثلث', shape('triangle')),
  item('shape:right-triangle', 'Right triangle', 'مثلث قائم', shape('right-triangle')),
  item('shape:diamond', 'Diamond', 'معيّن', shape('diamond'), 'rhombus'),
  item('shape:half-circle', 'Half circle', 'نصف دائرة', shape('half-circle', { height: 100 }), 'semicircle'),
  item('shape:quarter-circle', 'Quarter circle', 'ربع دائرة', shape('quarter-circle')),
  item('shape:arch', 'Arch', 'قوس', shape('arch', { width: 160 }), 'window door'),
  item('shape:squircle', 'Squircle', 'مربع ناعم', shape('squircle'), 'app icon rounded'),
  item('shape:ring', 'Ring', 'حلقة', shape('ring'), 'donut circle outline'),
  item('shape:cross', 'Cross', 'علامة زائد', shape('cross'), 'plus add'),
  item('shape:heart', 'Heart', 'قلب', shape('heart', { height: 180 }), 'love'),
  item('shape:crescent', 'Crescent', 'هلال', shape('crescent'), 'moon ramadan'),
  item('shape:drop', 'Drop', 'قطرة', shape('drop', { width: 160 }), 'water tear'),
  item('shape:cloud', 'Cloud', 'سحابة', shape('cloud', { width: 240, height: 160 })),
  item('shape:blob', 'Blob', 'شكل عضوي', shape('blob'), 'organic'),
  item('shape:shield', 'Shield', 'درع', shape('shield', { width: 180 }), 'badge security'),
  item(
    'shape:parallelogram',
    'Parallelogram',
    'متوازي أضلاع',
    shape('parallelogram', { width: 260, height: 160 }),
  ),
  item('shape:trapezoid', 'Trapezoid', 'شبه منحرف', shape('trapezoid', { width: 240, height: 160 })),
];

export const POLYGONS: ElementItem[] = [3, 4, 5, 6, 7, 8, 9, 10, 12].map((sides) => {
  const names: Record<number, [string, string]> = {
    3: ['Triangle', 'مثلث'],
    4: ['Square (rotated)', 'مربع مائل'],
    5: ['Pentagon', 'مخمّس'],
    6: ['Hexagon', 'مسدّس'],
    7: ['Heptagon', 'مسبّع'],
    8: ['Octagon', 'مثمّن'],
    9: ['Nonagon', 'متساعي الأضلاع'],
    10: ['Decagon', 'معشّر'],
    12: ['Dodecagon', 'اثنا عشري الأضلاع'],
  };
  const [en, ar] = names[sides]!;
  return item(`shape:polygon-${sides}`, en, ar, shape('polygon', { sides }), 'polygon');
});

export const STARS_AND_BADGES: ElementItem[] = [
  item(
    'shape:star-4',
    '4-point star',
    'نجمة رباعية',
    shape('star', { sides: 4, innerRatio: 0.4 }),
    'sparkle',
  ),
  item('shape:star-5', '5-point star', 'نجمة خماسية', shape('star', { sides: 5, innerRatio: 0.45 })),
  item('shape:star-6', '6-point star', 'نجمة سداسية', shape('star', { sides: 6, innerRatio: 0.55 })),
  item('shape:star-8', '8-point star', 'نجمة ثمانية', shape('star', { sides: 8, innerRatio: 0.6 })),
  item('shape:burst-12', 'Burst', 'انفجار', shape('star', { sides: 12, innerRatio: 0.72 }), 'starburst sale'),
  item(
    'shape:burst-16',
    'Starburst',
    'نجمة متفجرة',
    shape('star', { sides: 16, innerRatio: 0.8 }),
    'sale badge',
  ),
  item('shape:seal-24', 'Seal', 'ختم', shape('star', { sides: 24, innerRatio: 0.88 }), 'badge stamp'),
  item('shape:scallop-8', 'Flower', 'زهرة', shape('scallop', { sides: 8 }), 'scallop'),
  item('shape:scallop-12', 'Scalloped circle', 'دائرة مموّجة', shape('scallop', { sides: 12 }), 'badge'),
  item('shape:scallop-20', 'Badge', 'شارة', shape('scallop', { sides: 20 }), 'seal stamp'),
];

export const ARROWS_AND_CALLOUTS: ElementItem[] = [
  item('shape:arrow-right', 'Arrow', 'سهم', shape('arrow-right', { width: 260, height: 160 })),
  item('shape:arrow-left', 'Arrow left', 'سهم لليسار', shape('arrow-left', { width: 260, height: 160 })),
  item('shape:double-arrow', 'Double arrow', 'سهم مزدوج', shape('double-arrow', { width: 280, height: 160 })),
  item('shape:chevron', 'Chevron', 'شيفرون', shape('chevron', { width: 240, height: 160 })),
  item('shape:banner', 'Banner', 'شريط لافتة', shape('banner', { width: 300, height: 110 }), 'ribbon'),
  item('shape:tag', 'Tag', 'وسم', shape('tag', { width: 260, height: 140 }), 'label price'),
  item(
    'shape:speech-bubble',
    'Speech bubble',
    'فقاعة كلام',
    shape('speech-bubble', { width: 240, height: 180 }),
  ),
  item(
    'shape:round-bubble',
    'Round bubble',
    'فقاعة مستديرة',
    shape('round-bubble', { width: 240, height: 200 }),
  ),
];

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function line(options: {
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

export const LINES: ElementItem[] = [
  item('line:solid', 'Line', 'خط', line({})),
  item('line:dashed', 'Dashed line', 'خط متقطع', line({ style: 'dashed' })),
  item('line:dotted', 'Dotted line', 'خط منقّط', line({ style: 'dotted' })),
  item('line:thick', 'Thick line', 'خط عريض', line({ width: 12 })),
  item('line:arrow', 'Arrow', 'سهم', line({ end: 'arrow' })),
  item('line:triangle-arrow', 'Arrow (filled head)', 'سهم برأس مصمت', line({ end: 'triangle' })),
  item('line:double-arrow', 'Double arrow', 'سهم مزدوج', line({ start: 'arrow', end: 'arrow' })),
  item('line:dashed-arrow', 'Dashed arrow', 'سهم متقطع', line({ style: 'dashed', end: 'triangle' })),
  item(
    'line:circle-ends',
    'Line with dots',
    'خط بنقطتين',
    line({ start: 'circle', end: 'circle' }),
    'connector',
  ),
  item('line:circle-arrow', 'Connector', 'موصّل', line({ start: 'circle', end: 'triangle' })),
  item('line:square-ends', 'Line with squares', 'خط بمربعين', line({ start: 'square', end: 'square' })),
  item('line:dimension', 'Dimension line', 'خط قياس', line({ start: 'bar', end: 'bar' }), 'measure'),
];

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

const PHOTO_SLOT = { role: 'image-slot', description: '', slot: null };

function frame(
  kind: ShapeKind,
  box: { x?: number; y?: number; width: number; height: number },
  extra: { cornerRadius?: number; rotation?: number } = {},
): AnyNodeProps {
  return {
    type: 'frame',
    shape: kind,
    x: box.x ?? 0,
    y: box.y ?? 0,
    width: box.width,
    height: box.height,
    cornerRadius: extra.cornerRadius ?? 0,
    rotation: extra.rotation ?? 0,
    fill: { type: 'solid', color: '#e5e7eb' },
    clipContent: true,
    semantic: PHOTO_SLOT,
  } as AnyNodeProps;
}

function rect(
  box: { x: number; y: number; width: number; height: number },
  color: string,
  extra: { cornerRadius?: number; shadow?: Shadow; kind?: ShapeKind; name?: string } = {},
): AnyNodeProps {
  return {
    type: 'shape',
    shape: extra.kind ?? 'rect',
    ...box,
    name: extra.name ?? '',
    cornerRadius: extra.cornerRadius ?? 0,
    fill: { type: 'solid', color },
    shadow: extra.shadow ?? null,
  } as AnyNodeProps;
}

function group(
  name: string,
  width: number,
  height: number,
  children: AnyNodeProps[],
  rotation = 0,
): AnyNodeProps {
  return { type: 'group', name, x: 0, y: 0, width, height, rotation, children } as AnyNodeProps;
}

const SOFT_SHADOW: Shadow = { color: '#0f172a2e', offsetX: 0, offsetY: 8, blur: 24 };

export const BASIC_FRAMES: ElementItem[] = (
  [
    ['rect', 'Square', 'مربع', {}],
    ['rect', 'Rounded', 'زوايا مستديرة', { cornerRadius: 40 }],
    ['ellipse', 'Circle', 'دائرة', {}],
    ['arch', 'Arch', 'قوس', {}],
    ['squircle', 'Squircle', 'مربع ناعم', {}],
    ['heart', 'Heart', 'قلب', {}],
    ['star', 'Star', 'نجمة', {}],
    ['scallop', 'Flower', 'زهرة', {}],
    ['blob', 'Blob', 'شكل عضوي', {}],
    ['drop', 'Drop', 'قطرة', {}],
    ['cloud', 'Cloud', 'سحابة', {}],
    ['hexagon', 'Hexagon', 'مسدّس', {}],
    ['pentagon', 'Pentagon', 'مخمّس', {}],
    ['diamond', 'Diamond', 'معيّن', {}],
    ['triangle', 'Triangle', 'مثلث', {}],
    ['shield', 'Shield', 'درع', {}],
    ['half-circle', 'Half circle', 'نصف دائرة', {}],
    ['crescent', 'Crescent', 'هلال', {}],
    ['speech-bubble', 'Speech bubble', 'فقاعة كلام', {}],
    ['round-bubble', 'Round bubble', 'فقاعة مستديرة', {}],
    ['cross', 'Cross', 'علامة زائد', {}],
    ['ring', 'Ring', 'حلقة', {}],
  ] as [ShapeKind, string, string, { cornerRadius?: number }][]
).map(([kind, en, ar, extra], i) => {
  const size =
    kind === 'half-circle'
      ? { width: 320, height: 160 }
      : kind === 'arch' || kind === 'drop'
        ? { width: 240, height: 300 }
        : kind === 'cloud'
          ? { width: 320, height: 220 }
          : { width: 300, height: 300 };
  return item(`frame:${kind}${i === 1 ? '-rounded' : ''}`, en, ar, frame(kind, size, extra), 'frame photo');
});

function polaroid(rotation: number): AnyNodeProps {
  return group(
    'Polaroid',
    300,
    360,
    [
      rect({ x: 0, y: 0, width: 300, height: 360 }, '#ffffff', { shadow: SOFT_SHADOW, name: 'Paper' }),
      frame('rect', { x: 18, y: 18, width: 264, height: 264 }),
    ],
    rotation,
  );
}

function filmStrip(count: number): AnyNodeProps {
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
        rect({ x: i * step + (step - 14) / 2, y, width: 14, height: 12 }, '#f8fafc', {
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
    rect({ x: 0, y: 0, width, height }, '#111111', { name: 'Film' }),
    ...holes,
    ...frames,
  ]);
}

export const PHOTO_FRAMES: ElementItem[] = [
  item('frame:polaroid', 'Polaroid', 'صورة فورية', polaroid(0), 'instant photo'),
  item('frame:polaroid-tilted', 'Polaroid (tilted)', 'صورة فورية مائلة', polaroid(-6), 'instant photo'),
  item(
    'frame:white-border',
    'Photo with border',
    'صورة بإطار أبيض',
    group('Bordered photo', 320, 240, [
      rect({ x: 0, y: 0, width: 320, height: 240 }, '#ffffff', { shadow: SOFT_SHADOW, name: 'Border' }),
      frame('rect', { x: 14, y: 14, width: 292, height: 212 }),
    ]),
  ),
  item(
    'frame:instant-square',
    'Instant square',
    'صورة فورية مربعة',
    group(
      'Instant photo',
      280,
      330,
      [
        rect({ x: 0, y: 0, width: 280, height: 330 }, '#fdfcf7', {
          shadow: SOFT_SHADOW,
          cornerRadius: 6,
          name: 'Paper',
        }),
        frame('rect', { x: 16, y: 16, width: 248, height: 248 }),
      ],
      4,
    ),
  ),
  item('frame:film-3', 'Film strip', 'شريط فيلم', filmStrip(3), 'film negative cinema'),
  item('frame:film-2', 'Film strip (2)', 'شريط فيلم مزدوج', filmStrip(2), 'film negative cinema'),
];

function grid(name: string, cells: [number, number, number, number][]): AnyNodeProps {
  const width = Math.max(...cells.map(([x, , w]) => x + w));
  const height = Math.max(...cells.map(([, y, , h]) => y + h));
  return group(
    name,
    width,
    height,
    cells.map(([x, y, w, h]) => frame('rect', { x, y, width: w, height: h })),
  );
}

const G = 12; // gap between collage cells
const H = (600 - G) / 2;
const T = (600 - 2 * G) / 3;

export const GRID_FRAMES: ElementItem[] = [
  item(
    'frame:grid-2-columns',
    '2 columns',
    'عمودان',
    grid('Grid', [
      [0, 0, H, 600],
      [H + G, 0, H, 600],
    ]),
    'collage grid',
  ),
  item(
    'frame:grid-2-rows',
    '2 rows',
    'صفّان',
    grid('Grid', [
      [0, 0, 600, H],
      [0, H + G, 600, H],
    ]),
    'collage grid',
  ),
  item(
    'frame:grid-2x2',
    '2 × 2 grid',
    'شبكة ٢×٢',
    grid('Grid', [
      [0, 0, H, H],
      [H + G, 0, H, H],
      [0, H + G, H, H],
      [H + G, H + G, H, H],
    ]),
    'collage grid four',
  ),
  item(
    'frame:grid-3-columns',
    '3 columns',
    'ثلاثة أعمدة',
    grid('Grid', [
      [0, 0, T, 600],
      [T + G, 0, T, 600],
      [2 * (T + G), 0, T, 600],
    ]),
    'collage grid',
  ),
  item(
    'frame:grid-1-2',
    '1 large, 2 small',
    'كبيرة وصغيرتان',
    grid('Grid', [
      [0, 0, H, 600],
      [H + G, 0, H, H],
      [H + G, H + G, H, H],
    ]),
    'collage grid',
  ),
  item(
    'frame:grid-3x3',
    '3 × 3 grid',
    'شبكة ٣×٣',
    grid(
      'Grid',
      [0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => [c * (T + G), r * (T + G), T, T] as [number, number, number, number]),
      ),
    ),
    'collage grid nine',
  ),
];

export const DEVICE_FRAMES: ElementItem[] = [
  item(
    'frame:phone',
    'Phone',
    'هاتف',
    group('Phone', 280, 570, [
      rect({ x: 0, y: 0, width: 280, height: 570 }, '#111827', {
        cornerRadius: 46,
        shadow: SOFT_SHADOW,
        name: 'Body',
      }),
      frame('rect', { x: 12, y: 12, width: 256, height: 546 }, { cornerRadius: 36 }),
      rect({ x: 100, y: 24, width: 80, height: 24 }, '#111827', { cornerRadius: 12, name: 'Camera' }),
    ]),
    'mobile iphone smartphone mockup',
  ),
  item(
    'frame:tablet',
    'Tablet',
    'جهاز لوحي',
    group('Tablet', 460, 620, [
      rect({ x: 0, y: 0, width: 460, height: 620 }, '#1f2937', {
        cornerRadius: 34,
        shadow: SOFT_SHADOW,
        name: 'Body',
      }),
      frame('rect', { x: 20, y: 20, width: 420, height: 580 }, { cornerRadius: 16 }),
    ]),
    'ipad mockup',
  ),
  item(
    'frame:laptop',
    'Laptop',
    'حاسوب محمول',
    group('Laptop', 640, 400, [
      rect({ x: 44, y: 0, width: 552, height: 364 }, '#1f2937', { cornerRadius: 18, name: 'Lid' }),
      frame('rect', { x: 58, y: 14, width: 524, height: 334 }, { cornerRadius: 4 }),
      rect({ x: 0, y: 364, width: 640, height: 26 }, '#cbd5e1', {
        cornerRadius: 13,
        shadow: SOFT_SHADOW,
        name: 'Base',
      }),
      rect({ x: 270, y: 364, width: 100, height: 9 }, '#94a3b8', { cornerRadius: 4, name: 'Notch' }),
    ]),
    'computer macbook mockup',
  ),
  item(
    'frame:monitor',
    'Monitor',
    'شاشة',
    group('Monitor', 600, 470, [
      rect({ x: 0, y: 0, width: 600, height: 360 }, '#111827', {
        cornerRadius: 16,
        shadow: SOFT_SHADOW,
        name: 'Bezel',
      }),
      frame('rect', { x: 14, y: 14, width: 572, height: 332 }, { cornerRadius: 4 }),
      rect({ x: 268, y: 360, width: 64, height: 86 }, '#9ca3af', { name: 'Stand' }),
      rect({ x: 190, y: 446, width: 220, height: 20 }, '#6b7280', { cornerRadius: 10, name: 'Foot' }),
    ]),
    'desktop computer screen mockup',
  ),
  item(
    'frame:browser',
    'Browser window',
    'نافذة متصفح',
    group('Browser', 640, 420, [
      rect({ x: 0, y: 0, width: 640, height: 420 }, '#f1f5f9', {
        cornerRadius: 14,
        shadow: SOFT_SHADOW,
        name: 'Window',
      }),
      rect({ x: 16, y: 15, width: 12, height: 12 }, '#ef4444', { kind: 'ellipse', name: 'Close' }),
      rect({ x: 34, y: 15, width: 12, height: 12 }, '#f59e0b', { kind: 'ellipse', name: 'Minimize' }),
      rect({ x: 52, y: 15, width: 12, height: 12 }, '#22c55e', { kind: 'ellipse', name: 'Zoom' }),
      rect({ x: 84, y: 10, width: 360, height: 22 }, '#ffffff', { cornerRadius: 11, name: 'Address bar' }),
      frame('rect', { x: 8, y: 42, width: 624, height: 370 }, { cornerRadius: 8 }),
    ]),
    'website web mockup',
  ),
  item(
    'frame:watch',
    'Watch',
    'ساعة ذكية',
    group('Watch', 200, 300, [
      rect({ x: 50, y: 0, width: 100, height: 60 }, '#334155', { cornerRadius: 10, name: 'Strap' }),
      rect({ x: 50, y: 240, width: 100, height: 60 }, '#334155', { cornerRadius: 10, name: 'Strap' }),
      rect({ x: 0, y: 40, width: 200, height: 220 }, '#111827', {
        cornerRadius: 50,
        shadow: SOFT_SHADOW,
        name: 'Case',
      }),
      frame('rect', { x: 14, y: 54, width: 172, height: 192 }, { cornerRadius: 38 }),
    ]),
    'smartwatch mockup',
  ),
];

export const SHAPE_SECTIONS: ElementSection[] = [
  { id: 'lines', title: { en: 'Lines', ar: 'الخطوط' }, items: LINES, columns: 2 },
  { id: 'basic-shapes', title: { en: 'Basic shapes', ar: 'أشكال أساسية' }, items: BASIC_SHAPES, columns: 4 },
  { id: 'polygons', title: { en: 'Polygons', ar: 'مضلّعات' }, items: POLYGONS, columns: 4 },
  { id: 'stars', title: { en: 'Stars and badges', ar: 'نجوم وشارات' }, items: STARS_AND_BADGES, columns: 4 },
  {
    id: 'arrows',
    title: { en: 'Arrows and callouts', ar: 'أسهم وفقاعات' },
    items: ARROWS_AND_CALLOUTS,
    columns: 4,
  },
];

export const FRAME_SECTIONS: ElementSection[] = [
  { id: 'frames-basic', title: { en: 'Basic shapes', ar: 'أشكال أساسية' }, items: BASIC_FRAMES, columns: 4 },
  { id: 'frames-photo', title: { en: 'Film and photo', ar: 'أفلام وصور' }, items: PHOTO_FRAMES, columns: 3 },
  { id: 'frames-grids', title: { en: 'Grids', ar: 'شبكات الصور' }, items: GRID_FRAMES, columns: 3 },
  { id: 'frames-devices', title: { en: 'Devices', ar: 'أجهزة' }, items: DEVICE_FRAMES, columns: 3 },
];

export const ALL_ELEMENTS: ElementItem[] = [...SHAPE_SECTIONS, ...FRAME_SECTIONS].flatMap((s) => s.items);

/** Matches an element against a search query in either language. */
export function elementMatches(element: ElementItem, query: string): boolean {
  const q = normalizeArabic(query.trim());
  if (!q) return true;
  const haystack = normalizeArabic(
    `${element.label.en} ${element.label.ar} ${element.keywords ?? ''} ${element.id.replace(/[:-]/g, ' ')}`,
  );
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
