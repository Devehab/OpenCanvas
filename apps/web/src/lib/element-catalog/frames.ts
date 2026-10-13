/**
 * Frames: photo slots in many outlines (shapes, soft and organic forms,
 * arches, brush and paper edges, letters and numbers). A photo dropped on one
 * takes its shape.
 */
import type { ShapeKind, Vec } from '@opencanvas/core';
import {
  FRAME_ARCH,
  FRAME_BLOB,
  FRAME_CLOUD,
  FRAME_ELLIPSE,
  FRAME_FLOWER,
  FRAME_HEART,
  FRAME_ROUNDED,
  FRAME_STAR,
} from '../element-library';
import { type ElementItem, type ElementSection, frame, group, item } from './builders';
import {
  arc,
  circle,
  cut,
  onCircle,
  type Path,
  polar,
  poly,
  polygon,
  pt,
  random,
  regularPoints,
  smooth,
  solid,
} from './geometry';
import { outlineFrame as F } from './kit';
import LETTERS from './letters.json';
import { blob, brushStroke, cookie, flower, tornStrip } from './shapes';

type Size = { width: number; height: number };
const SQUARE: Size = { width: 300, height: 300 };

/** A frame of a built-in kind (the id names the kind unless one is given). */
const kindFrame = (
  id: string,
  en: string,
  ar: string,
  kind: ShapeKind = id as ShapeKind,
  size: Size = SQUARE,
  extra: Parameters<typeof frame>[2] = {},
) => item(`frame:${id}`, en, ar, frame(kind, size, extra), 'frame photo');

// ---------------------------------------------------------------------------
// Basic shapes
// ---------------------------------------------------------------------------

const BASIC: ElementItem[] = [
  kindFrame('rect', 'Square', 'مربع'),
  FRAME_ROUNDED,
  kindFrame('landscape', 'Landscape', 'أفقي', 'rect', { width: 400, height: 300 }),
  kindFrame('portrait', 'Portrait', 'عمودي', 'rect', { width: 300, height: 400 }),
  kindFrame(
    'rounded-landscape',
    'Rounded landscape',
    'أفقي بزوايا مستديرة',
    'rect',
    { width: 400, height: 300 },
    { cornerRadius: 32 },
  ),
  kindFrame(
    'rounded-portrait',
    'Rounded portrait',
    'عمودي بزوايا مستديرة',
    'rect',
    { width: 300, height: 400 },
    { cornerRadius: 32 },
  ),
  FRAME_ELLIPSE,
  kindFrame('oval', 'Oval', 'بيضاوي', 'ellipse', { width: 300, height: 380 }),
  kindFrame('oval-wide', 'Wide oval', 'بيضاوي أفقي', 'ellipse', { width: 400, height: 280 }),
  kindFrame('pill', 'Pill', 'كبسولة', 'rect', { width: 400, height: 200 }, { cornerRadius: 100 }),
  kindFrame(
    'pill-tall',
    'Tall pill',
    'كبسولة عمودية',
    'rect',
    { width: 220, height: 400 },
    { cornerRadius: 110 },
  ),
  kindFrame('squircle', 'Squircle', 'مربع ناعم'),
  FRAME_HEART,
  FRAME_STAR,
  FRAME_FLOWER,
  FRAME_CLOUD,
  FRAME_BLOB,
  kindFrame('drop', 'Drop', 'قطرة', 'drop', { width: 240, height: 300 }),
  kindFrame('hexagon', 'Hexagon', 'مسدّس'),
  F('hexagon-tall', 'Hexagon (pointy top)', 'مسدّس رأسي', polygon(regularPoints(6, 50))),
  kindFrame('pentagon', 'Pentagon', 'مخمّس'),
  kindFrame('octagon', 'Octagon', 'مثمّن'),
  kindFrame('diamond', 'Diamond', 'معيّن'),
  kindFrame('triangle', 'Triangle', 'مثلث'),
  kindFrame('rounded-triangle', 'Rounded triangle', 'مثلث مستدير', 'triangle', SQUARE, { cornerRadius: 30 }),
  kindFrame('shield', 'Shield', 'درع'),
  kindFrame('half-circle', 'Half circle', 'نصف دائرة', 'half-circle', { width: 320, height: 160 }),
  kindFrame('crescent', 'Crescent', 'هلال'),
  kindFrame('cross', 'Cross', 'علامة زائد'),
  kindFrame('ring', 'Ring', 'حلقة'),
  kindFrame('speech-bubble', 'Speech bubble', 'فقاعة كلام'),
  kindFrame('round-bubble', 'Round bubble', 'فقاعة مستديرة'),
  F(
    'snip-corners',
    'Cut corners',
    'زوايا مقصوصة',
    poly(16, 0, 84, 0, 100, 16, 100, 84, 84, 100, 16, 100, 0, 84, 0, 16),
    {
      width: 400,
      height: 300,
    },
  ),
  F('tab', 'Tab', 'لسان', 'M0 100V28A28 28 0 0 1 28 0H72A28 28 0 0 1 100 28V100Z', {
    width: 300,
    height: 360,
  }),
  F('leaf-corners', 'Leaf', 'ورقة', 'M50 0H100V50A50 50 0 0 1 50 100H0V50A50 50 0 0 1 50 0Z'),
  F('fan', 'Fan', 'مروحة', 'M0 0H50A50 50 0 0 1 100 50V100H0Z'),
  F('teardrop', 'Teardrop', 'دمعة', 'M50 0H100V50A50 50 0 1 1 50 0Z'),
  F('lens', 'Lens', 'عدسة', 'M0 50A62 62 0 0 1 100 50A62 62 0 0 1 0 50Z', { width: 400, height: 240 }),
  F('egg', 'Egg', 'بيضة', 'M50 0C78 0 96 38 96 62C96 86 76 100 50 100C24 100 4 86 4 62C4 38 22 0 50 0Z'),
  F('slanted', 'Slanted', 'مائل', poly(18, 0, 100, 0, 82, 100, 0, 100), {
    width: 380,
    height: 300,
    cornerRadius: 20,
  }),
  F('parallelogram', 'Parallelogram', 'متوازي أضلاع', poly(25, 0, 100, 0, 75, 100, 0, 100), {
    width: 400,
    height: 260,
  }),
  F('chevron', 'Chevron', 'شيفرون', poly(0, 0, 70, 0, 100, 50, 70, 100, 0, 100, 30, 50), {
    width: 400,
    height: 260,
  }),
  F('arrow', 'Arrow', 'سهم', poly(0, 0, 70, 0, 100, 50, 70, 100, 0, 100), { width: 400, height: 260 }),
  F('ticket', 'Ticket', 'تذكرة', 'M0 0H400V105A25 25 0 0 0 400 155V260H0V155A25 25 0 0 0 0 105Z', {
    width: 400,
    height: 260,
  }),
  F('bookmark', 'Bookmark', 'علامة كتاب', poly(0, 0, 100, 0, 100, 100, 50, 80, 0, 100), {
    width: 240,
    height: 360,
  }),
  F('price-tag', 'Tag', 'وسم', poly(0, 0, 70, 0, 100, 50, 70, 100, 0, 100), {
    width: 400,
    height: 240,
    cornerRadius: 12,
  }),
  F('keyhole', 'Keyhole', 'ثقب مفتاح', solid(circle(50, 30, 30), poly(30, 44, 70, 44, 82, 100, 18, 100)), {
    width: 260,
    height: 340,
  }),
];

// ---------------------------------------------------------------------------
// Soft and playful
// ---------------------------------------------------------------------------

const SOFT: ElementItem[] = [
  F('cookie-4', 'Soft square', 'مربع متموّج', cookie(4, 0.09)),
  F('cookie-6', 'Cookie (6 waves)', 'دائرة بست موجات', cookie(6, 0.08)),
  F('cookie-7', 'Cookie (7 waves)', 'دائرة بسبع موجات', cookie(7, 0.07)),
  F('cookie-9', 'Cookie (9 waves)', 'دائرة بتسع موجات', cookie(9, 0.055)),
  F('cookie-12', 'Cookie (12 waves)', 'دائرة باثنتي عشرة موجة', cookie(12, 0.045)),
  F(
    'clover-4',
    'Four-leaf clover',
    'برسيم رباعي',
    polar((t) => 0.76 + 0.24 * Math.cos(4 * t), 32),
  ),
  F(
    'clover-8',
    'Eight-leaf clover',
    'برسيم ثماني',
    polar((t) => 0.88 + 0.12 * Math.cos(8 * t), 64),
  ),
  F('flower-5', 'Five-petal flower', 'زهرة خماسية', flower(5, 22, 28, 30)),
  F('flower-6', 'Six-petal flower', 'زهرة سداسية', flower(6, 20, 30, 30)),
  F('flower-8', 'Eight-petal flower', 'زهرة ثمانية', flower(8, 16, 34, 34)),
  F('puffy', 'Puffy', 'منفوش', flower(10, 16, 34, 36), { keywords: 'cloud' }),
  kindFrame('sunny', 'Sunny', 'مشمس', 'custom', SQUARE, {
    path: svgStar(8, 0.84),
    cornerRadius: 14,
  }),
  kindFrame('very-sunny', 'Very sunny', 'مشمس جدًا', 'custom', SQUARE, {
    path: svgStar(12, 0.84),
    cornerRadius: 8,
  }),
  kindFrame('soft-burst', 'Soft burst', 'انفجار ناعم', 'custom', SQUARE, {
    path: svgStar(12, 0.8),
    cornerRadius: 10,
  }),
  kindFrame('rounded-star', 'Rounded star', 'نجمة مستديرة', 'custom', SQUARE, {
    path: svgStar(5, 0.5),
    cornerRadius: 20,
  }),
  kindFrame('star-4', '4-point star', 'نجمة رباعية', 'custom', SQUARE, {
    path: svgStar(4, 0.45),
    cornerRadius: 14,
  }),
  F(
    'sparkle',
    'Sparkle',
    'لمعة',
    'M50 0C53 35 65 47 100 50C65 53 53 65 50 100C47 65 35 53 0 50C35 47 47 35 50 0Z',
  ),
  kindFrame('burst', 'Burst', 'انفجار', 'custom', SQUARE, { path: svgStar(16, 0.8) }),
  F('gem', 'Gem', 'جوهرة', poly(26, 0, 74, 0, 100, 34, 50, 100, 0, 34), { cornerRadius: 14 }),
  F(
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
  ),
];

/** A star outline as path data (points, inner radius). */
function svgStar(points: number, inner: number): string {
  const corners = [];
  for (let i = 0; i < points * 2; i++)
    corners.push(onCircle(50, 50, i % 2 ? 50 * inner : 50, (i * 180) / points));
  let d = '';
  corners.forEach((p, i) => {
    d += `${i ? 'L' : 'M'}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;
  });
  return `${d}Z`;
}

// ---------------------------------------------------------------------------
// Arches and windows
// ---------------------------------------------------------------------------

const GOTHIC = 'M0 100V45C0 20 22 4 50 0C78 4 100 20 100 45V100Z';
const HORSESHOE = 'M14 100V58A46 46 0 1 1 86 58V100Z';
const OGEE = 'M0 100V50C0 32 18 24 32 18C43 13 48 7 50 0C52 7 57 13 68 18C82 24 100 32 100 50V100Z';

/** A Ramadan lantern's outline: ring, cap, body and base. */
function lantern(): Path {
  const half = [
    pt(54, 13),
    pt(70, 30),
    pt(75, 30),
    pt(75, 35),
    pt(70, 35),
    pt(82, 50),
    pt(82, 78),
    pt(69, 90),
    pt(64, 90),
    pt(64, 95),
    pt(57, 100),
  ];
  const outline = [...half, ...half.map((p) => pt(100 - p.x, p.y)).reverse()];
  return [...solid(polygon(outline), circle(50, 7, 7)), ...cut([], circle(50, 7, 3.4))];
}

/** Side-by-side windows of one outline. */
function windows(path: string, count: number, label: [string, string], id: string): ElementItem {
  const w = 140;
  const gap = 16;
  const width = count * w + (count - 1) * gap;
  return item(
    `frame:${id}`,
    label[0],
    label[1],
    group(
      'Windows',
      width,
      240,
      Array.from({ length: count }, (_, i) =>
        frame('custom', { x: i * (w + gap), y: 0, width: w, height: 240 }, { path }),
      ),
    ),
    'frame photo arch collage',
  );
}

const ARCH_TOP = 'M0 100V50A50 50 0 0 1 100 50V100Z';

const ARCHES: ElementItem[] = [
  FRAME_ARCH,
  F('arch-tall', 'Tall arch', 'قوس طويل', ARCH_TOP, { width: 220, height: 380 }),
  F('gothic-arch', 'Pointed arch', 'قوس مدبّب', GOTHIC, {
    width: 240,
    height: 320,
    keywords: 'gothic window',
  }),
  F('horseshoe-arch', 'Horseshoe arch', 'قوس حدوة الفرس', HORSESHOE, {
    width: 240,
    height: 320,
    keywords: 'moorish andalusian islamic window',
  }),
  F('ogee-arch', 'Onion arch', 'قوس بصلي', OGEE, {
    width: 240,
    height: 320,
    keywords: 'islamic mosque window ogee',
  }),
  F('lantern', 'Lantern', 'فانوس', lantern(), { width: 220, height: 340, keywords: 'ramadan fanous' }),
  windows(ARCH_TOP, 2, ['Two arches', 'قوسان'], 'arches-2'),
  windows(ARCH_TOP, 3, ['Three arches', 'ثلاثة أقواس'], 'arches-3'),
  windows(OGEE, 3, ['Three onion arches', 'ثلاثة أقواس بصلية'], 'ogee-arches-3'),
  F('door', 'Door', 'باب', 'M0 100V20A20 20 0 0 1 20 0H80A20 20 0 0 1 100 20V100Z', {
    width: 220,
    height: 360,
  }),
];

// ---------------------------------------------------------------------------
// Brush, paper and edges
// ---------------------------------------------------------------------------

/** A rectangle with stamp perforations along every edge (px, at its size). */
export function perforated(width: number, height: number, r: number, step: number): Path {
  const nx = Math.round(width / step);
  const ny = Math.round(height / step);
  const out: Path = [['M', 0, 0]];
  // A round bite into the stamp, centered on its edge; `from` is where it starts (degrees, 0 = up).
  const bite = (cx: number, cy: number, from: number) => {
    const a = onCircle(cx, cy, r, from);
    out.push(['L', a.x, a.y], ...arc(cx, cy, r, from, from - 180));
  };
  for (let i = 1; i < nx; i++) bite((width * i) / nx, 0, 270);
  out.push(['L', width, 0]);
  for (let i = 1; i < ny; i++) bite(width, (height * i) / ny, 0);
  out.push(['L', width, height]);
  for (let i = nx - 1; i > 0; i--) bite((width * i) / nx, height, 90);
  out.push(['L', 0, height]);
  for (let i = ny - 1; i > 0; i--) bite(0, (height * i) / ny, 180);
  out.push(['Z']);
  return out;
}

/** A rectangle with gently wavy (deckled) edges. */
export function deckle(seed: number): Path {
  const rnd = random(seed);
  const points: Vec[] = [];
  const side = (from: [number, number], to: [number, number], n: number) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      const nx = -(to[1] - from[1]);
      const ny = to[0] - from[0];
      const len = Math.hypot(nx, ny);
      const wave = (Math.sin(i * 1.7) * 0.6 + (rnd() - 0.5) * 0.9) * 1.2;
      points.push(pt(x + (nx / len) * wave, y + (ny / len) * wave));
    }
  };
  side([0, 0], [100, 0], 24);
  side([100, 0], [100, 100], 24);
  side([100, 100], [0, 100], 24);
  side([0, 100], [0, 0], 24);
  return smooth(points, 0.8);
}

/** A rectangle torn on all four sides. */
export function tornSheet(seed: number): Path {
  const rnd = random(seed);
  const points: Vec[] = [];
  const side = (from: [number, number], to: [number, number], n: number, depth: number) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const inward = rnd() * depth;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      // Inward normal of a clockwise rectangle.
      const nx = -(to[1] - from[1]);
      const ny = to[0] - from[0];
      const len = Math.hypot(nx, ny);
      points.push(pt(x + (nx / len) * inward, y + (ny / len) * inward));
    }
  };
  side([0, 0], [100, 0], 22, 2.5);
  side([100, 0], [100, 100], 22, 2.5);
  side([100, 100], [0, 100], 22, 2.5);
  side([0, 100], [0, 0], 22, 2.5);
  return polygon(points);
}

function waveRect(periods: number, amplitude: number): Path {
  const top = [];
  const bottom = [];
  const steps = periods * 8;
  for (let i = 0; i <= steps; i++) {
    const x = (100 * i) / steps;
    const y = Math.sin((i / steps) * periods * 2 * Math.PI) * amplitude;
    top.push(pt(x, amplitude + y));
    bottom.push(pt(x, 100 - amplitude + y));
  }
  return polygon([...top, ...bottom.reverse()]);
}

const EDGES: ElementItem[] = [
  F('brush', 'Brush stroke', 'ضربة فرشاة', brushStroke(14, 34), {
    width: 420,
    height: 180,
    keywords: 'paint',
  }),
  F('brush-curved', 'Curved brush stroke', 'ضربة فرشاة منحنية', brushStroke(21, 36, 8), {
    width: 420,
    height: 200,
    keywords: 'paint',
  }),
  F('torn-paper', 'Torn paper', 'ورق ممزّق', tornSheet(4), { width: 360, height: 300, keywords: 'rip' }),
  F('torn-strip', 'Torn strip', 'شريط ممزّق', tornStrip(9, 300, 110, 10), {
    width: 420,
    height: 160,
    keywords: 'rip paper',
  }),
  F('stamp-edge', 'Stamp edge', 'حافة طابع', perforated(300, 360, 9, 24), {
    width: 300,
    height: 360,
    keywords: 'perforated post',
  }),
  F('deckle', 'Deckled edge', 'حافة مموّجة', deckle(3), {
    width: 320,
    height: 380,
    keywords: 'vintage photo wavy',
  }),
  F('wave-edges', 'Wavy edges', 'حواف متموّجة', waveRect(3, 6), { width: 400, height: 300, keywords: 'wave' }),
  F('splash', 'Splash', 'رذاذ', blob(8, 9, 0.62), { keywords: 'paint organic' }),
  F('blob-2', 'Blob 2', 'شكل عضوي ٢', blob(11, 8)),
  F('blob-3', 'Blob 3', 'شكل عضوي ٣', blob(23, 9)),
  F('blob-4', 'Blob 4', 'شكل عضوي ٤', blob(42, 7)),
  F('pebble', 'Pebble', 'حصاة', blob(97, 6, 0.86)),
  F(
    'rough-circle',
    'Ink circle',
    'دائرة حبر',
    polar((t) => 1 + 0.02 * Math.sin(t * 9) + 0.015 * Math.sin(t * 23 + 1), 48),
    {
      keywords: 'brush hand drawn',
    },
  ),
];

// ---------------------------------------------------------------------------
// Letters and numbers
// ---------------------------------------------------------------------------

type Letter = [text: string, path: string, width: number, height: number];

const ARABIC_NAMES: Record<string, string> = {
  ا: 'Alif',
  ب: 'Ba',
  ت: 'Ta',
  ث: 'Tha',
  ج: 'Jim',
  ح: 'Hah',
  خ: 'Kha',
  د: 'Dal',
  ذ: 'Dhal',
  ر: 'Ra',
  ز: 'Zay',
  س: 'Sin',
  ش: 'Shin',
  ص: 'Sad',
  ض: 'Dad',
  ط: 'Tah',
  ظ: 'Zah',
  ع: 'Ain',
  غ: 'Ghain',
  ف: 'Fa',
  ق: 'Qaf',
  ك: 'Kaf',
  ل: 'Lam',
  م: 'Mim',
  ن: 'Nun',
  ه: 'Heh',
  و: 'Waw',
  ي: 'Ya',
  ة: 'Teh marbuta',
  ء: 'Hamza',
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function letterFrame(
  prefix: string,
  [text, path, width, height]: Letter,
  label: [string, string],
  keywords: string,
) {
  const scale = 320 / Math.max(width, height);
  return item(
    `frame:${prefix}-${prefix === 'arabic' ? Object.keys(ARABIC_NAMES).indexOf(text) : text.toLowerCase()}`,
    label[0],
    label[1],
    frame('custom', { width: Math.round(width * scale), height: Math.round(height * scale) }, { path }),
    `frame photo ${keywords} ${text}`,
  );
}

const letters = LETTERS as unknown as { latin: Letter[]; digits: Letter[]; arabic: Letter[] };

const LATIN_LETTERS = letters.latin.map((l) =>
  letterFrame('letter', l, [`Letter ${l[0]}`, `الحرف ${l[0]}`], 'letter alphabet initial'),
);
const DIGITS = letters.digits.map((l) =>
  letterFrame('number', l, [`Number ${l[0]}`, `الرقم ${ARABIC_DIGITS[Number(l[0])]}`], 'number digit'),
);
const ARABIC_LETTERS = letters.arabic.map((l) =>
  letterFrame(
    'arabic',
    l,
    [`Arabic letter ${ARABIC_NAMES[l[0]] ?? l[0]}`, `حرف ${l[0]}`],
    'arabic letter alphabet حرف',
  ),
);

export const FRAME_SECTIONS: ElementSection[] = [
  { id: 'frames-basic', title: { en: 'Shapes', ar: 'أشكال' }, items: BASIC, columns: 4 },
  { id: 'frames-soft', title: { en: 'Soft and playful', ar: 'ناعمة ومرحة' }, items: SOFT, columns: 4 },
  { id: 'frames-arches', title: { en: 'Arches and windows', ar: 'أقواس ونوافذ' }, items: ARCHES, columns: 4 },
  {
    id: 'frames-edges',
    title: { en: 'Brush, paper and edges', ar: 'فرشاة وورق وحواف' },
    items: EDGES,
    columns: 4,
  },
  { id: 'frames-letters', title: { en: 'Letters', ar: 'حروف لاتينية' }, items: LATIN_LETTERS, columns: 4 },
  {
    id: 'frames-arabic',
    title: { en: 'Arabic letters', ar: 'حروف عربية' },
    items: ARABIC_LETTERS,
    columns: 4,
  },
  { id: 'frames-numbers', title: { en: 'Numbers', ar: 'أرقام' }, items: DIGITS, columns: 4 },
];
