/**
 * Mockups: phones, tablets, computers, watches, browser windows and social
 * posts, generic designs (no brand), with the screen as a photo slot.
 */
import type { AnyNodeProps, Fill } from '@opencanvas/core';
import { MOCKUP_BROWSER, MOCKUP_LAPTOP, MOCKUP_PHONE } from '../element-library';
import {
  BRAND,
  browser,
  DEEP_SHADOW,
  type ElementItem,
  type ElementSection,
  frame,
  group,
  INK,
  item,
  laptop,
  linear,
  phone,
  piece,
  SOFT_SHADOW,
} from './builders';
import { poly, svg } from './geometry';
import { parse, placed } from './kit';

const METAL_LIGHT = linear(90, '#b9bcc4', '#eef0f3', '#c9ccd2', '#f4f5f7', '#b5b8c0');
const METAL_DARK = linear(90, '#1f2025', '#45474f', '#26272c', '#4a4c54', '#1f2025');
const GLASS = '#0a0a0c';

const mockup = (id: string, en: string, ar: string, props: AnyNodeProps, keywords: string) =>
  item(`frame:${id}`, en, ar, props, `mockup screen device ${keywords}`);

type Props = Record<string, unknown> & { children?: Props[] };

/** The same device turned on its side: every piece's box transposed (x ↔ y). */
function landscape(device: AnyNodeProps): AnyNodeProps {
  const turn = (p: Props): Props => {
    const fill = p.fill as Fill | null | undefined;
    const out: Props = {
      ...p,
      x: p.y ?? 0,
      y: p.x ?? 0,
      width: p.height,
      height: p.width,
      fill: fill?.type === 'linear-gradient' ? { ...fill, angle: (270 - fill.angle + 360) % 360 } : fill,
    };
    if (p.children) out.children = p.children.map(turn);
    return out;
  };
  return turn(device as unknown as Props) as unknown as AnyNodeProps;
}

function tablet(options: { light?: boolean } = {}): AnyNodeProps {
  const light = options.light ?? true;
  const width = 480;
  const height = 660;
  return group('Tablet', width, height, [
    piece({ x: width - 120, y: 0, width: 60, height: 5 }, light ? '#c2c5cc' : '#2a2b30', {
      cornerRadius: 2,
      name: 'Button',
    }),
    piece({ x: 0, y: 3, width, height: height - 3 }, light ? METAL_LIGHT : METAL_DARK, {
      cornerRadius: 40,
      shadow: DEEP_SHADOW,
      name: 'Body',
    }),
    piece({ x: 4, y: 7, width: width - 8, height: height - 11 }, GLASS, { cornerRadius: 36, name: 'Glass' }),
    frame('rect', { x: 24, y: 27, width: width - 48, height: height - 51 }, { cornerRadius: 18 }),
    piece({ x: width / 2 - 4, y: 13, width: 8, height: 8 }, '#1f2937', { kind: 'ellipse', name: 'Camera' }),
  ]);
}

function foldable(): AnyNodeProps {
  return group('Foldable phone', 560, 520, [
    piece({ x: 0, y: 0, width: 560, height: 520 }, METAL_DARK, {
      cornerRadius: 34,
      shadow: DEEP_SHADOW,
      name: 'Body',
    }),
    piece({ x: 4, y: 4, width: 552, height: 512 }, GLASS, { cornerRadius: 30, name: 'Glass' }),
    frame('rect', { x: 14, y: 14, width: 532, height: 492 }, { cornerRadius: 22 }),
    piece({ x: 279, y: 14, width: 2, height: 492 }, '#ffffff', { opacity: 0.18, name: 'Fold' }),
    piece({ x: 486, y: 30, width: 16, height: 16 }, '#000000', { kind: 'ellipse', name: 'Camera' }),
  ]);
}

function monitor(): AnyNodeProps {
  const stand = placed(poly(290, 400, 350, 400, 362, 486, 278, 486));
  return group('Monitor', 640, 510, [
    piece(
      { x: stand.x, y: stand.y, width: stand.width, height: stand.height },
      linear(90, '#9ca3af', '#e5e7eb', '#9ca3af'),
      {
        path: stand.path,
        name: 'Stand',
      },
    ),
    piece({ x: 200, y: 484, width: 240, height: 22 }, METAL_LIGHT, {
      cornerRadius: 10,
      shadow: SOFT_SHADOW,
      name: 'Foot',
    }),
    piece({ x: 0, y: 0, width: 640, height: 400 }, '#111214', {
      cornerRadius: 16,
      shadow: DEEP_SHADOW,
      name: 'Bezel',
    }),
    frame('rect', { x: 12, y: 12, width: 616, height: 376 }, { cornerRadius: 4 }),
  ]);
}

function allInOne(): AnyNodeProps {
  return group('Desktop', 640, 530, [
    piece({ x: 270, y: 440, width: 100, height: 70 }, linear(90, '#9ca3af', '#e5e7eb', '#9ca3af'), {
      name: 'Stand',
    }),
    piece({ x: 210, y: 504, width: 220, height: 20 }, METAL_LIGHT, {
      cornerRadius: 10,
      shadow: SOFT_SHADOW,
      name: 'Foot',
    }),
    piece({ x: 0, y: 0, width: 640, height: 450 }, METAL_LIGHT, {
      cornerRadius: 18,
      shadow: DEEP_SHADOW,
      name: 'Body',
    }),
    piece({ x: 0, y: 0, width: 640, height: 380 }, GLASS, {
      path: 'M0 18C0 8 8 0 18 0H622C632 0 640 8 640 18V380H0Z',
      name: 'Glass',
    }),
    frame('rect', { x: 14, y: 14, width: 612, height: 352 }, { cornerRadius: 3 }),
  ]);
}

function tv(): AnyNodeProps {
  const foot = (x: number) => {
    const { path, ...box } = placed(poly(x, 420, x + 14, 420, x + 4, 456, x - 22, 456));
    return piece(box, '#2a2b30', { path, name: 'Foot' });
  };
  return group('TV', 720, 456, [
    foot(110),
    foot(598),
    piece({ x: 0, y: 0, width: 720, height: 424 }, '#0f0f12', {
      cornerRadius: 8,
      shadow: DEEP_SHADOW,
      name: 'Bezel',
    }),
    frame('rect', { x: 8, y: 8, width: 704, height: 404 }),
  ]);
}

function watch(round: boolean): AnyNodeProps {
  const strap = linear(90, '#1e293b', '#334155', '#1e293b');
  const size = 220;
  return group(round ? 'Round watch' : 'Watch', size, 340, [
    piece({ x: 50, y: 0, width: 120, height: 90 }, strap, { cornerRadius: 14, name: 'Strap' }),
    piece({ x: 50, y: 250, width: 120, height: 90 }, strap, { cornerRadius: 14, name: 'Strap' }),
    piece({ x: size - 8, y: round ? 140 : 120, width: 12, height: 40 }, '#9ca3af', {
      cornerRadius: 5,
      name: 'Crown',
    }),
    piece({ x: 0, y: round ? 60 : 50, width: size, height: round ? size : 240 }, METAL_DARK, {
      kind: round ? 'ellipse' : 'rect',
      cornerRadius: round ? 0 : 58,
      shadow: DEEP_SHADOW,
      name: 'Case',
    }),
    round
      ? frame('ellipse', { x: 14, y: 74, width: size - 28, height: size - 28 })
      : frame('rect', { x: 14, y: 64, width: size - 28, height: 212 }, { cornerRadius: 46 }),
  ]);
}

function socialPost(): AnyNodeProps {
  const icon = (kind: 'heart' | 'round-bubble', x: number) =>
    piece({ x, y: 488, width: 26, height: 24 }, null, {
      kind,
      stroke: { color: INK, width: 2.4, style: 'solid', cap: 'round', join: 'round' },
      name: 'Icon',
    });
  const share = parse('M2 12L24 2L16 24L12 15Z');
  return group('Social post', 400, 560, [
    piece({ x: 0, y: 0, width: 400, height: 560 }, '#ffffff', {
      cornerRadius: 18,
      shadow: SOFT_SHADOW,
      name: 'Card',
    }),
    frame('ellipse', { x: 16, y: 16, width: 40, height: 40 }),
    piece({ x: 68, y: 22, width: 120, height: 11 }, '#0f172a', { cornerRadius: 5, name: 'Name' }),
    piece({ x: 68, y: 41, width: 80, height: 9 }, '#94a3b8', { cornerRadius: 4, name: 'Place' }),
    frame('rect', { x: 0, y: 72, width: 400, height: 400 }),
    icon('heart', 16),
    icon('round-bubble', 56),
    piece({ x: 96, y: 488, width: 26, height: 24 }, null, {
      path: svg(share),
      stroke: { color: INK, width: 2.4, style: 'solid', cap: 'round', join: 'round' },
      name: 'Icon',
    }),
    piece({ x: 16, y: 526, width: 150, height: 10 }, '#0f172a', { cornerRadius: 5, name: 'Likes' }),
  ]);
}

function story(): AnyNodeProps {
  return group('Story', 360, 640, [
    frame('rect', { x: 0, y: 0, width: 360, height: 640 }, { cornerRadius: 24 }),
    piece({ x: 0, y: 0, width: 360, height: 120 }, linear(180, '#00000066', '#00000000'), {
      path: 'M0 24C0 10.7 10.7 0 24 0H336C349.3 0 360 10.7 360 24V120H0Z',
      name: 'Shade',
    }),
    piece({ x: 14, y: 14, width: 160, height: 4 }, '#ffffff', { cornerRadius: 2, name: 'Progress' }),
    piece({ x: 186, y: 14, width: 160, height: 4 }, '#ffffff', {
      cornerRadius: 2,
      opacity: 0.45,
      name: 'Progress',
    }),
    piece({ x: 14, y: 30, width: 38, height: 38 }, '#ffffff', { kind: 'ellipse', name: 'Avatar ring' }),
    frame('ellipse', { x: 16, y: 32, width: 34, height: 34 }),
    piece({ x: 62, y: 44, width: 96, height: 10 }, '#ffffff', { cornerRadius: 5, name: 'Name' }),
  ]);
}

function videoPlayer(): AnyNodeProps {
  return group('Video', 640, 360, [
    frame('rect', { x: 0, y: 0, width: 640, height: 360 }, { cornerRadius: 14 }),
    piece({ x: 0, y: 260, width: 640, height: 100 }, linear(0, '#000000aa', '#00000000'), {
      path: 'M0 0H640V86C640 93.7 633.7 100 626 100H14C6.3 100 0 93.7 0 86Z',
      name: 'Shade',
    }),
    piece({ x: 280, y: 140, width: 80, height: 80 }, '#ffffff', {
      kind: 'ellipse',
      opacity: 0.92,
      name: 'Play button',
    }),
    piece({ x: 308, y: 162, width: 32, height: 36 }, '#111827', {
      path: svg(poly(0, 0, 32, 18, 0, 36)),
      name: 'Play',
    }),
    piece({ x: 20, y: 326, width: 600, height: 5 }, '#ffffff', {
      cornerRadius: 2.5,
      opacity: 0.45,
      name: 'Track',
    }),
    piece({ x: 20, y: 326, width: 230, height: 5 }, BRAND, { cornerRadius: 2.5, name: 'Progress' }),
    piece({ x: 243, y: 321, width: 15, height: 15 }, '#ffffff', { kind: 'ellipse', name: 'Knob' }),
  ]);
}

const MOCKUPS: ElementItem[] = [
  MOCKUP_PHONE,
  mockup('phone-silver', 'Phone (silver)', 'هاتف فضي', phone({ light: true }), 'mobile smartphone'),
  mockup(
    'phone-punch-hole',
    'Phone with punch-hole camera',
    'هاتف بكاميرا مثقوبة',
    phone({ camera: 'punch-hole', radius: 40 }),
    'mobile smartphone',
  ),
  mockup(
    'phone-notch',
    'Phone with notch',
    'هاتف بنتوء',
    phone({ camera: 'notch', radius: 48 }),
    'mobile smartphone',
  ),
  mockup(
    'phone-classic',
    'Phone with home button',
    'هاتف بزر رئيسي',
    phone({ camera: 'none', homeButton: true, light: true, radius: 46, height: 600 }),
    'mobile smartphone classic',
  ),
  mockup(
    'phone-landscape',
    'Phone (landscape)',
    'هاتف أفقي',
    landscape(phone({ camera: 'punch-hole', radius: 44 })),
    'mobile smartphone horizontal',
  ),
  mockup('foldable', 'Foldable phone', 'هاتف قابل للطي', foldable(), 'mobile fold'),
  mockup('tablet', 'Tablet', 'جهاز لوحي', tablet(), 'pad'),
  mockup('tablet-dark', 'Tablet (dark)', 'جهاز لوحي داكن', tablet({ light: false }), 'pad'),
  mockup('tablet-landscape', 'Tablet (landscape)', 'جهاز لوحي أفقي', landscape(tablet()), 'pad horizontal'),
  MOCKUP_LAPTOP,
  mockup('laptop-dark', 'Laptop (dark)', 'حاسوب محمول داكن', laptop({ light: false }), 'computer notebook'),
  mockup('monitor', 'Monitor', 'شاشة', monitor(), 'desktop computer display'),
  mockup('desktop', 'All-in-one desktop', 'حاسوب مكتبي متكامل', allInOne(), 'computer display'),
  mockup('tv', 'TV', 'تلفاز', tv(), 'television screen'),
  mockup('watch', 'Watch', 'ساعة ذكية', watch(false), 'smartwatch wearable'),
  mockup('watch-round', 'Round watch', 'ساعة ذكية دائرية', watch(true), 'smartwatch wearable'),
  MOCKUP_BROWSER,
  mockup(
    'browser-dark',
    'Browser window (dark)',
    'نافذة متصفح داكنة',
    browser({ dark: true }),
    'website web',
  ),
  mockup('social-post', 'Social media post', 'منشور تواصل اجتماعي', socialPost(), 'feed post social'),
  mockup('story', 'Story', 'قصة', story(), 'reel vertical social'),
  mockup('video', 'Video player', 'مشغل فيديو', videoPlayer(), 'play movie'),
];

export const MOCKUP_SECTIONS: ElementSection[] = [
  { id: 'mockups', title: { en: 'Mockups', ar: 'نماذج أجهزة' }, items: MOCKUPS, columns: 3 },
];
