/**
 * Lines: straight lines with arrowheads (editable ends), and curves, waves and
 * hand-drawn marks (stroked vector paths: any color and thickness).
 */
import { LINE_ARROW, LINE_DASHED, LINE_DOUBLE_ARROW, LINE_SOLID } from '../element-library';
import { type ElementItem, type ElementSection, item, line } from './builders';
import { onCircle, type Path, pt, random, smoothOpen } from './geometry';
import { strokeLine as L, parse } from './kit';

const STRAIGHT: ElementItem[] = [
  LINE_SOLID,
  LINE_DASHED,
  item('line:dotted', 'Dotted line', 'خط منقّط', line({ style: 'dotted' })),
  item('line:thick', 'Thick line', 'خط عريض', line({ width: 12 })),
  LINE_ARROW,
  item('line:triangle-arrow', 'Arrow (filled head)', 'سهم برأس مصمت', line({ end: 'triangle' })),
  LINE_DOUBLE_ARROW,
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

/** Two short strokes at the end of a curve, along its last direction: an open arrowhead. */
function withHead(curve: Path, size = 18): Path {
  const last = curve[curve.length - 1]!;
  if (last[0] !== 'C') return curve;
  const tip = pt(last[5], last[6]);
  // Direction from the last control point to the end.
  let dx = last[5] - last[3];
  let dy = last[6] - last[4];
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;
  const wing = (sign: number) => {
    const a = (sign * 28 * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return pt(tip.x - size * (dx * cos - dy * sin), tip.y - size * (dx * sin + dy * cos));
  };
  const left = wing(1);
  const right = wing(-1);
  return [...curve, ['M', left.x, left.y], ['L', tip.x, tip.y], ['L', right.x, right.y]];
}

function wave(periods: number, length: number, amplitude: number): Path {
  const points = [];
  for (let i = 0; i <= periods * 4; i++)
    points.push(pt((length * i) / (periods * 4), amplitude - Math.sin((i * Math.PI) / 2) * amplitude));
  return smoothOpen(points);
}

function zigzag(teeth: number, length: number, height: number): Path {
  const out: Path = [['M', 0, height]];
  for (let i = 1; i <= teeth * 2; i++) out.push(['L', (length * i) / (teeth * 2), i % 2 ? 0 : height]);
  return out;
}

function spiral(turns: number, growth: number): Path {
  const points = [];
  for (let i = 0; i <= turns * 12; i++) {
    const angle = i * 30;
    points.push(onCircle(0, 0, 3 + (growth * angle) / 360, angle));
  }
  return smoothOpen(points);
}

function loop(): Path {
  const points = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    points.push(pt(300 * t + 105 * Math.sin(2 * Math.PI * t), 80 - 40 * (1 - Math.cos(2 * Math.PI * t))));
  }
  return smoothOpen(points);
}

/** A loose, hand-drawn loop around something: a little more than one turn. */
function scribbleCircle(): Path {
  const rnd = random(12);
  const points = [];
  for (let i = 0; i <= 15; i++) {
    const angle = -40 + i * 27;
    const r = 1 + (rnd() - 0.5) * 0.08 - i * 0.006;
    const p = onCircle(0, 0, 100 * r, angle);
    points.push(pt(p.x * 1.5, p.y));
  }
  return smoothOpen(points);
}

const CURVES: ElementItem[] = [
  L('curve', 'Curve', 'منحنى', parse('M0 80Q150-80 300 80')),
  L('s-curve', 'S curve', 'منحنى على شكل S', parse('M0 90C110-10 190 190 300 90')),
  L('curved-arrow', 'Curved arrow', 'سهم منحني', withHead(parse('M0 90C60 10 200-10 290 50')), {}, 'arrow'),
  L('s-arrow', 'S-curve arrow', 'سهم متعرّج', withHead(parse('M0 100C110 0 170 180 290 70')), {}, 'arrow'),
  L('loop-arrow', 'Loop arrow', 'سهم بحلقة', withHead(loop()), {}, 'arrow'),
  L(
    'dashed-curve-arrow',
    'Dashed curved arrow',
    'سهم منحني متقطع',
    withHead(parse('M0 90C60 10 200-10 290 50')),
    {
      style: 'dashed',
      cap: 'butt',
    },
    'route path',
  ),
  L('wave', 'Wave', 'موجة', wave(3, 300, 18)),
  L('dotted-wave', 'Dotted wave', 'موجة منقّطة', wave(3, 300, 18), { style: 'dotted' }),
  L('zigzag', 'Zigzag', 'خط متعرّج', zigzag(6, 300, 30), { join: 'miter', cap: 'butt' }),
  L('loop', 'Loop', 'حلقة', loop(), {}, 'curl'),
  L('spiral', 'Spiral', 'لولب', spiral(3, 22), {}, 'swirl'),
  L(
    'underline',
    'Hand-drawn underline',
    'خط سفلي مرسوم باليد',
    parse('M4 26C60 12 170 4 296 14'),
    { width: 6 },
    'swoosh',
  ),
  L(
    'double-underline',
    'Scribbled underline',
    'تسطير مزدوج',
    parse('M2 20C90 10 200 6 298 10C220 14 120 22 40 34'),
    { width: 5 },
    'highlight scribble',
  ),
  L(
    'circle-scribble',
    'Hand-drawn circle',
    'دائرة مرسومة باليد',
    scribbleCircle(),
    { width: 5 },
    'highlight circle around',
  ),
  L(
    'brace',
    'Curly brace',
    'قوس معقوص',
    parse('M0 30C0 15 10 15 30 15H120C140 15 145 10 150 0C155 10 160 15 180 15H270C290 15 300 15 300 30'),
    {},
    'bracket group',
  ),
];

export const LINE_SECTIONS: ElementSection[] = [
  { id: 'lines', title: { en: 'Lines', ar: 'الخطوط' }, items: STRAIGHT, columns: 2 },
  {
    id: 'curves',
    title: { en: 'Curves and hand-drawn', ar: 'منحنيات ورسم يدوي' },
    items: CURVES,
    columns: 2,
  },
];
