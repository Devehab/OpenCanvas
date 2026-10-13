/**
 * Photo frames: polaroids, prints, framed pictures, stamps, film and photo
 * strips. Each is a group of editable pieces around one or more photo slots.
 */
import type { AnyNodeProps, Fill } from '@opencanvas/core';
import { FRAME_FILM, FRAME_POLAROID, FRAME_POLAROID_TILTED } from '../element-library';
import {
  DEEP_SHADOW,
  type ElementItem,
  type ElementSection,
  filmStrip,
  frame,
  group,
  item,
  linear,
  piece,
  radial,
  SOFT_SHADOW,
} from './builders';
import { deckle, perforated, tornSheet } from './frames';
import { poly, svg } from './geometry';
import { placed } from './kit';

const PAPER = '#ffffff';
const CREAM = '#fbf8f1';

const photo = (id: string, en: string, ar: string, props: AnyNodeProps, keywords = '') =>
  item(`frame:${id}`, en, ar, props, `frame photo ${keywords}`.trim());

/** A strip of tape with torn ends (px, at its size). */
function tape(x: number, y: number, rotation: number, width = 90, color = '#f4e7b0'): AnyNodeProps {
  const h = 30;
  const teeth = [0, 5, 10, 15, 20, 25, 30];
  const right = teeth.flatMap((t, i) => [width - (i % 2 ? 3 : 0), t]);
  const left = [...teeth].reverse().flatMap((t, i) => [i % 2 ? 3 : 0, t]);
  return piece({ x, y, width, height: h }, color, {
    path: svg(poly(...right, ...left)),
    rotation,
    opacity: 0.88,
    name: 'Tape',
  });
}

/** A picture frame: moulding (with a bevel), optional mat, and the photo. */
function framed(options: {
  width: number;
  height: number;
  moulding: Fill;
  bevel: Fill;
  border: number;
  mat?: string;
  matWidth?: number;
  shadow?: boolean;
}): AnyNodeProps {
  const { width, height, border } = options;
  const children: AnyNodeProps[] = [
    piece({ x: 0, y: 0, width, height }, options.moulding, {
      shadow: options.shadow === false ? undefined : DEEP_SHADOW,
      name: 'Frame',
    }),
    piece(
      { x: border * 0.6, y: border * 0.6, width: width - border * 1.2, height: height - border * 1.2 },
      options.bevel,
      { name: 'Bevel' },
    ),
  ];
  let inset = border;
  if (options.mat) {
    children.push(
      piece({ x: border, y: border, width: width - 2 * border, height: height - 2 * border }, options.mat, {
        name: 'Mat',
      }),
    );
    inset += options.matWidth ?? 30;
  }
  children.push(frame('rect', { x: inset, y: inset, width: width - 2 * inset, height: height - 2 * inset }));
  return group('Picture frame', width, height, children);
}

const GOLD = linear(135, '#8a6a1f', '#f3d36b', '#a67c2a', '#f9e08b', '#7a5a17');
const GOLD_BEVEL = linear(315, '#7a5a17', '#e6c25a', '#8a6a1f');
const WOOD = linear(135, '#5b3a1e', '#8b5a2b', '#6b4423', '#9a6a3a', '#4e3018');
const WOOD_BEVEL = linear(315, '#3f2612', '#7a4f28', '#3f2612');

function polaroidWithTape(): AnyNodeProps {
  return group('Polaroid', 300, 376, [
    piece({ x: 0, y: 16, width: 300, height: 360 }, PAPER, { shadow: SOFT_SHADOW, name: 'Paper' }),
    frame('rect', { x: 18, y: 34, width: 264, height: 264 }),
    tape(105, 0, -4),
  ]);
}

function polaroidWithPin(): AnyNodeProps {
  return group('Polaroid', 300, 378, [
    piece({ x: 0, y: 18, width: 300, height: 360 }, PAPER, { shadow: SOFT_SHADOW, name: 'Paper' }),
    frame('rect', { x: 18, y: 36, width: 264, height: 264 }),
    piece({ x: 137, y: 0, width: 28, height: 28 }, radial(0.35, 0.3, '#fca5a5', '#dc2626', '#7f1d1d'), {
      kind: 'ellipse',
      shadow: { color: '#0f172a55', offsetX: 2, offsetY: 4, blur: 6 },
      name: 'Pin',
    }),
  ]);
}

function polaroidStack(): AnyNodeProps {
  const sheet = (rotation: number, color: string) =>
    piece({ x: 30, y: 20, width: 300, height: 360 }, color, { rotation, shadow: SOFT_SHADOW, name: 'Paper' });
  return group('Polaroid stack', 360, 400, [
    sheet(9, '#f1f5f9'),
    sheet(-7, '#f8fafc'),
    sheet(0, PAPER),
    frame('rect', { x: 48, y: 38, width: 264, height: 264 }),
  ]);
}

function photoCorners(): AnyNodeProps {
  const ink = '#1f2937';
  const corner = (x: number, y: number, points: number[]) => {
    const { path, ...box } = placed(poly(...points.map((v, i) => v + (i % 2 ? y : x))));
    return piece(box, ink, { path, name: 'Corner' });
  };
  return group('Photo with corners', 360, 280, [
    piece({ x: 10, y: 10, width: 340, height: 260 }, CREAM, { shadow: SOFT_SHADOW, name: 'Page' }),
    frame('rect', { x: 30, y: 30, width: 300, height: 220 }),
    corner(22, 22, [0, 0, 46, 0, 0, 46]),
    corner(292, 22, [0, 0, 46, 0, 46, 46]),
    corner(22, 212, [0, 0, 46, 46, 0, 46]),
    corner(292, 212, [46, 0, 46, 46, 0, 46]),
  ]);
}

function stamp(): AnyNodeProps {
  return group('Stamp', 300, 360, [
    piece({ x: 0, y: 0, width: 300, height: 360 }, PAPER, {
      path: svg(perforated(300, 360, 9, 24)),
      shadow: SOFT_SHADOW,
      name: 'Stamp',
    }),
    frame('rect', { x: 28, y: 28, width: 244, height: 304 }),
  ]);
}

function postcard(): AnyNodeProps {
  const ink = '#cbd5e1';
  return group('Postcard', 500, 330, [
    piece({ x: 0, y: 0, width: 500, height: 330 }, CREAM, {
      shadow: SOFT_SHADOW,
      cornerRadius: 4,
      name: 'Card',
    }),
    frame('rect', { x: 20, y: 20, width: 270, height: 290 }, { cornerRadius: 3 }),
    piece({ x: 400, y: 26, width: 74, height: 88 }, '#fde68a', {
      path: svg(perforated(74, 88, 3.5, 10)),
      name: 'Stamp',
    }),
    piece({ x: 410, y: 36, width: 54, height: 68 }, '#f59e0b', { name: 'Stamp picture' }),
    piece({ x: 308, y: 30, width: 2, height: 270 }, '#e2e8f0', { name: 'Divider' }),
    ...[176, 216, 256].map((y) => piece({ x: 326, y, width: 150, height: 2 }, ink, { name: 'Line' })),
  ]);
}

function booth(): AnyNodeProps {
  return group('Photo strip', 200, 650, [
    piece({ x: 0, y: 0, width: 200, height: 650 }, PAPER, { shadow: SOFT_SHADOW, name: 'Strip' }),
    ...[0, 1, 2, 3].map((i) => frame('rect', { x: 14, y: 14 + i * 150, width: 172, height: 136 })),
  ]);
}

function tapedPrint(): AnyNodeProps {
  return group(
    'Taped photo',
    380,
    300,
    [
      piece({ x: 20, y: 20, width: 340, height: 260 }, PAPER, { shadow: SOFT_SHADOW, name: 'Print' }),
      frame('rect', { x: 34, y: 34, width: 312, height: 232 }),
      tape(0, 18, -38, 96),
      tape(284, 18, 38, 96),
    ],
    -2,
  );
}

const PHOTO_FRAMES: ElementItem[] = [
  FRAME_POLAROID,
  FRAME_POLAROID_TILTED,
  photo(
    'polaroid-tape',
    'Polaroid with tape',
    'صورة فورية بشريط لاصق',
    polaroidWithTape(),
    'instant scrapbook',
  ),
  photo('polaroid-pin', 'Pinned polaroid', 'صورة فورية مثبّتة بدبوس', polaroidWithPin(), 'instant board'),
  photo('polaroid-stack', 'Polaroid stack', 'كومة صور فورية', polaroidStack(), 'instant pile'),
  photo(
    'instant-square',
    'Instant square',
    'صورة فورية مربعة',
    group(
      'Instant photo',
      280,
      330,
      [
        piece({ x: 0, y: 0, width: 280, height: 330 }, CREAM, {
          shadow: SOFT_SHADOW,
          cornerRadius: 6,
          name: 'Paper',
        }),
        frame('rect', { x: 16, y: 16, width: 248, height: 248 }),
      ],
      4,
    ),
    'instant',
  ),
  photo(
    'instant-mini',
    'Instant mini',
    'صورة فورية صغيرة',
    group('Instant mini', 240, 380, [
      piece({ x: 0, y: 0, width: 240, height: 380 }, PAPER, {
        shadow: SOFT_SHADOW,
        cornerRadius: 6,
        name: 'Paper',
      }),
      frame('rect', { x: 18, y: 18, width: 204, height: 272 }),
    ]),
    'instant tall',
  ),
  photo(
    'white-border',
    'Photo with border',
    'صورة بإطار أبيض',
    group('Bordered photo', 320, 240, [
      piece({ x: 0, y: 0, width: 320, height: 240 }, PAPER, { shadow: SOFT_SHADOW, name: 'Border' }),
      frame('rect', { x: 14, y: 14, width: 292, height: 212 }),
    ]),
    'print',
  ),
  photo('taped-print', 'Taped print', 'صورة بشريطين لاصقين', tapedPrint(), 'scrapbook tape'),
  photo('photo-corners', 'Album photo', 'صورة ألبوم', photoCorners(), 'scrapbook corners vintage'),
  photo(
    'gold-frame',
    'Gold frame',
    'إطار ذهبي',
    framed({
      width: 340,
      height: 420,
      moulding: GOLD,
      bevel: GOLD_BEVEL,
      border: 26,
      mat: CREAM,
      matWidth: 26,
    }),
    'classic museum picture',
  ),
  photo(
    'wood-frame',
    'Wooden frame',
    'إطار خشبي',
    framed({ width: 340, height: 420, moulding: WOOD, bevel: WOOD_BEVEL, border: 28 }),
    'picture classic',
  ),
  photo(
    'gallery-frame',
    'Gallery frame',
    'إطار معرض',
    framed({
      width: 340,
      height: 420,
      moulding: { type: 'solid', color: '#111111' },
      bevel: { type: 'solid', color: '#262626' },
      border: 16,
      mat: '#ffffff',
      matWidth: 40,
    }),
    'black mat museum picture',
  ),
  photo(
    'white-frame',
    'White frame',
    'إطار أبيض',
    framed({
      width: 340,
      height: 420,
      moulding: linear(135, '#ffffff', '#e5e7eb', '#ffffff'),
      bevel: { type: 'solid', color: '#f1f5f9' },
      border: 18,
      mat: '#fafaf9',
      matWidth: 34,
    }),
    'modern mat picture',
  ),
  photo(
    'double-border',
    'Classic print',
    'صورة بإطار مزدوج',
    group('Classic print', 340, 420, [
      piece({ x: 0, y: 0, width: 340, height: 420 }, PAPER, { shadow: SOFT_SHADOW, name: 'Paper' }),
      piece({ x: 20, y: 20, width: 300, height: 380 }, null, {
        stroke: { color: '#94a3b8', width: 2, style: 'solid', cap: 'butt', join: 'miter' },
        name: 'Border',
      }),
      frame('rect', { x: 34, y: 34, width: 272, height: 352 }),
    ]),
    'vintage',
  ),
  photo(
    'rounded-border',
    'Rounded print',
    'صورة بزوايا مستديرة',
    group('Rounded print', 320, 320, [
      piece({ x: 0, y: 0, width: 320, height: 320 }, PAPER, {
        cornerRadius: 40,
        shadow: SOFT_SHADOW,
        name: 'Border',
      }),
      frame('rect', { x: 16, y: 16, width: 288, height: 288 }, { cornerRadius: 28 }),
    ]),
  ),
  photo(
    'circle-border',
    'Circle with border',
    'دائرة بإطار',
    group('Circle print', 320, 320, [
      piece({ x: 0, y: 0, width: 320, height: 320 }, PAPER, {
        kind: 'ellipse',
        shadow: SOFT_SHADOW,
        name: 'Border',
      }),
      frame('ellipse', { x: 14, y: 14, width: 292, height: 292 }),
    ]),
    'profile avatar',
  ),
  photo(
    'arch-border',
    'Arch with border',
    'قوس بإطار',
    group('Arch print', 260, 340, [
      piece({ x: 0, y: 0, width: 260, height: 340 }, PAPER, {
        kind: 'arch',
        shadow: SOFT_SHADOW,
        name: 'Border',
      }),
      frame('arch', { x: 14, y: 14, width: 232, height: 312 }),
    ]),
  ),
  photo('stamp', 'Postage stamp', 'طابع بريد', stamp(), 'post perforated'),
  photo('postcard', 'Postcard', 'بطاقة بريدية', postcard(), 'post travel mail'),
  photo(
    'torn-photo',
    'Torn paper photo',
    'صورة على ورق ممزّق',
    group('Torn print', 340, 300, [
      piece({ x: 0, y: 0, width: 340, height: 300 }, PAPER, {
        path: svg(tornSheet(17)),
        shadow: SOFT_SHADOW,
        name: 'Paper',
      }),
      frame('rect', { x: 26, y: 26, width: 288, height: 248 }),
    ]),
    'rip scrapbook',
  ),
  photo(
    'deckle-photo',
    'Vintage photo',
    'صورة قديمة',
    group('Vintage print', 320, 380, [
      piece({ x: 0, y: 0, width: 320, height: 380 }, '#f5efe0', {
        path: svg(deckle(8)),
        shadow: SOFT_SHADOW,
        name: 'Paper',
      }),
      frame('rect', { x: 24, y: 24, width: 272, height: 332 }),
    ]),
    'retro deckle wavy',
  ),
  photo(
    'slide',
    'Slide',
    'شريحة فيلم',
    group('Slide', 300, 300, [
      piece({ x: 0, y: 0, width: 300, height: 300 }, '#f1f5f9', {
        cornerRadius: 20,
        shadow: SOFT_SHADOW,
        name: 'Mount',
      }),
      frame('rect', { x: 50, y: 84, width: 200, height: 132 }, { cornerRadius: 6 }),
    ]),
    '35mm film slide',
  ),
  photo('photo-strip', 'Photo booth strip', 'شريط صور', booth(), 'booth four'),
  FRAME_FILM,
  photo('film-2', 'Film strip (2)', 'شريط فيلم مزدوج', filmStrip(2), 'film negative cinema'),
];

export const PHOTO_FRAME_SECTIONS: ElementSection[] = [
  { id: 'photo-frames', title: { en: 'Photo frames', ar: 'إطارات صور' }, items: PHOTO_FRAMES, columns: 3 },
];
