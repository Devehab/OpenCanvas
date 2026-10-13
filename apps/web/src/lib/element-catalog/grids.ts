/**
 * Grids: collages of photo slots, from two columns to mosaics, circles and
 * honeycombs.
 */
import { GRID_1_2, GRID_2X2, GRID_COLUMNS } from '../element-library';
import {
  type Cell,
  collage,
  columnsCollage,
  type ElementItem,
  type ElementSection,
  frame,
  group,
  item,
  rowsCollage,
} from './builders';
import { poly, polygon, regularPoints, svg } from './geometry';
import { placed } from './kit';

const grid = (id: string, en: string, ar: string, props: Parameters<typeof item>[3], keywords = '') =>
  item(`frame:grid-${id}`, en, ar, props, `collage grid ${keywords}`.trim());

const G = 12;

/** Cells of a layout given as fractions of a `width` × `height` box (gaps taken off each cell). */
function layout(cells: [number, number, number, number][], width = 600, height = 600, gap = G): Cell[] {
  return cells.map(([x, y, w, h]): Cell => {
    const left = x === 0 ? 0 : gap / 2;
    const right = x + w >= 1 - 1e-9 ? 0 : gap / 2;
    const top = y === 0 ? 0 : gap / 2;
    const bottom = y + h >= 1 - 1e-9 ? 0 : gap / 2;
    return [x * width + left, y * height + top, w * width - left - right, h * height - top - bottom];
  });
}

const third = 1 / 3;

/** A honeycomb of seven pointy-top hexagons. */
function honeycomb() {
  const w = 180;
  const h = (w * 2) / Math.sqrt(3);
  const gap = 10;
  const step = w + gap;
  const rowStep = h * 0.75 + gap * 0.87;
  const centres: [number, number][] = [
    [step / 2, 0],
    [step * 1.5, 0],
    [0, rowStep],
    [step, rowStep],
    [step * 2, rowStep],
    [step / 2, rowStep * 2],
    [step * 1.5, rowStep * 2],
  ];
  const hex = svg(polygon(regularPoints(6, 50)));
  return group(
    'Honeycomb',
    step * 2 + w,
    rowStep * 2 + h,
    centres.map(([x, y]) => frame('custom', { x, y, width: w, height: h }, { path: hex })),
  );
}

/** Photo slots cut by slanted lines. */
function slanted(pieces: number[][]) {
  return group(
    'Grid',
    600,
    400,
    pieces.map((points) => {
      const { path, ...box } = placed(poly(...points));
      return frame('custom', box, { path });
    }),
  );
}

const GRIDS: ElementItem[] = [
  GRID_COLUMNS,
  grid('2-rows', '2 rows', 'صفّان', collage(rowsCollage([1, 1]))),
  GRID_2X2,
  grid('3-columns', '3 columns', 'ثلاثة أعمدة', collage(rowsCollage([3]))),
  grid('3-rows', '3 rows', 'ثلاثة صفوف', collage(rowsCollage([1, 1, 1]))),
  grid('4-columns', '4 columns', 'أربعة أعمدة', collage(rowsCollage([4]))),
  GRID_1_2,
  grid('2-1', '2 small, 1 large', 'صغيرتان وكبيرة', collage(columnsCollage([2, 1]))),
  grid('1-top-2', '1 on top, 2 below', 'واحدة فوق واثنتان تحت', collage(rowsCollage([1, 2]))),
  grid('2-top-1', '2 on top, 1 below', 'اثنتان فوق وواحدة تحت', collage(rowsCollage([2, 1]))),
  grid('1-top-3', '1 on top, 3 below', 'واحدة فوق وثلاث تحت', collage(rowsCollage([1, 3]))),
  grid('3-top-1', '3 on top, 1 below', 'ثلاث فوق وواحدة تحت', collage(rowsCollage([3, 1]))),
  grid('1-3-columns', '1 large, 3 small', 'كبيرة وثلاث صغيرة', collage(columnsCollage([1, 3]))),
  grid('2-3', 'Mosaic (2 + 3)', 'فسيفساء ٢ + ٣', collage(rowsCollage([2, 3])), 'mosaic five'),
  grid('3-2', 'Mosaic (3 + 2)', 'فسيفساء ٣ + ٢', collage(rowsCollage([3, 2])), 'mosaic five'),
  grid('2-1-2', 'Tall centre', 'كبيرة في الوسط', collage(columnsCollage([2, 1, 2])), 'five centre'),
  grid(
    'magazine',
    'Magazine',
    'مجلة',
    collage(
      layout([
        [0, 0, 2 * third, 1],
        [2 * third, 0, third, third],
        [2 * third, third, third, third],
        [2 * third, 2 * third, third, third],
      ]),
    ),
    'editorial feature',
  ),
  grid(
    'feature',
    'Feature',
    'صورة رئيسية',
    collage(
      layout([
        [0, 0, 1, 2 * third],
        [0, 2 * third, third, third],
        [third, 2 * third, third, third],
        [2 * third, 2 * third, third, third],
      ]),
    ),
    'hero editorial',
  ),
  grid(
    'staggered',
    'Staggered',
    'متدرّجة',
    collage(
      layout([
        [0, 0, 0.5, 0.6],
        [0.5, 0, 0.5, 0.4],
        [0, 0.6, 0.5, 0.4],
        [0.5, 0.4, 0.5, 0.6],
      ]),
    ),
    'masonry pinterest',
  ),
  grid('2x3', '2 × 3 grid', 'شبكة ٢×٣', collage(rowsCollage([2, 2, 2])), 'six'),
  grid('3x2', '3 × 2 grid', 'شبكة ٣×٢', collage(rowsCollage([3, 3])), 'six'),
  grid('3x3', '3 × 3 grid', 'شبكة ٣×٣', collage(rowsCollage([3, 3, 3])), 'nine'),
  grid('4x4', '4 × 4 grid', 'شبكة ٤×٤', collage(rowsCollage([4, 4, 4, 4], 600, 600, 8)), 'sixteen'),
  grid(
    'panorama',
    'Panorama (3)',
    'بانوراما ثلاثية',
    collage(rowsCollage([3], 600, 260)),
    'wide landscape triptych',
  ),
  grid('landscape-2', 'Landscape (2)', 'أفقي ثنائي', collage(rowsCollage([2], 600, 360)), 'wide'),
  grid(
    'rounded-2x2',
    'Rounded 2 × 2',
    'شبكة ٢×٢ مستديرة',
    collage(rowsCollage([2, 2], 600, 600, 20), { cornerRadius: 28 }),
    'soft four',
  ),
  grid(
    'rounded-1-2',
    'Rounded 1 + 2',
    'كبيرة وصغيرتان مستديرة',
    collage(columnsCollage([1, 2], 600, 600, 20), { cornerRadius: 28 }),
    'soft',
  ),
  grid(
    'circles-2x2',
    'Circles (4)',
    'أربع دوائر',
    collage(rowsCollage([2, 2], 600, 600, 20), { kind: 'ellipse' }),
    'round',
  ),
  grid(
    'circles-3x3',
    'Circles (9)',
    'تسع دوائر',
    collage(rowsCollage([3, 3, 3], 600, 600, 16), { kind: 'ellipse' }),
    'round',
  ),
  grid(
    'arches-3',
    'Arches (3)',
    'ثلاثة أقواس',
    collage(rowsCollage([3], 600, 400, 16), { kind: 'arch' }),
    'arch',
  ),
  grid('honeycomb', 'Honeycomb', 'خلية نحل', honeycomb(), 'hexagon'),
  grid(
    'diagonal-2',
    'Diagonal split',
    'تقسيم مائل',
    slanted([
      [0, 0, 354, 0, 234, 400, 0, 400],
      [366, 0, 600, 0, 600, 400, 246, 400],
    ]),
    'slanted two',
  ),
  grid(
    'diagonal-3',
    'Diagonal strips',
    'ثلاثة أشرطة مائلة',
    slanted([
      [0, 0, 234, 0, 154, 400, 0, 400],
      [246, 0, 434, 0, 354, 400, 166, 400],
      [446, 0, 600, 0, 600, 400, 366, 400],
    ]),
    'slanted three',
  ),
];

export const GRID_SECTIONS: ElementSection[] = [
  { id: 'grids', title: { en: 'Grids', ar: 'شبكات الصور' }, items: GRIDS, columns: 3 },
];
