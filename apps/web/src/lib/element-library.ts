/**
 * The Elements panel catalog: lines, shapes, frames, photo frames, collages
 * and device mockups, grouped the way people look for them. Every item is
 * plain node props (composite frames are groups with children), so whatever
 * the panel inserts is fully editable.
 *
 * This module holds only what the panel shows first (a few items of each
 * group). The whole catalog, several hundred items, is a separate chunk that
 * `loadElementCatalog` loads when it is needed (or ahead of time, when the
 * browser is idle).
 */
import {
  browser,
  collage,
  type ElementItem,
  type ElementSection,
  filmStrip,
  frame,
  item,
  type Label,
  laptop,
  line,
  phone,
  polaroid,
  rowsCollage,
  shape,
} from './element-catalog/builders';
import { normalizeArabic } from './icon-library/arabic';

export type { ElementItem, ElementSection, Label };

// ---------------------------------------------------------------------------
// Shown first
// ---------------------------------------------------------------------------

export const LINE_SOLID = item('line:solid', 'Line', 'خط', line({}));
export const LINE_DASHED = item('line:dashed', 'Dashed line', 'خط متقطع', line({ style: 'dashed' }));
export const LINE_ARROW = item('line:arrow', 'Arrow', 'سهم', line({ end: 'arrow' }));
export const LINE_DOUBLE_ARROW = item(
  'line:double-arrow',
  'Double arrow',
  'سهم مزدوج',
  line({ start: 'arrow', end: 'arrow' }),
);

export const SHAPE_SQUARE = item('shape:square', 'Square', 'مربع', shape('rect'), 'rect rectangle box');
export const SHAPE_CIRCLE = item('shape:circle', 'Circle', 'دائرة', shape('ellipse'), 'ellipse round oval');
export const SHAPE_TRIANGLE = item('shape:triangle', 'Triangle', 'مثلث', shape('triangle'));
export const SHAPE_STAR = item(
  'shape:star-5',
  '5-point star',
  'نجمة خماسية',
  shape('star', { sides: 5, innerRatio: 0.45 }),
);
export const SHAPE_HEART = item('shape:heart', 'Heart', 'قلب', shape('heart', { height: 180 }), 'love');
export const SHAPE_ARROW = item(
  'shape:arrow-right',
  'Arrow',
  'سهم',
  shape('arrow-right', { width: 260, height: 160 }),
);
export const SHAPE_BUBBLE = item(
  'shape:speech-bubble',
  'Speech bubble',
  'فقاعة كلام',
  shape('speech-bubble', { width: 240, height: 180 }),
);
export const SHAPE_HEXAGON = item(
  'shape:polygon-6',
  'Hexagon',
  'مسدّس',
  shape('polygon', { sides: 6 }),
  'polygon',
);

const SQUARE_FRAME = { width: 300, height: 300 };
export const FRAME_ELLIPSE = item(
  'frame:ellipse',
  'Circle',
  'دائرة',
  frame('ellipse', SQUARE_FRAME),
  'frame photo',
);
export const FRAME_ROUNDED = item(
  'frame:rect-rounded',
  'Rounded',
  'زوايا مستديرة',
  frame('rect', SQUARE_FRAME, { cornerRadius: 40 }),
  'frame photo',
);
export const FRAME_ARCH = item(
  'frame:arch',
  'Arch',
  'قوس',
  frame('arch', { width: 240, height: 300 }),
  'frame photo',
);
export const FRAME_HEART = item('frame:heart', 'Heart', 'قلب', frame('heart', SQUARE_FRAME), 'frame photo');
export const FRAME_STAR = item('frame:star', 'Star', 'نجمة', frame('star', SQUARE_FRAME), 'frame photo');
export const FRAME_FLOWER = item(
  'frame:scallop',
  'Flower',
  'زهرة',
  frame('scallop', SQUARE_FRAME),
  'frame photo',
);
export const FRAME_CLOUD = item(
  'frame:cloud',
  'Cloud',
  'سحابة',
  frame('cloud', { width: 320, height: 220 }),
  'frame photo',
);
export const FRAME_BLOB = item('frame:blob', 'Blob', 'شكل عضوي', frame('blob', SQUARE_FRAME), 'frame photo');

export const FRAME_POLAROID = item('frame:polaroid', 'Polaroid', 'صورة فورية', polaroid(0), 'instant photo');
export const FRAME_POLAROID_TILTED = item(
  'frame:polaroid-tilted',
  'Polaroid (tilted)',
  'صورة فورية مائلة',
  polaroid(-6),
  'instant photo',
);
export const FRAME_FILM = item(
  'frame:film-3',
  'Film strip',
  'شريط فيلم',
  filmStrip(3),
  'film negative cinema',
);

export const GRID_COLUMNS = item(
  'frame:grid-2-columns',
  '2 columns',
  'عمودان',
  collage(rowsCollage([2])),
  'collage grid',
);
export const GRID_2X2 = item(
  'frame:grid-2x2',
  '2 × 2 grid',
  'شبكة ٢×٢',
  collage(rowsCollage([2, 2])),
  'collage grid four',
);
export const GRID_1_2 = item(
  'frame:grid-1-2',
  '1 large, 2 small',
  'كبيرة وصغيرتان',
  collage([
    [0, 0, 294, 600],
    [306, 0, 294, 294],
    [306, 306, 294, 294],
  ]),
  'collage grid',
);

export const MOCKUP_PHONE = item(
  'frame:phone',
  'Phone',
  'هاتف',
  phone(),
  'mobile smartphone mockup screen device',
);
export const MOCKUP_LAPTOP = item(
  'frame:laptop',
  'Laptop',
  'حاسوب محمول',
  laptop(),
  'computer notebook mockup screen device',
);
export const MOCKUP_BROWSER = item(
  'frame:browser',
  'Browser window',
  'نافذة متصفح',
  browser(),
  'website web mockup screen',
);

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export type ElementGroupId = 'lines' | 'shapes' | 'frames' | 'photo-frames' | 'grids' | 'mockups';

export interface ElementGroup {
  id: ElementGroupId;
  title: Label;
  /** Shown on the panel's first page. */
  featured: ElementItem[];
  columns: 2 | 3 | 4;
}

export const ELEMENT_GROUPS: ElementGroup[] = [
  {
    id: 'lines',
    title: { en: 'Lines and arrows', ar: 'خطوط وأسهم' },
    featured: [LINE_SOLID, LINE_DASHED, LINE_ARROW, LINE_DOUBLE_ARROW],
    columns: 2,
  },
  {
    id: 'shapes',
    title: { en: 'Shapes', ar: 'أشكال' },
    featured: [
      SHAPE_SQUARE,
      SHAPE_CIRCLE,
      SHAPE_TRIANGLE,
      SHAPE_STAR,
      SHAPE_HEART,
      SHAPE_ARROW,
      SHAPE_BUBBLE,
      SHAPE_HEXAGON,
    ],
    columns: 4,
  },
  {
    id: 'frames',
    title: { en: 'Frames', ar: 'إطارات' },
    featured: [
      FRAME_ELLIPSE,
      FRAME_ROUNDED,
      FRAME_ARCH,
      FRAME_HEART,
      FRAME_STAR,
      FRAME_FLOWER,
      FRAME_CLOUD,
      FRAME_BLOB,
    ],
    columns: 4,
  },
  {
    id: 'photo-frames',
    title: { en: 'Photo frames', ar: 'إطارات صور' },
    featured: [FRAME_POLAROID, FRAME_POLAROID_TILTED, FRAME_FILM],
    columns: 3,
  },
  {
    id: 'grids',
    title: { en: 'Grids', ar: 'شبكات الصور' },
    featured: [GRID_COLUMNS, GRID_2X2, GRID_1_2],
    columns: 3,
  },
  {
    id: 'mockups',
    title: { en: 'Mockups', ar: 'نماذج أجهزة' },
    featured: [MOCKUP_PHONE, MOCKUP_LAPTOP, MOCKUP_BROWSER],
    columns: 3,
  },
];

// ---------------------------------------------------------------------------
// The whole catalog
// ---------------------------------------------------------------------------

export interface ElementCatalog {
  /** Each group's sections, in order. */
  sections: Record<ElementGroupId, ElementSection[]>;
  all: ElementItem[];
}

let catalog: Promise<ElementCatalog> | null = null;

/** Loads the whole catalog (once). */
export function loadElementCatalog(): Promise<ElementCatalog> {
  catalog ??= import('./element-catalog').then((m) => m.CATALOG);
  // A failed load (offline) can be tried again.
  catalog.catch(() => {
    catalog = null;
  });
  return catalog;
}

/** Whether an element is one of the frames (photo slots) rather than a shape or a line. */
export const isFrameElement = (element: ElementItem) => element.id.startsWith('frame:');

/**
 * Elements matching a query, best first: an exact name, then a whole word of
 * the name or keywords (so "A" finds the letter A before every name with an
 * "a" in it), then a name that starts with the query, then the rest.
 */
export function searchElements(elements: readonly ElementItem[], query: string): ElementItem[] {
  const q = normalizeArabic(query.trim());
  if (!q) return [...elements];
  const score = (e: ElementItem) => {
    const names = [e.label.en, e.label.ar].map(normalizeArabic);
    if (names.includes(q)) return 0;
    const words = normalizeArabic(`${e.label.en} ${e.label.ar} ${e.keywords ?? ''}`).split(/\s+/);
    if (words.includes(q)) return 1;
    return names.some((n) => n.startsWith(q)) ? 2 : 3;
  };
  return elements
    .filter((e) => elementMatches(e, query))
    .map((e, i) => ({ e, i, s: score(e) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map(({ e }) => e);
}

/** Matches an element against a search query in either language. */
export function elementMatches(element: ElementItem, query: string): boolean {
  const q = normalizeArabic(query.trim());
  if (!q) return true;
  const haystack = normalizeArabic(
    `${element.label.en} ${element.label.ar} ${element.keywords ?? ''} ${element.id.replace(/[:-]/g, ' ')}`,
  );
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
