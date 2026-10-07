import type { AnyNodeProps } from '@opencanvas/core';
import { expect, type Page, test } from './fixtures';
import { createDesign, exportDesign, insertNodes, waitForCanvasIdle } from './support';

/**
 * Visual regression: the live canvas and the PNG export of fixed scenes are
 * compared with reviewed baselines (`pnpm test:e2e:update` refreshes them).
 * Baselines are Chromium/Linux; other browsers skip these tests.
 */
const PIXEL_TOLERANCE = { maxDiffPixelRatio: 0.01, threshold: 0.2 };

const para = (text: string, list: 'none' | 'bullet' | 'number' = 'none') => ({
  runs: [{ text, style: {} }],
  list,
  indent: 0,
});

const text = (props: Record<string, unknown>, paragraphs: ReturnType<typeof para>[]) =>
  ({ type: 'text', sizing: 'auto-height', content: { paragraphs }, ...props }) as AnyNodeProps;

const TYPOGRAPHY: AnyNodeProps[] = [
  text(
    {
      x: 60,
      y: 40,
      width: 960,
      align: 'right',
      style: { fontFamily: 'Cairo', fontSize: 64, fontWeight: 700, color: '#1e1b4b' },
    },
    [para('التصميم للجميع')],
  ),
  text(
    {
      x: 60,
      y: 140,
      width: 960,
      align: 'justify',
      style: { fontFamily: 'Noto Naskh Arabic', fontSize: 30, color: '#111827' },
    },
    [
      para(
        'منصّة مفتوحة المصدر لإنشاء التصاميم، يبقى فيها كل عنصر قابلًا للتعديل: النصوص والصور والأشكال والطبقات، مع دعم حقيقي للغة العربية من اليوم الأول.',
      ),
    ],
  ),
  text(
    {
      x: 60,
      y: 300,
      width: 960,
      align: 'right',
      style: { fontFamily: 'Cairo', fontSize: 30, color: '#6d28d9' },
    },
    [para('صدر OpenCanvas 1.0 في عام 2026 بدعم كامل للعربية (RTL).')],
  ),
  text(
    {
      x: 560,
      y: 370,
      width: 460,
      align: 'right',
      style: { fontFamily: 'Tajawal', fontSize: 28, color: '#111827' },
    },
    [
      para('نصوص قابلة للتحرير', 'bullet'),
      para('صور وأشكال', 'bullet'),
      para('تصدير بجودة الطباعة', 'bullet'),
    ],
  ),
  text({ x: 60, y: 370, width: 460, style: { fontFamily: 'Inter', fontSize: 26, color: '#111827' } }, [
    para('Editable text', 'number'),
    para('Images and shapes', 'number'),
    para('Print-ready export', 'number'),
  ]),
  text(
    {
      x: 60,
      y: 560,
      width: 960,
      style: { fontFamily: 'Inter', fontSize: 56, fontWeight: 700, color: '#0f172a' },
    },
    [para('Design for everyone')],
  ),
  text(
    {
      x: 60,
      y: 640,
      width: 960,
      style: {
        fontFamily: 'Montserrat',
        fontSize: 28,
        color: '#334155',
        letterSpacing: 120,
        textTransform: 'uppercase',
        underline: true,
      },
    },
    [para('Letter spacing · uppercase · underline')],
  ),
  text(
    {
      x: 60,
      y: 730,
      width: 300,
      effect: { type: 'outline', color: '#db2777', width: 3 },
      style: { fontFamily: 'Bebas Neue', fontSize: 72, color: '#ffffff' },
    },
    [para('OUTLINE')],
  ),
  text(
    {
      x: 380,
      y: 730,
      width: 300,
      effect: { type: 'background', color: '#fde047', padding: 10, radius: 8 },
      style: { fontFamily: 'Lalezar', fontSize: 56, color: '#111827' },
    },
    [para('خلفية')],
  ),
  text(
    {
      x: 720,
      y: 730,
      width: 300,
      effect: { type: 'echo', color: '#6d5dfc80', offsetX: 6, offsetY: 6 },
      style: { fontFamily: 'Pacifico', fontSize: 52, color: '#111827' },
    },
    [para('Echo')],
  ),
  text(
    {
      x: 60,
      y: 880,
      width: 460,
      effect: { type: 'hollow', width: 2 },
      style: { fontFamily: 'Reem Kufi', fontSize: 64, fontWeight: 700, color: '#0f766e' },
    },
    [para('مجوّف')],
  ),
  text(
    {
      x: 560,
      y: 880,
      width: 460,
      effect: { type: 'neon', color: '#ec4899', intensity: 60 },
      style: { fontFamily: 'Poppins', fontSize: 56, fontWeight: 700, color: '#ffffff' },
    },
    [para('Neon')],
  ),
];

const SHAPE_KINDS = [
  'rect',
  'ellipse',
  'triangle',
  'right-triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'heart',
  'arrow-right',
  'arrow-left',
  'chevron',
  'cross',
  'speech-bubble',
  'parallelogram',
  'trapezoid',
] as const;

const SHAPES: AnyNodeProps[] = [
  ...SHAPE_KINDS.map((shape, i) => ({
    type: 'shape' as const,
    shape,
    x: 40 + (i % 6) * 170,
    y: 40 + Math.floor(i / 6) * 170,
    width: 140,
    height: 140,
    cornerRadius: shape === 'rect' ? 24 : 0,
    fill:
      i % 3 === 0
        ? { type: 'solid' as const, color: '#6d5dfc' }
        : i % 3 === 1
          ? {
              type: 'linear-gradient' as const,
              angle: 135,
              stops: [
                { offset: 0, color: '#f97316' },
                { offset: 1, color: '#db2777' },
              ],
            }
          : {
              type: 'radial-gradient' as const,
              cx: 0.5,
              cy: 0.5,
              stops: [
                { offset: 0, color: '#fde68a' },
                { offset: 1, color: '#059669' },
              ],
            },
    stroke:
      i % 4 === 0
        ? {
            color: '#111827',
            width: 6,
            style: (['solid', 'dashed', 'dotted'] as const)[i % 3],
            cap: 'round' as const,
            join: 'round' as const,
          }
        : null,
  })),
  {
    type: 'shape',
    shape: 'ellipse',
    x: 60,
    y: 600,
    width: 260,
    height: 260,
    fill: { type: 'solid', color: '#0ea5e9' },
    shadow: { color: '#0f172a66', offsetX: 10, offsetY: 16, blur: 24 },
  },
  {
    type: 'shape',
    shape: 'rect',
    x: 380,
    y: 600,
    width: 260,
    height: 260,
    fill: {
      type: 'linear-gradient',
      angle: 90,
      stops: [
        { offset: 0, color: '#22c55e' },
        { offset: 1, color: '#eab308' },
      ],
    },
  },
  {
    type: 'shape',
    shape: 'ellipse',
    x: 460,
    y: 680,
    width: 260,
    height: 260,
    opacity: 0.85,
    blendMode: 'multiply',
    fill: { type: 'solid', color: '#ec4899' },
  },
  {
    type: 'shape',
    shape: 'star',
    x: 780,
    y: 600,
    width: 240,
    height: 240,
    rotation: 20,
    sides: 7,
    innerRatio: 0.45,
    blur: 4,
    fill: { type: 'solid', color: '#f59e0b' },
  },
  {
    type: 'shape',
    shape: 'arrow-right',
    x: 780,
    y: 880,
    width: 240,
    height: 120,
    flipX: true,
    fill: { type: 'solid', color: '#334155' },
  },
  {
    type: 'line',
    x: 60,
    y: 960,
    width: 640,
    height: 6,
    startArrow: 'circle',
    endArrow: 'triangle',
    stroke: { color: '#111827', width: 6, style: 'dashed', cap: 'round', join: 'round' },
  },
] as unknown as AnyNodeProps[];

async function canvasPng(page: Page): Promise<Buffer> {
  await page.evaluate(() => window.__opencanvas!.editor.deselectAll());
  await waitForCanvasIdle(page);
  const url = await page.evaluate(() => window.__opencanvas!.view.scene.toDataURL('image/png'));
  return Buffer.from(url.split(',')[1]!, 'base64');
}

test.describe('visual regression @visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Baselines are Chromium-only');

  test('typography: Arabic shaping, bidi, lists and text effects', async ({ page }) => {
    await createDesign(page);
    await insertNodes(page, TYPOGRAPHY, { center: false });
    expect(await canvasPng(page)).toMatchSnapshot('typography-canvas.png', PIXEL_TOLERANCE);
    const { bytes } = await exportDesign(page, 'png');
    expect(bytes).toMatchSnapshot('typography-export.png', PIXEL_TOLERANCE);
  });

  test('shapes, gradients, strokes, shadows, blend modes and lines', async ({ page }) => {
    await createDesign(page);
    await insertNodes(page, SHAPES, { center: false });
    expect(await canvasPng(page)).toMatchSnapshot('shapes-canvas.png', PIXEL_TOLERANCE);
    const { bytes } = await exportDesign(page, 'png');
    expect(bytes).toMatchSnapshot('shapes-export.png', PIXEL_TOLERANCE);
  });

  test('frames clip their content; groups composite opacity', async ({ page }) => {
    await createDesign(page);
    const [frame] = await insertNodes(
      page,
      [
        {
          type: 'frame',
          shape: 'heart',
          x: 140,
          y: 140,
          width: 800,
          height: 800,
          fill: { type: 'solid', color: '#e2e8f0' },
        },
      ] as unknown as AnyNodeProps[],
      { center: false },
    );
    await page.evaluate((parentId) => {
      const { editor } = window.__opencanvas!;
      editor.execute('node.create', {
        parentId,
        nodes: [
          {
            type: 'shape',
            shape: 'rect',
            x: -100,
            y: 300,
            width: 1000,
            height: 200,
            fill: { type: 'solid', color: '#6d5dfc' },
          },
          {
            type: 'shape',
            shape: 'ellipse',
            x: 500,
            y: -100,
            width: 400,
            height: 400,
            fill: { type: 'solid', color: '#f97316' },
          },
        ],
      });
      const [a, b] = editor.insertNodes(
        [
          {
            type: 'shape',
            shape: 'rect',
            x: 40,
            y: 40,
            width: 200,
            height: 200,
            fill: { type: 'solid', color: '#ef4444' },
          },
          {
            type: 'shape',
            shape: 'rect',
            x: 140,
            y: 140,
            width: 200,
            height: 200,
            fill: { type: 'solid', color: '#3b82f6' },
          },
        ],
        { center: false },
      );
      editor.select([a!, b!]);
      editor.groupSelected();
      editor.updateSelected({ opacity: 0.5 });
    }, frame!);
    expect(await canvasPng(page)).toMatchSnapshot('frames-canvas.png', PIXEL_TOLERANCE);
  });
});
