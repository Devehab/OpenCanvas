/**
 * Shapes: basic shapes, polygons, stars and badges, arrows, speech bubbles,
 * banners, flowchart symbols, signs, soft shapes, organic shapes and 3D
 * solids. Most are outlines drawn here (`custom` shapes), so they stay crisp
 * at any size and take any fill, stroke and effect.
 */
import type { AnyNodeProps, Vec } from '@opencanvas/core';
import {
  SHAPE_ARROW,
  SHAPE_BUBBLE,
  SHAPE_CIRCLE,
  SHAPE_HEART,
  SHAPE_HEXAGON,
  SHAPE_SQUARE,
  SHAPE_STAR,
  SHAPE_TRIANGLE,
} from '../element-library';
import {
  BRAND,
  type ElementItem,
  type ElementSection,
  group,
  item,
  linear,
  piece,
  radial,
  shape,
} from './builders';
import {
  arcBand,
  circle,
  cut,
  ellipse,
  hole,
  onCircle,
  type Path,
  polar,
  poly,
  polygon,
  pt,
  random,
  rect,
  regularPoints,
  rotate,
  smooth,
  solid,
  starPoints,
  svg,
  translate,
} from './geometry';
import { parse, placed, outlineShape as S } from './kit';

// ---------------------------------------------------------------------------
// Basic shapes
// ---------------------------------------------------------------------------

const BASIC: ElementItem[] = [
  SHAPE_SQUARE,
  item(
    'shape:rounded-square',
    'Rounded square',
    'مربع بزوايا مستديرة',
    shape('rect', { cornerRadius: 36 }),
    'rect rounded',
  ),
  item(
    'shape:rounded-rectangle',
    'Rounded rectangle',
    'مستطيل بزوايا مستديرة',
    shape('rect', { width: 300, height: 190, cornerRadius: 28 }),
    'rect card button',
  ),
  item(
    'shape:pill',
    'Pill',
    'كبسولة',
    shape('rect', { width: 300, height: 120, cornerRadius: 60 }),
    'capsule button stadium',
  ),
  SHAPE_CIRCLE,
  item('shape:oval', 'Oval', 'شكل بيضاوي', shape('ellipse', { width: 260, height: 170 }), 'ellipse'),
  SHAPE_TRIANGLE,
  item('shape:right-triangle', 'Right triangle', 'مثلث قائم', shape('right-triangle')),
  item('shape:diamond', 'Diamond', 'معيّن', shape('diamond'), 'rhombus'),
  item('shape:half-circle', 'Half circle', 'نصف دائرة', shape('half-circle', { height: 100 }), 'semicircle'),
  item('shape:quarter-circle', 'Quarter circle', 'ربع دائرة', shape('quarter-circle')),
  S('pie', 'Pie', 'دائرة ناقصة ربعًا', 'M50 50V0A50 50 0 1 0 100 50Z', { keywords: 'pacman chart' }),
  item('shape:arch', 'Arch', 'قوس', shape('arch', { width: 160 }), 'window door'),
  S('block-arc', 'Rainbow arc', 'قوس قزح', 'M0 50A50 50 0 0 1 100 50H76A26 26 0 0 0 24 50Z', {
    keywords: 'arc rainbow half ring',
  }),
  S('bridge', 'Bridge', 'جسر', 'M0 0H100V100H82A32 32 0 0 0 18 100H0Z', { keywords: 'arch cutout' }),
  item('shape:squircle', 'Squircle', 'مربع ناعم', shape('squircle'), 'app icon rounded'),
  item('shape:ring', 'Ring', 'حلقة', shape('ring'), 'donut circle outline'),
  item(
    'shape:ring-thin',
    'Thin ring',
    'حلقة رفيعة',
    shape('ring', { innerRatio: 0.84 }),
    'circle outline border',
  ),
  S('square-outline', 'Square outline', 'مربع مفرغ', cut(rect(0, 0, 100, 100), rect(15, 15, 70, 70)), {
    keywords: 'border frame hollow',
  }),
  S(
    'snip-corners',
    'Cut corners',
    'زوايا مقصوصة',
    poly(16, 0, 84, 0, 100, 16, 100, 84, 84, 100, 16, 100, 0, 84, 0, 16),
    {
      width: 240,
      height: 180,
      keywords: 'octagon rectangle',
    },
  ),
  S('snip-corner', 'One cut corner', 'زاوية مقصوصة', poly(0, 0, 76, 0, 100, 24, 100, 100, 0, 100), {
    keywords: 'note paper',
  }),
  S(
    'snip-diagonal',
    'Cut diagonal corners',
    'زاويتان مقصوصتان',
    poly(24, 0, 100, 0, 100, 76, 76, 100, 0, 100, 0, 24),
  ),
  S(
    'plaque',
    'Plaque',
    'لوحة',
    'M15 0H85A15 15 0 0 0 100 15V85A15 15 0 0 0 85 100H15A15 15 0 0 0 0 85V15A15 15 0 0 0 15 0Z',
    { width: 260, height: 180, keywords: 'label inverted corners' },
  ),
  S('tab', 'Tab', 'لسان', 'M0 100V28A28 28 0 0 1 28 0H72A28 28 0 0 1 100 28V100Z', {
    keywords: 'rounded top',
  }),
  S('leaf-corners', 'Leaf', 'ورقة', 'M50 0H100V50A50 50 0 0 1 50 100H0V50A50 50 0 0 1 50 0Z', {
    keywords: 'rounded opposite corners',
  }),
  S('fan', 'Fan', 'مروحة', 'M0 0H50A50 50 0 0 1 100 50V100H0Z', { keywords: 'one rounded corner' }),
  S('teardrop', 'Teardrop', 'دمعة', 'M50 0H100V50A50 50 0 1 1 50 0Z', { keywords: 'one sharp corner' }),
  S('lens', 'Lens', 'عدسة', 'M0 50A62 62 0 0 1 100 50A62 62 0 0 1 0 50Z', {
    width: 240,
    height: 140,
    keywords: 'eye vesica',
  }),
  S('egg', 'Egg', 'بيضة', 'M50 0C78 0 96 38 96 62C96 86 76 100 50 100C24 100 4 86 4 62C4 38 22 0 50 0Z', {
    keywords: 'oval easter',
  }),
  S('l-shape', 'L shape', 'شكل L', poly(0, 0, 42, 0, 42, 58, 100, 58, 100, 100, 0, 100), {
    keywords: 'corner',
  }),
  S('slanted', 'Slanted square', 'مربع مائل', poly(18, 0, 100, 0, 82, 100, 0, 100), {
    cornerRadius: 16,
    keywords: 'parallelogram rounded',
  }),
  item(
    'shape:parallelogram',
    'Parallelogram',
    'متوازي أضلاع',
    shape('parallelogram', { width: 260, height: 160 }),
  ),
  item('shape:trapezoid', 'Trapezoid', 'شبه منحرف', shape('trapezoid', { width: 240, height: 160 })),
  SHAPE_HEART,
  item('shape:crescent', 'Crescent', 'هلال', shape('crescent'), 'moon ramadan'),
  item('shape:drop', 'Drop', 'قطرة', shape('drop', { width: 160 }), 'water tear'),
  item('shape:cloud', 'Cloud', 'سحابة', shape('cloud', { width: 240, height: 160 })),
  item('shape:shield', 'Shield', 'درع', shape('shield', { width: 180 }), 'badge security'),
  item('shape:blob', 'Blob', 'شكل عضوي', shape('blob'), 'organic'),
];

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------

const POLYGON_NAMES: Record<number, [string, string]> = {
  3: ['Triangle (polygon)', 'مثلث متساوي الأضلاع'],
  4: ['Square (rotated)', 'مربع مائل'],
  5: ['Pentagon', 'مخمّس'],
  6: ['Hexagon', 'مسدّس'],
  7: ['Heptagon', 'مسبّع'],
  8: ['Octagon', 'مثمّن'],
  9: ['Nonagon', 'متساعي الأضلاع'],
  10: ['Decagon', 'معشّر'],
  12: ['Dodecagon', 'اثنا عشري الأضلاع'],
};

const POLYGONS: ElementItem[] = [
  ...[3, 4, 5, 6, 7, 8, 9, 10, 12].map((sides) => {
    if (sides === 6) return SHAPE_HEXAGON;
    const [en, ar] = POLYGON_NAMES[sides]!;
    return item(`shape:polygon-${sides}`, en, ar, shape('polygon', { sides }), 'polygon');
  }),
  S('hexagon-tall', 'Hexagon (pointy top)', 'مسدّس رأسي', polygon(regularPoints(6, 50)), {
    keywords: 'polygon honeycomb',
  }),
  item(
    'shape:rounded-triangle',
    'Rounded triangle',
    'مثلث مستدير',
    shape('triangle', { cornerRadius: 22 }),
    'soft',
  ),
  item(
    'shape:rounded-diamond',
    'Rounded diamond',
    'معيّن مستدير',
    shape('diamond', { cornerRadius: 18 }),
    'soft rhombus',
  ),
  item(
    'shape:rounded-pentagon',
    'Rounded pentagon',
    'مخمّس مستدير',
    shape('polygon', { sides: 5, cornerRadius: 22 }),
    'soft polygon',
  ),
  item(
    'shape:rounded-hexagon',
    'Rounded hexagon',
    'مسدّس مستدير',
    shape('polygon', { sides: 6, cornerRadius: 22 }),
    'soft polygon',
  ),
  item(
    'shape:rounded-octagon',
    'Rounded octagon',
    'مثمّن مستدير',
    shape('polygon', { sides: 8, cornerRadius: 16 }),
    'soft polygon',
  ),
];

// ---------------------------------------------------------------------------
// Stars and badges
// ---------------------------------------------------------------------------

/** A burst with irregular points, the same on every load. */
function explosion(seed: number, points: number, inner: [number, number], outer: [number, number]): Path {
  const rnd = random(seed);
  const corners = [];
  for (let i = 0; i < points * 2; i++) {
    const [lo, hi] = i % 2 === 0 ? outer : inner;
    const angle = (i * 180) / points + (rnd() - 0.5) * (120 / points);
    corners.push(onCircle(50, 50, lo + rnd() * (hi - lo), angle));
  }
  return polygon(corners);
}

/** Four (or eight) points joined by inward curves: a sparkle. */
function sparkle(long: number[], pinch: number): Path {
  const n = long.length;
  const tips = long.map((r, i) => onCircle(50, 50, r, (i * 360) / n));
  const out: Path = [['M', tips[0]!.x, tips[0]!.y]];
  for (let i = 0; i < n; i++) {
    const next = tips[(i + 1) % n]!;
    const control = onCircle(50, 50, pinch, ((i + 0.5) * 360) / n);
    out.push(['Q', control.x, control.y, next.x, next.y]);
  }
  out.push(['Z']);
  return out;
}

/** A medal: scalloped disc with two ribbon tails. */
function rosette(): Path {
  const bumps = Array.from({ length: 20 }, (_, i) => {
    const c = onCircle(50, 40, 34, i * 18);
    return circle(c.x, c.y, 7);
  });
  return solid(
    poly(31, 60, 47, 66, 38, 100, 31, 92, 21, 96),
    poly(69, 60, 53, 66, 62, 100, 69, 92, 79, 96),
    circle(50, 40, 35),
    ...bumps,
  );
}

const STARS: ElementItem[] = [
  item(
    'shape:star-4',
    '4-point star',
    'نجمة رباعية',
    shape('star', { sides: 4, innerRatio: 0.4 }),
    'sparkle',
  ),
  SHAPE_STAR,
  item('shape:star-6', '6-point star', 'نجمة سداسية', shape('star', { sides: 6, innerRatio: 0.55 })),
  item('shape:star-7', '7-point star', 'نجمة سباعية', shape('star', { sides: 7, innerRatio: 0.5 })),
  item('shape:star-8', '8-point star', 'نجمة ثمانية', shape('star', { sides: 8, innerRatio: 0.6 })),
  item(
    'shape:octagram',
    'Eight-point star (two squares)',
    'نجمة ثمانية من مربعين',
    shape('star', { sides: 8, innerRatio: 0.765 }),
    'islamic rub el hizb ramadan octagram',
  ),
  item(
    'shape:rounded-star',
    'Rounded star',
    'نجمة مستديرة',
    shape('star', { sides: 5, innerRatio: 0.5, cornerRadius: 14 }),
    'soft',
  ),
  item(
    'shape:rounded-star-4',
    'Rounded 4-point star',
    'نجمة رباعية مستديرة',
    shape('star', { sides: 4, innerRatio: 0.45, cornerRadius: 10 }),
    'soft sparkle',
  ),
  S('sparkle', 'Sparkle', 'لمعة', sparkle([50, 50, 50, 50], 6), { keywords: 'twinkle shine star' }),
  S(
    'sparkle-soft',
    'Soft sparkle',
    'لمعة ناعمة',
    'M50 0C53 35 65 47 100 50C65 53 53 65 50 100C47 65 35 53 0 50C35 47 47 35 50 0Z',
    {
      keywords: 'twinkle shine star',
    },
  ),
  S('sparkle-8', 'Eight-point sparkle', 'لمعة ثمانية', sparkle([50, 28, 50, 28, 50, 28, 50, 28], 7), {
    keywords: 'twinkle shine star compass',
  }),
  item(
    'shape:soft-burst',
    'Soft burst',
    'انفجار ناعم',
    shape('star', { sides: 12, innerRatio: 0.8, cornerRadius: 8 }),
    'badge sale sticker',
  ),
  item('shape:burst-12', 'Burst', 'انفجار', shape('star', { sides: 12, innerRatio: 0.72 }), 'starburst sale'),
  item(
    'shape:burst-16',
    'Starburst',
    'نجمة متفجرة',
    shape('star', { sides: 16, innerRatio: 0.8 }),
    'sale badge',
  ),
  item('shape:sunburst', 'Sunburst', 'أشعة', shape('star', { sides: 24, innerRatio: 0.62 }), 'rays sun'),
  item('shape:seal-24', 'Seal', 'ختم', shape('star', { sides: 24, innerRatio: 0.88 }), 'badge stamp'),
  S('explosion', 'Explosion', 'انفجار غير منتظم', explosion(7, 11, [26, 36], [42, 50]), {
    width: 240,
    height: 200,
    keywords: 'boom comic burst',
  }),
  S('explosion-2', 'Comic burst', 'انفجار كرتوني', explosion(19, 14, [30, 38], [44, 50]), {
    width: 240,
    height: 200,
    keywords: 'boom pow comic',
  }),
  item('shape:scallop-8', 'Flower', 'زهرة', shape('scallop', { sides: 8 }), 'scallop'),
  item('shape:scallop-12', 'Scalloped circle', 'دائرة مموّجة', shape('scallop', { sides: 12 }), 'badge'),
  item('shape:scallop-20', 'Badge', 'شارة', shape('scallop', { sides: 20 }), 'seal stamp'),
  S('rosette', 'Award ribbon', 'وسام', rosette(), { keywords: 'medal prize winner badge rosette' }),
];

// ---------------------------------------------------------------------------
// Arrows
// ---------------------------------------------------------------------------

// The built-in right arrow's corners (260 × 160), turned to point other ways.
const RIGHT = [0, 44.8, 143, 44.8, 143, 0, 260, 80, 143, 160, 143, 115.2, 0, 115.2];
const turn = (coords: number[], f: (x: number, y: number) => [number, number]) => {
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 2) out.push(...f(coords[i]!, coords[i + 1]!));
  return out;
};
const DOUBLE = [0, 80, 78, 0, 78, 44.8, 202, 44.8, 202, 0, 280, 80, 202, 160, 202, 115.2, 78, 115.2, 78, 160];

/** An arrow along an arc: a band and a head at its end (angles: 0 = up, clockwise). */
function arcArrow(cx: number, cy: number, outer: number, inner: number, from: number, to: number): Path {
  const mid = (outer + inner) / 2;
  const half = (outer - inner) / 2;
  const sweep = Math.sign(to - from);
  const headLength = (half * 2.3 * 180) / (Math.PI * mid);
  const end = to - sweep * headLength;
  const tip = onCircle(cx, cy, mid, to);
  const a = onCircle(cx, cy, outer + half * 0.9, end);
  const b = onCircle(cx, cy, inner - half * 0.9, end);
  return solid(arcBand(cx, cy, outer, inner, Math.min(from, end), Math.max(from, end)), polygon([a, tip, b]));
}

const ARROWS: ElementItem[] = [
  SHAPE_ARROW,
  item('shape:arrow-left', 'Arrow left', 'سهم لليسار', shape('arrow-left', { width: 260, height: 160 })),
  S('arrow-up', 'Arrow up', 'سهم للأعلى', poly(...turn(RIGHT, (x, y) => [y, 260 - x])), {
    width: 160,
    height: 260,
  }),
  S('arrow-down', 'Arrow down', 'سهم للأسفل', poly(...turn(RIGHT, (x, y) => [160 - y, x])), {
    width: 160,
    height: 260,
  }),
  S('arrow-diagonal', 'Diagonal arrow', 'سهم مائل', rotate(poly(...RIGHT), -45, 130, 80), {
    keywords: 'up right northeast',
  }),
  item('shape:double-arrow', 'Double arrow', 'سهم مزدوج', shape('double-arrow', { width: 280, height: 160 })),
  S(
    'double-arrow-vertical',
    'Up and down arrow',
    'سهم للأعلى والأسفل',
    poly(...turn(DOUBLE, (x, y) => [y, x])),
    {
      width: 160,
      height: 280,
    },
  ),
  S(
    'quad-arrow',
    'Four-way arrow',
    'سهم رباعي الاتجاهات',
    poly(
      50,
      0,
      70,
      18,
      59,
      18,
      59,
      41,
      82,
      41,
      82,
      30,
      100,
      50,
      82,
      70,
      82,
      59,
      59,
      59,
      59,
      82,
      70,
      82,
      50,
      100,
      30,
      82,
      41,
      82,
      41,
      59,
      18,
      59,
      18,
      70,
      0,
      50,
      18,
      30,
      18,
      41,
      41,
      41,
      41,
      18,
      30,
      18,
    ),
    { keywords: 'move cross directions' },
  ),
  S(
    'three-way-arrow',
    'Three-way arrow',
    'سهم ثلاثي الاتجاهات',
    poly(
      50,
      0,
      70,
      18,
      59,
      18,
      59,
      41,
      82,
      41,
      82,
      30,
      100,
      50,
      82,
      70,
      82,
      59,
      18,
      59,
      18,
      70,
      0,
      50,
      18,
      30,
      18,
      41,
      41,
      41,
      41,
      18,
      30,
      18,
    ),
  ),
  S(
    'notched-arrow',
    'Notched arrow',
    'سهم بذيل مشقوق',
    poly(0, 44.8, 143, 44.8, 143, 0, 260, 80, 143, 160, 143, 115.2, 0, 115.2, 34, 80),
    {
      width: 260,
      height: 160,
    },
  ),
  S(
    'striped-arrow',
    'Striped arrow',
    'سهم مخطّط',
    solid(
      rect(0, 44.8, 14, 70.4),
      rect(24, 44.8, 22, 70.4),
      poly(56, 44.8, 143, 44.8, 143, 0, 260, 80, 143, 160, 143, 115.2, 56, 115.2),
    ),
    { width: 260, height: 160, keywords: 'speed fast' },
  ),
  S('slim-arrow', 'Slim arrow', 'سهم رفيع', poly(0, 44, 80, 44, 80, 25, 100, 50, 80, 75, 80, 56, 0, 56), {
    width: 300,
    height: 150,
  }),
  item(
    'shape:rounded-arrow',
    'Rounded arrow',
    'سهم مستدير',
    shape('arrow-right', { width: 260, height: 160, cornerRadius: 12 }),
    'soft',
  ),
  S('pentagon-arrow', 'Pentagon arrow', 'سهم خماسي', poly(0, 0, 70, 0, 100, 50, 70, 100, 0, 100), {
    width: 260,
    height: 140,
    keywords: 'home plate step process',
  }),
  item('shape:chevron', 'Chevron', 'شيفرون', shape('chevron', { width: 240, height: 160 }), 'step process'),
  S(
    'double-chevron',
    'Double chevron',
    'شيفرون مزدوج',
    solid(
      poly(0, 0, 35, 0, 55, 50, 35, 100, 0, 100, 20, 50),
      poly(45, 0, 80, 0, 100, 50, 80, 100, 45, 100, 65, 50),
    ),
    { width: 260, height: 140, keywords: 'fast forward' },
  ),
  S(
    'chevrons',
    'Chevrons',
    'شيفرونات',
    solid(...[0, 32, 64].map((x) => poly(x, 0, x + 16, 0, x + 36, 50, x + 16, 100, x, 100, x + 20, 50))),
    { width: 240, height: 140, keywords: 'next forward' },
  ),
  S(
    'arrow-callout',
    'Arrow box',
    'صندوق بسهم',
    poly(0, 0, 64, 0, 64, 30, 78, 30, 78, 14, 100, 50, 78, 86, 78, 70, 64, 70, 64, 100, 0, 100),
    {
      width: 260,
      height: 170,
      keywords: 'callout',
    },
  ),
  S(
    'bent-arrow',
    'Turn arrow',
    'سهم منعطف',
    poly(0, 100, 0, 16, 64, 16, 64, 0, 100, 28, 64, 56, 64, 40, 24, 40, 24, 100),
    { keywords: 'turn right corner' },
  ),
  S(
    'u-turn-arrow',
    'U-turn arrow',
    'سهم دوران للخلف',
    solid(
      rect(0, 40, 22, 60),
      arcBand(44, 40, 44, 22, 270, 450),
      rect(66, 40, 22, 22),
      poly(54, 62, 100, 62, 77, 96),
    ),
    { keywords: 'return back' },
  ),
  S('curved-arrow', 'Curved arrow', 'سهم منحني', arcArrow(50, 50, 50, 34, 250, 380), {
    keywords: 'arc turn',
  }),
  S('circular-arrow', 'Circular arrow', 'سهم دائري', arcArrow(50, 50, 50, 34, 90, 380), {
    keywords: 'repeat redo rotate cycle',
  }),
  S(
    'cycle-arrows',
    'Cycle arrows',
    'سهمان دائريان',
    solid(arcArrow(50, 50, 50, 36, 20, 165), arcArrow(50, 50, 50, 36, 200, 345)),
    { keywords: 'refresh sync repeat loop' },
  ),
  S(
    'swoosh-arrow',
    'Swoosh arrow',
    'سهم منساب',
    'M0 100C10 50 40 25 70 21L68 6L100 30L72 55L71 39C45 41 20 60 0 100Z',
    { keywords: 'curve growth' },
  ),
];

// ---------------------------------------------------------------------------
// Speech bubbles
// ---------------------------------------------------------------------------

const CLOUD_BODY = solid(
  circle(30, 42, 22),
  circle(52, 30, 26),
  circle(76, 40, 22),
  circle(66, 56, 18),
  circle(42, 58, 18),
  rect(28, 40, 50, 30),
);

const BUBBLES: ElementItem[] = [
  SHAPE_BUBBLE,
  item(
    'shape:round-bubble',
    'Round bubble',
    'فقاعة مستديرة',
    shape('round-bubble', { width: 240, height: 200 }),
  ),
  S(
    'oval-bubble',
    'Oval bubble',
    'فقاعة بيضاوية',
    solid(ellipse(50, 40, 50, 40), poly(22, 66, 42, 76, 10, 100)),
    {
      width: 240,
      height: 200,
      keywords: 'speech talk',
    },
  ),
  S(
    'thought-bubble',
    'Thought bubble',
    'فقاعة تفكير',
    solid(CLOUD_BODY, circle(18, 86, 7), circle(6, 98, 4)),
    {
      keywords: 'think cloud dream',
    },
  ),
  S(
    'chat-bubble',
    'Chat bubble',
    'فقاعة دردشة',
    solid(rect(0, 0, 100, 78, 18), parse('M10 70C10 86 5 95 0 100C14 99 28 92 36 78Z')),
    {
      width: 240,
      height: 190,
      keywords: 'message speech',
    },
  ),
  S('tooltip', 'Tooltip', 'تلميح', solid(rect(0, 0, 100, 80, 14), poly(40, 79, 60, 79, 50, 100)), {
    width: 220,
    height: 160,
    keywords: 'callout pointer label',
  }),
  S(
    'callout-square',
    'Square callout',
    'تعليق مربّع',
    solid(rect(0, 0, 100, 76), poly(60, 75, 86, 75, 96, 100)),
    {
      width: 240,
      height: 180,
      keywords: 'speech bubble',
    },
  ),
  S(
    'callout-left',
    'Pointer label',
    'ملصق بمؤشر',
    solid(rect(12, 0, 88, 100, 12), poly(14, 32, 0, 50, 14, 68)),
    {
      width: 240,
      height: 140,
      keywords: 'callout tooltip',
    },
  ),
  S('shout-bubble', 'Shout bubble', 'فقاعة صراخ', explosion(31, 12, [33, 39], [44, 50]), {
    width: 260,
    height: 200,
    keywords: 'comic yell boom',
  }),
];

// ---------------------------------------------------------------------------
// Banners and tags
// ---------------------------------------------------------------------------

const BANNERS: ElementItem[] = [
  item('shape:banner', 'Banner', 'شريط لافتة', shape('banner', { width: 300, height: 110 }), 'ribbon'),
  item(
    'shape:ribbon',
    'Ribbon banner',
    'شريط بطيّات',
    group('Ribbon', 320, 104, [
      piece({ x: 0, y: 24, width: 60, height: 80 }, '#5b4bd8', {
        path: svg(poly(0, 0, 60, 0, 60, 80, 0, 80, 18, 40)),
        name: 'End',
      }),
      piece({ x: 260, y: 24, width: 60, height: 80 }, '#5b4bd8', {
        path: svg(poly(60, 0, 0, 0, 0, 80, 60, 80, 42, 40)),
        name: 'End',
      }),
      piece({ x: 40, y: 80, width: 20, height: 24 }, '#3d2fb0', {
        path: svg(poly(0, 0, 20, 0, 20, 24)),
        name: 'Fold',
      }),
      piece({ x: 260, y: 80, width: 20, height: 24 }, '#3d2fb0', {
        path: svg(poly(20, 0, 0, 0, 0, 24)),
        name: 'Fold',
      }),
      piece({ x: 40, y: 0, width: 240, height: 80 }, BRAND, { name: 'Band' }),
    ]),
    'title label banner',
  ),
  S('arched-banner', 'Arched banner', 'شريط مقوّس', 'M0 40Q50 0 100 40V70Q50 30 0 70Z', {
    size: 300,
    keywords: 'curved title',
  }),
  S('wavy-banner', 'Wavy banner', 'شريط متموّج', 'M0 15C30 0 60 35 100 15V75C60 95 30 60 0 75Z', {
    size: 300,
    keywords: 'flag wave',
  }),
  S('swallowtail', 'Flag', 'راية', poly(0, 0, 100, 0, 82, 50, 100, 100, 0, 100), {
    width: 260,
    height: 140,
    keywords: 'swallowtail ribbon',
  }),
  S('pennant', 'Pennant', 'راية مثلثة', poly(0, 0, 100, 50, 0, 100), {
    width: 280,
    height: 120,
    keywords: 'flag triangle',
  }),
  S('bookmark', 'Bookmark', 'علامة كتاب', poly(0, 0, 100, 0, 100, 100, 50, 76, 0, 100), {
    width: 140,
    height: 220,
    keywords: 'save',
  }),
  item('shape:tag', 'Tag', 'وسم', shape('tag', { width: 260, height: 140 }), 'label price'),
  S(
    'price-tag',
    'Price tag',
    'بطاقة سعر',
    cut(polygon([pt(0, 0), pt(68, 0), pt(100, 50), pt(68, 100), pt(0, 100)], 6), circle(76, 50, 7)),
    {
      width: 260,
      height: 140,
      keywords: 'label sale',
    },
  ),
  S('ticket', 'Ticket', 'تذكرة', 'M0 0H280V62A18 18 0 0 0 280 98V160H0V98A18 18 0 0 0 0 62Z', {
    width: 280,
    height: 160,
    keywords: 'coupon admit event',
  }),
  S(
    'ticket-stub',
    'Ticket with stub',
    'تذكرة بقسيمة',
    'M0 0H182A18 18 0 0 0 218 0H280V160H218A18 18 0 0 0 182 160H0Z',
    {
      width: 280,
      height: 160,
      keywords: 'coupon admit event',
    },
  ),
];

// ---------------------------------------------------------------------------
// Flowchart
// ---------------------------------------------------------------------------

/** A disc cut into four pieces (summing junction / or). */
function quarters(offset: number): Path {
  return solid(
    ...[0, 90, 180, 270].map((d) => {
      const direction = d + offset;
      const a = onCircle(0, 0, 3, direction);
      const p = arcBand(0, 0, 47, 0.001, direction - 45, direction + 45);
      return translate(p, 50 + a.x, 50 + a.y);
    }),
  );
}

const CYLINDER = [
  ...solid(parse('M0 14A50 14 0 0 1 100 14V86A50 14 0 0 1 0 86Z')),
  // The lid's edge, a thin crescent cut out of the body.
  ...hole(parse('M3 15A47 12 0 0 0 97 15A50 16 0 0 1 3 15Z')),
];

const FLOWCHART: ElementItem[] = [
  item(
    'shape:flow-process',
    'Process',
    'عملية',
    shape('rect', { width: 240, height: 150 }),
    'flowchart rectangle',
  ),
  item(
    'shape:flow-alternate',
    'Alternate process',
    'عملية بديلة',
    shape('rect', { width: 240, height: 150, cornerRadius: 26 }),
    'flowchart',
  ),
  item(
    'shape:flow-decision',
    'Decision',
    'قرار',
    shape('diamond', { width: 240, height: 160 }),
    'flowchart if',
  ),
  item(
    'shape:flow-data',
    'Data',
    'بيانات',
    shape('parallelogram', { width: 260, height: 150 }),
    'flowchart input output',
  ),
  item(
    'shape:flow-terminator',
    'Start / end',
    'بداية / نهاية',
    shape('rect', { width: 240, height: 100, cornerRadius: 50 }),
    'flowchart terminator',
  ),
  S(
    'flow-predefined',
    'Predefined process',
    'عملية معرّفة',
    solid(rect(0, 0, 8, 100), rect(10, 0, 80, 100), rect(92, 0, 8, 100)),
    {
      width: 240,
      height: 150,
      keywords: 'flowchart subroutine',
    },
  ),
  S(
    'flow-internal-storage',
    'Internal storage',
    'تخزين داخلي',
    solid(rect(0, 0, 13, 17), rect(15, 0, 85, 17), rect(0, 19, 13, 81), rect(15, 19, 85, 81)),
    { width: 200, height: 160, keywords: 'flowchart' },
  ),
  S('flow-document', 'Document', 'مستند', 'M0 0H100V84C82 72 66 74 50 84S18 96 0 84Z', {
    width: 240,
    height: 160,
    keywords: 'flowchart page',
  }),
  S(
    'flow-multidocument',
    'Multiple documents',
    'مستندات متعددة',
    solid(rect(16, 0, 84, 66), rect(8, 8, 84, 66), parse('M0 16H84V86C70 76 56 78 42 86S14 96 0 86Z')),
    { width: 240, height: 170, keywords: 'flowchart pages' },
  ),
  S('flow-preparation', 'Preparation', 'تحضير', poly(20, 0, 80, 0, 100, 50, 80, 100, 20, 100, 0, 50), {
    width: 240,
    height: 120,
    keywords: 'flowchart hexagon',
  }),
  S('flow-manual-input', 'Manual input', 'إدخال يدوي', poly(0, 28, 100, 0, 100, 100, 0, 100), {
    width: 240,
    height: 150,
    keywords: 'flowchart',
  }),
  S('flow-manual-operation', 'Manual operation', 'عملية يدوية', poly(0, 0, 100, 0, 80, 100, 20, 100), {
    width: 240,
    height: 140,
    keywords: 'flowchart',
  }),
  item(
    'shape:flow-connector',
    'Connector',
    'موصّل',
    shape('ellipse', { width: 150, height: 150 }),
    'flowchart circle',
  ),
  S('flow-off-page', 'Off-page connector', 'موصّل لصفحة أخرى', poly(0, 0, 100, 0, 100, 64, 50, 100, 0, 64), {
    width: 170,
    height: 190,
    keywords: 'flowchart',
  }),
  S('flow-card', 'Card', 'بطاقة', poly(22, 0, 100, 0, 100, 100, 0, 100, 0, 22), {
    width: 220,
    height: 160,
    keywords: 'flowchart punched',
  }),
  S(
    'flow-punched-tape',
    'Punched tape',
    'شريط مثقوب',
    'M0 10C17 24 33 24 50 10S83-4 100 10V90C83 76 67 76 50 90S17 104 0 90Z',
    {
      width: 240,
      height: 160,
      keywords: 'flowchart',
    },
  ),
  S('flow-database', 'Database', 'قاعدة بيانات', CYLINDER, {
    width: 160,
    height: 200,
    keywords: 'flowchart cylinder storage disk',
  }),
  S('flow-direct-access', 'Direct access storage', 'تخزين مباشر', rotate(CYLINDER, -90), {
    width: 240,
    height: 150,
    keywords: 'flowchart cylinder drum',
  }),
  S(
    'flow-stored-data',
    'Stored data',
    'بيانات مخزّنة',
    'M18 0H100C88 18 88 82 100 100H18C6 100 0 75 0 50S6 0 18 0Z',
    {
      width: 240,
      height: 150,
      keywords: 'flowchart',
    },
  ),
  S('flow-delay', 'Delay', 'تأخير', 'M0 0H60A40 50 0 0 1 60 100H0Z', {
    width: 220,
    height: 150,
    keywords: 'flowchart wait',
  }),
  S('flow-display', 'Display', 'عرض', 'M18 0H82C96 18 96 82 82 100H18L0 50Z', {
    width: 240,
    height: 150,
    keywords: 'flowchart screen',
  }),
  S('flow-loop-limit', 'Loop limit', 'حدّ التكرار', poly(20, 0, 80, 0, 100, 20, 100, 100, 0, 100, 0, 20), {
    width: 220,
    height: 150,
    keywords: 'flowchart',
  }),
  S('flow-merge', 'Merge', 'دمج', poly(0, 0, 100, 0, 50, 100), {
    width: 180,
    height: 150,
    keywords: 'flowchart triangle down',
  }),
  S('flow-extract', 'Extract', 'استخراج', poly(50, 0, 100, 100, 0, 100), {
    width: 180,
    height: 150,
    keywords: 'flowchart triangle',
  }),
  S('flow-collate', 'Collate', 'ترتيب', solid(poly(0, 0, 100, 0, 50, 50), poly(50, 50, 100, 100, 0, 100)), {
    width: 160,
    height: 200,
    keywords: 'flowchart hourglass',
  }),
  S('flow-sort', 'Sort', 'فرز', solid(poly(50, 0, 100, 48, 0, 48), poly(0, 52, 100, 52, 50, 100)), {
    width: 160,
    height: 200,
    keywords: 'flowchart',
  }),
  S('flow-summing-junction', 'Summing junction', 'نقطة جمع', quarters(0), {
    size: 160,
    keywords: 'flowchart',
  }),
  S('flow-or', 'Or', 'أو', quarters(45), { size: 160, keywords: 'flowchart' }),
];

// ---------------------------------------------------------------------------
// Signs and symbols
// ---------------------------------------------------------------------------

const PLUS = poly(
  37,
  0,
  63,
  0,
  63,
  37,
  100,
  37,
  100,
  63,
  63,
  63,
  63,
  100,
  37,
  100,
  37,
  63,
  0,
  63,
  0,
  37,
  37,
  37,
);
const EQUALS = solid(rect(0, 0, 100, 28), rect(0, 48, 100, 28));
const ROUND_BAR = (angle: number) => rotate(rect(42, 0, 16, 100, 8), angle);

function gear(): Path {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const c = i * 36;
    points.push(
      onCircle(50, 50, 38, c - 11),
      onCircle(50, 50, 50, c - 6),
      onCircle(50, 50, 50, c + 6),
      onCircle(50, 50, 38, c + 11),
    );
  }
  return cut(polygon(points, 1.5), circle(50, 50, 15));
}

function sun(): Path {
  return solid(
    circle(50, 50, 24),
    ...Array.from({ length: 12 }, (_, i) => rotate(rect(46.5, 0, 7, 17, 3.5), i * 30)),
  );
}

const SYMBOLS: ElementItem[] = [
  item('shape:cross', 'Plus', 'علامة زائد', shape('cross'), 'plus add cross'),
  item('shape:minus', 'Minus', 'علامة ناقص', shape('rect', { width: 200, height: 52 }), 'subtract dash'),
  S('multiply', 'Multiply', 'علامة ضرب', rotate(PLUS, 45), { keywords: 'times close x cross' }),
  S('divide', 'Divide', 'علامة قسمة', solid(rect(0, 40, 100, 20), circle(50, 13, 13), circle(50, 87, 13)), {
    keywords: 'division',
  }),
  S('equals', 'Equals', 'علامة يساوي', EQUALS, { keywords: 'equal' }),
  S('not-equal', 'Not equal', 'علامة لا يساوي', solid(EQUALS, rotate(rect(43, -14, 14, 104), 28, 50, 38)), {
    keywords: 'different',
  }),
  S(
    'percent',
    'Percent',
    'علامة النسبة المئوية',
    [
      ...solid(circle(20, 20, 20), circle(80, 80, 20), rotate(rect(43, -12, 14, 124), 45)),
      ...hole(circle(20, 20, 9), circle(80, 80, 9)),
    ],
    { keywords: 'discount sale' },
  ),
  S('check', 'Check mark', 'علامة صح', poly(0, 56, 16, 40, 38, 62, 84, 16, 100, 32, 38, 94), {
    keywords: 'tick done yes correct',
  }),
  S(
    'no-symbol',
    'Prohibited',
    'علامة منع',
    [...solid(circle(50, 50, 50), rotate(rect(43, 10, 14, 80), 45)), ...hole(circle(50, 50, 37))],
    {
      keywords: 'no stop forbidden ban',
    },
  ),
  S('lightning', 'Lightning bolt', 'صاعقة', poly(58, 0, 10, 58, 44, 58, 34, 100, 90, 38, 56, 38, 70, 0), {
    keywords: 'flash power energy electric',
  }),
  S('sun', 'Sun', 'شمس', sun(), { keywords: 'weather summer bright' }),
  S(
    'moon-star',
    'Crescent and star',
    'هلال ونجمة',
    solid(
      parse('M48 12a24 24 0 0 0 36 36 36 36 0 1 1-36-36Z'),
      polygon(starPoints(5, 11, 4.6, { cx: 80, cy: 18 })),
    ),
    { keywords: 'ramadan eid islamic moon night' },
  ),
  S(
    'location-pin',
    'Location pin',
    'دبوس موقع',
    cut(parse('M50 100C50 100 14 62 14 38A36 36 0 0 1 86 38C86 62 50 100 50 100Z'), circle(50, 38, 14)),
    { keywords: 'map marker place' },
  ),
  S(
    'house',
    'House',
    'بيت',
    poly(50, 0, 100, 44, 86, 44, 86, 100, 60, 100, 60, 66, 40, 66, 40, 100, 14, 100, 14, 44, 0, 44),
    {
      keywords: 'home building',
    },
  ),
  S(
    'puzzle',
    'Puzzle piece',
    'قطعة أحجية',
    'M15 15H38A12 12 0 1 1 62 15H85V38A12 12 0 1 1 85 62V85H62A12 12 0 1 0 38 85H15V62A12 12 0 1 0 15 38Z',
    { keywords: 'jigsaw piece teamwork' },
  ),
  S('gear', 'Gear', 'ترس', gear(), { keywords: 'cog settings machine' }),
  S('asterisk', 'Asterisk', 'علامة نجمية', solid(ROUND_BAR(0), ROUND_BAR(60), ROUND_BAR(120)), {
    keywords: 'star snowflake',
  }),
  S(
    'quotes',
    'Quotation marks',
    'علامتا تنصيص',
    solid(
      circle(22, 24, 22),
      parse('M44 24C44 56 30 76 6 88L2 80C18 70 26 56 24 40Z'),
      circle(76, 24, 22),
      parse('M98 24C98 56 84 76 60 88L56 80C72 70 80 56 78 40Z'),
    ),
    { keywords: 'quote testimonial' },
  ),
];

// ---------------------------------------------------------------------------
// Soft shapes
// ---------------------------------------------------------------------------

/** A circle with `n` gentle waves around its edge. */
export const cookie = (n: number, amplitude: number) =>
  polar((t) => 1 - amplitude + amplitude * Math.cos(n * t), n * 4);

/** Round petals around a disc. */
export function flower(petals: number, petalRadius: number, distance: number, centre: number): Path {
  return solid(
    circle(50, 50, centre),
    ...Array.from({ length: petals }, (_, i) => {
      const c = onCircle(50, 50, distance, (i * 360) / petals);
      return circle(c.x, c.y, petalRadius);
    }),
  );
}

/** A stepped, pixel-art circle: rows of `size` cells. */
function pixelCircle(size: number): Path {
  const half = size / 2;
  const widths = Array.from({ length: size }, (_, row) => {
    const y = row + 0.5 - half;
    return Math.round(Math.sqrt(Math.max(0, half * half - y * y)));
  });
  const points = [];
  widths.forEach((w, row) => points.push(pt(half + w, row), pt(half + w, row + 1)));
  for (let row = size - 1; row >= 0; row--)
    points.push(pt(half - widths[row]!, row + 1), pt(half - widths[row]!, row));
  return polygon(points);
}

const SOFT: ElementItem[] = [
  S('cookie-4', 'Soft square', 'مربع متموّج', cookie(4, 0.09), { keywords: 'cookie wavy' }),
  S('cookie-6', 'Cookie (6 waves)', 'دائرة بست موجات', cookie(6, 0.08), { keywords: 'wavy circle badge' }),
  S('cookie-7', 'Cookie (7 waves)', 'دائرة بسبع موجات', cookie(7, 0.07), { keywords: 'wavy circle badge' }),
  S('cookie-9', 'Cookie (9 waves)', 'دائرة بتسع موجات', cookie(9, 0.055), { keywords: 'wavy circle badge' }),
  S('cookie-12', 'Cookie (12 waves)', 'دائرة باثنتي عشرة موجة', cookie(12, 0.045), {
    keywords: 'wavy circle badge',
  }),
  S(
    'clover-4',
    'Four-leaf clover',
    'برسيم رباعي',
    polar((t) => 0.76 + 0.24 * Math.cos(4 * t), 32),
    {
      keywords: 'luck leaf',
    },
  ),
  S(
    'clover-8',
    'Eight-leaf clover',
    'برسيم ثماني',
    polar((t) => 0.88 + 0.12 * Math.cos(8 * t), 64),
    {
      keywords: 'flower wavy',
    },
  ),
  S('flower-5', 'Five-petal flower', 'زهرة خماسية', flower(5, 22, 28, 30), { keywords: 'blossom spring' }),
  S('flower-6', 'Six-petal flower', 'زهرة سداسية', flower(6, 20, 30, 30), { keywords: 'blossom spring' }),
  S('flower-8', 'Eight-petal flower', 'زهرة ثمانية', flower(8, 16, 34, 34), { keywords: 'blossom daisy' }),
  S('puffy', 'Puffy', 'شكل منفوش', flower(10, 16, 34, 36), { keywords: 'cloud bubbly' }),
  item(
    'shape:sunny',
    'Sunny',
    'مشمس',
    shape('star', { sides: 8, innerRatio: 0.84, cornerRadius: 10 }),
    'soft star',
  ),
  item(
    'shape:very-sunny',
    'Very sunny',
    'مشمس جدًا',
    shape('star', { sides: 12, innerRatio: 0.84, cornerRadius: 6 }),
    'soft star badge',
  ),
  item(
    'shape:soft-triangle',
    'Soft triangle',
    'مثلث ناعم',
    shape('triangle', { cornerRadius: 44 }),
    'rounded',
  ),
  S('gem', 'Gem', 'جوهرة', poly(26, 0, 74, 0, 100, 34, 50, 100, 0, 34), {
    cornerRadius: 12,
    keywords: 'diamond jewel',
  }),
  S('pixel-circle', 'Pixel circle', 'دائرة بكسلات', pixelCircle(12), { keywords: 'pixel art retro game' }),
  S(
    'pixel-heart',
    'Pixel heart',
    'قلب بكسلات',
    poly(
      1,
      0,
      3,
      0,
      3,
      1,
      4,
      1,
      4,
      0,
      6,
      0,
      6,
      1,
      7,
      1,
      7,
      4,
      6,
      4,
      6,
      5,
      5,
      5,
      5,
      6,
      4,
      6,
      4,
      7,
      3,
      7,
      3,
      6,
      2,
      6,
      2,
      5,
      1,
      5,
      1,
      4,
      0,
      4,
      0,
      1,
      1,
      1,
    ),
    { keywords: 'pixel art retro game love' },
  ),
];

// ---------------------------------------------------------------------------
// Organic shapes, dividers and patterns
// ---------------------------------------------------------------------------

/** A smooth organic shape, the same on every load. */
export function blob(seed: number, points = 8, low = 0.72): Path {
  const rnd = random(seed);
  const corners = Array.from({ length: points }, (_, i) =>
    onCircle(50, 50, 50 * (low + rnd() * (1 - low)), (i * 360) / points + (rnd() - 0.5) * (120 / points)),
  );
  return smooth(corners);
}

/** A rough-edged band, like a paint stroke: gently wavy edges, ragged ends. */
export function brushStroke(seed: number, thickness = 22, bend = 0): Path {
  const rnd = random(seed);
  // Slow waves plus a little grain along each edge.
  const edge = () => {
    const phases = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    return (t: number) =>
      Math.sin(t * 5 + phases[0]!) * 0.9 +
      Math.sin(t * 13 + phases[1]!) * 0.45 +
      Math.sin(t * 31 + phases[2]!) * 0.25;
  };
  const upper = edge();
  const lower = edge();
  const top = [];
  const bottom = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = 5 + 90 * t;
    const middle = 50 - bend * Math.sin(Math.PI * t);
    // Slightly thinner towards the end, where the brush runs dry.
    const half = (thickness / 2) * (1 - 0.18 * t);
    top.push(pt(x, middle - half + upper(t) + (rnd() - 0.5) * 0.5));
    bottom.push(pt(x, middle + half + lower(t) + (rnd() - 0.5) * 0.5));
  }
  // Ragged ends: a few bristle tips across the stroke.
  const end = (x: number, from: Vec, to: Vec, direction: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const k = (i + 1) / 6;
      return pt(x + direction * (rnd() * 5 + (i % 2) * 2), from.y + (to.y - from.y) * k);
    });
  const first = top[0]!;
  const last = top[steps]!;
  return polygon([
    ...end(5, bottom[0]!, first, -1),
    ...top,
    ...end(95, last, bottom[steps]!, 1),
    ...bottom.reverse(),
  ]);
}

/** A strip with torn top and bottom edges. */
export function tornStrip(seed: number, width: number, height: number, depth: number): Path {
  const rnd = random(seed);
  const top = [];
  const bottom = [];
  const teeth = Math.round(width / 9);
  for (let i = 0; i <= teeth; i++) {
    const x = (width * i) / teeth;
    top.push(pt(x, rnd() * depth));
    bottom.push(pt(x, height - rnd() * depth));
  }
  return polygon([...top, ...bottom.reverse()]);
}

function waveTop(periods: number, amplitude: number, base: number): Path {
  const points = [];
  const steps = periods * 4;
  for (let i = 0; i <= steps; i++)
    points.push(pt((100 * i) / steps, base - Math.sin((i * Math.PI) / 2) * amplitude));
  const curve: Path = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    curve.push([
      'C',
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    ]);
  }
  return [['M', 0, 100], ['L', points[0]!.x, points[0]!.y], ...curve, ['L', 100, 100], ['Z']];
}

function drips(): Path {
  const rnd = random(5);
  let d = 'M0 0H400V60';
  let x = 400;
  while (x > 20) {
    const w = 18 + rnd() * 22;
    const gap = 14 + rnd() * 30;
    const length = 20 + rnd() * 90;
    const right = x - gap;
    const left = right - w;
    if (left < 10) break;
    d += `H${right.toFixed(1)}V${(60 + length).toFixed(1)}A${(w / 2).toFixed(1)} ${(w / 2).toFixed(1)} 0 0 1 ${left.toFixed(1)} ${(60 + length).toFixed(1)}V60`;
    x = left;
  }
  return parse(`${d}H0Z`);
}

const ORGANIC: ElementItem[] = [
  ...[3, 11, 23, 42, 57, 71].map((seed, i) =>
    S(`blob-${i + 1}`, `Blob ${i + 1}`, `شكل عضوي ${i + 1}`, blob(seed, 7 + (i % 3)), {
      keywords: 'organic liquid abstract',
    }),
  ),
  S('pebble', 'Pebble', 'حصاة', blob(97, 6, 0.86), { keywords: 'stone organic' }),
  S(
    'bean',
    'Bean',
    'حبة فاصولياء',
    smooth([pt(18, 18), pt(55, 4), pt(92, 22), pt(88, 62), pt(60, 58), pt(36, 82), pt(8, 64)]),
    {
      keywords: 'organic kidney',
    },
  ),
  S('leaf', 'Leaf', 'ورقة شجر', 'M0 100C0 40 40 0 100 0C100 60 60 100 0 100Z', { keywords: 'plant nature' }),
  S(
    'splash',
    'Splash',
    'رذاذ',
    solid(blob(8, 9, 0.62), circle(92, 14, 5), circle(8, 90, 4), circle(96, 78, 3.2), circle(14, 8, 2.6)),
    { keywords: 'paint splatter ink' },
  ),
  S('brush-stroke', 'Brush stroke', 'ضربة فرشاة', brushStroke(4), {
    width: 320,
    height: 90,
    keywords: 'paint highlight marker',
  }),
  S('brush-stroke-curved', 'Curved brush stroke', 'ضربة فرشاة منحنية', brushStroke(9, 26, 10), {
    width: 320,
    height: 120,
    keywords: 'paint highlight',
  }),
  S('torn-strip', 'Torn paper strip', 'شريط ورق ممزّق', tornStrip(6, 300, 70, 9), {
    width: 320,
    height: 75,
    keywords: 'paper rip',
  }),
  S('mountains', 'Mountains', 'جبال', poly(0, 100, 36, 22, 58, 58, 74, 34, 100, 100), {
    width: 300,
    height: 150,
    keywords: 'landscape hills',
  }),
  S('wave-divider', 'Wave edge', 'حافة متموّجة', waveTop(3, 10, 30), {
    width: 400,
    height: 120,
    keywords: 'divider section wave',
  }),
  S('hill-divider', 'Curved edge', 'حافة منحنية', 'M0 100V60Q50 -20 100 60V100Z', {
    width: 400,
    height: 110,
    keywords: 'divider hill',
  }),
  S('drips', 'Paint drips', 'سيلان طلاء', drips(), {
    width: 400,
    height: 170,
    keywords: 'drip melt liquid divider',
  }),
  S(
    'zigzag-band',
    'Zigzag band',
    'شريط متعرّج',
    poly(
      ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => [i * 16.66, i % 2 ? 0 : 14]),
      ...[6, 5, 4, 3, 2, 1, 0].flatMap((i) => [i * 16.66, (i % 2 ? 0 : 14) + 12]),
    ),
    { width: 300, height: 80, keywords: 'chevron pattern' },
  ),
  S(
    'dot-grid',
    'Dot grid',
    'شبكة نقاط',
    solid(...[0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => circle(10 + c * 20, 10 + r * 20, 5)))),
    { keywords: 'pattern dots decoration' },
  ),
  S(
    'stripes',
    'Diagonal stripes',
    'خطوط مائلة',
    solid(
      ...[0, 1, 2, 3, 4, 5].map((i) => poly(i * 20, 100, i * 20 + 10, 100, i * 20 + 40, 0, i * 20 + 30, 0)),
    ),
    { keywords: 'pattern lines decoration' },
  ),
  S(
    'concentric',
    'Concentric circles',
    'دوائر متحدة المركز',
    [
      ...solid(circle(50, 50, 50), circle(50, 50, 32), circle(50, 50, 14)),
      ...hole(circle(50, 50, 41), circle(50, 50, 23)),
    ],
    { keywords: 'target rings pattern' },
  ),
];

// ---------------------------------------------------------------------------
// 3D solids
// ---------------------------------------------------------------------------

const LIGHT = '#b3a9fb';
const MID = BRAND;
const DARK = '#4f3fd0';

function face(outline: Path | string, fill: string | ReturnType<typeof linear>, name: string): AnyNodeProps {
  const { path, ...box } = placed(outline);
  return piece(box, fill, { path, name });
}

const SOLIDS: ElementItem[] = [
  item(
    'shape:cube',
    'Cube',
    'مكعب',
    group('Cube', 200, 230, [
      face(poly(100, 0, 200, 57, 100, 115, 0, 57), LIGHT, 'Top'),
      face(poly(0, 57, 100, 115, 100, 230, 0, 172), MID, 'Left'),
      face(poly(200, 57, 200, 172, 100, 230, 100, 115), DARK, 'Right'),
    ]),
    '3d box solid isometric',
  ),
  item(
    'shape:cuboid',
    'Box',
    'متوازي مستطيلات',
    group('Box', 280, 200, [
      face(poly(90, 0, 280, 40, 190, 90, 0, 50), LIGHT, 'Top'),
      face(poly(0, 50, 190, 90, 190, 200, 0, 160), MID, 'Front'),
      face(poly(280, 40, 280, 150, 190, 200, 190, 90), DARK, 'Side'),
    ]),
    '3d cuboid solid package',
  ),
  item(
    'shape:cylinder',
    'Cylinder',
    'أسطوانة',
    group('Cylinder', 160, 220, [
      face('M0 20A80 20 0 0 0 160 20V200A80 20 0 0 1 0 200Z', linear(90, DARK, LIGHT, MID, DARK), 'Body'),
      piece({ x: 0, y: 0, width: 160, height: 40 }, LIGHT, { kind: 'ellipse', name: 'Top' }),
    ]),
    '3d solid can tube',
  ),
  item(
    'shape:cone',
    'Cone',
    'مخروط',
    group('Cone', 160, 220, [
      face('M80 0L160 200A80 20 0 0 1 0 200Z', linear(90, DARK, LIGHT, MID, DARK), 'Cone'),
    ]),
    '3d solid',
  ),
  item(
    'shape:pyramid',
    'Pyramid',
    'هرم',
    group('Pyramid', 220, 200, [
      face(poly(110, 0, 0, 170, 120, 200), MID, 'Left'),
      face(poly(110, 0, 120, 200, 220, 160), DARK, 'Right'),
    ]),
    '3d solid egypt',
  ),
  item(
    'shape:sphere',
    'Sphere',
    'كرة',
    shape('ellipse', { fill: radial(0.35, 0.3, '#d9d3ff', MID, '#3a2bb0') }),
    '3d ball globe solid',
  ),
];

export const SHAPE_SECTIONS: ElementSection[] = [
  { id: 'basic-shapes', title: { en: 'Basic shapes', ar: 'أشكال أساسية' }, items: BASIC, columns: 4 },
  { id: 'polygons', title: { en: 'Polygons', ar: 'مضلّعات' }, items: POLYGONS, columns: 4 },
  { id: 'stars', title: { en: 'Stars and badges', ar: 'نجوم وشارات' }, items: STARS, columns: 4 },
  { id: 'arrows', title: { en: 'Arrows', ar: 'أسهم' }, items: ARROWS, columns: 4 },
  { id: 'bubbles', title: { en: 'Speech bubbles', ar: 'فقاعات كلام' }, items: BUBBLES, columns: 4 },
  { id: 'banners', title: { en: 'Banners and tags', ar: 'شرائط ووسوم' }, items: BANNERS, columns: 4 },
  { id: 'soft', title: { en: 'Soft shapes', ar: 'أشكال ناعمة' }, items: SOFT, columns: 4 },
  {
    id: 'organic',
    title: { en: 'Organic and patterns', ar: 'أشكال عضوية وزخارف' },
    items: ORGANIC,
    columns: 4,
  },
  { id: 'symbols', title: { en: 'Signs and symbols', ar: 'علامات ورموز' }, items: SYMBOLS, columns: 4 },
  { id: 'flowchart', title: { en: 'Flowchart', ar: 'مخطط انسيابي' }, items: FLOWCHART, columns: 4 },
  { id: 'solids', title: { en: '3D shapes', ar: 'أشكال ثلاثية الأبعاد' }, items: SOLIDS, columns: 4 },
];
