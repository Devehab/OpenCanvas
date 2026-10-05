import { SHAPE_KINDS } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { context2d, rasterizePage } from '../src';
import { createScene, para } from './docs';
import { createTestPhoto, createTestRenderer, expectGolden } from './setup';

describe('renderer goldens', () => {
  it('shapes, strokes, gradients, rotation and flips', async () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add } = createScene(measurer, 720, 480, {
      type: 'linear-gradient',
      angle: 135,
      stops: [
        { offset: 0, color: '#f8fafc' },
        { offset: 1, color: '#e0e7ff' },
      ],
    });
    // The first 18 kinds; newer kinds have their own golden below.
    SHAPE_KINDS.slice(0, 18).forEach((shape, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      add({
        type: 'shape',
        shape,
        x: 20 + col * 115,
        y: 20 + row * 150,
        width: 95,
        height: 95,
        sides: 7,
        innerRatio: 0.45,
        cornerRadius: i % 3 === 0 ? 12 : 0,
        rotation: i % 4 === 0 ? 15 : 0,
        flipX: i % 5 === 0,
        fill:
          i % 3 === 0
            ? { type: 'solid', color: '#6d5dfc' }
            : i % 3 === 1
              ? {
                  type: 'linear-gradient',
                  angle: 90,
                  stops: [
                    { offset: 0, color: '#f97316' },
                    { offset: 1, color: '#db2777' },
                  ],
                }
              : {
                  type: 'radial-gradient',
                  cx: 0.5,
                  cy: 0.5,
                  stops: [
                    { offset: 0, color: '#fef08a' },
                    { offset: 1, color: '#16a34a' },
                  ],
                },
        stroke:
          i % 2
            ? { color: '#0f172a', width: 3, style: (['solid', 'dashed', 'dotted'] as const)[i % 3] }
            : null,
        opacity: i === 7 ? 0.5 : 1,
      } as never);
    });
    const { canvas } = rasterizePage(renderer, platform, store, pageId);
    await expectGolden('shapes', canvas);
  });

  it('template, procedural and compound shapes', async () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add } = createScene(measurer, 720, 380);
    SHAPE_KINDS.slice(18).forEach((shape, i) => {
      add({
        type: 'shape',
        shape,
        x: 20 + (i % 6) * 115,
        y: 20 + Math.floor(i / 6) * 120,
        width: 95,
        height: 95,
        sides: 12,
        innerRatio: 0.55,
        cornerRadius: i % 2 ? 10 : 0,
        fill: { type: 'solid', color: i % 2 ? '#0ea5e9' : '#6d5dfc' },
        stroke: i % 3 === 0 ? { color: '#0f172a', width: 3, style: 'solid' } : null,
      } as never);
    });
    const { canvas } = rasterizePage(renderer, platform, store, pageId);
    await expectGolden('shapes-extra', canvas);
  });

  it('typography: wrapping, alignment, Arabic RTL, bidi, lists and effects', async () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add } = createScene(measurer, 800, 620);
    add({
      type: 'text',
      x: 20,
      y: 20,
      width: 360,
      content: {
        paragraphs: [
          para('The quick brown fox jumps over the lazy dog. OpenCanvas lays out text itself.', {
            fontFamily: 'Inter',
          }),
        ],
      },
      style: { fontFamily: 'Inter', fontSize: 22, color: '#111827' },
      align: 'justify',
    } as never);
    add({
      type: 'text',
      x: 420,
      y: 20,
      width: 360,
      align: 'right',
      content: {
        paragraphs: [
          para('مرحبا بكم في أوبن كانفاس، منصة تصميم مفتوحة المصدر تدعم اللغة العربية بشكل حقيقي.'),
        ],
      },
      style: { fontFamily: 'Cairo', fontSize: 22, color: '#0f172a' },
    } as never);
    add({
      type: 'text',
      x: 420,
      y: 180,
      width: 360,
      align: 'right',
      content: { paragraphs: [para('صمّم مع OpenCanvas بسعر 120 ريال فقط (عرض خاص)')] },
      style: { fontFamily: 'Cairo', fontSize: 20, color: '#7c3aed', fontWeight: 700 },
    } as never);
    add({
      type: 'text',
      x: 20,
      y: 180,
      width: 360,
      content: {
        paragraphs: [
          para('Bulleted item one', {}, 'bullet'),
          para('Second bullet item that wraps onto another line', {}, 'bullet'),
          para('Numbered step', {}, 'number'),
          para('Numbered step two', {}, 'number'),
        ],
      },
      style: { fontFamily: 'Inter', fontSize: 18, color: '#1f2937' },
    } as never);
    add({
      type: 'text',
      x: 20,
      y: 360,
      content: {
        paragraphs: [
          {
            runs: [
              { text: 'Bold ', style: { fontWeight: 700 } },
              { text: 'underline ', style: { underline: true, color: '#2563eb' } },
              { text: 'strike ', style: { strikethrough: true } },
              { text: 'S P A C E D', style: { letterSpacing: 200 } },
            ],
            list: 'none',
            indent: 0,
          },
        ],
      },
      sizing: 'auto-width',
      style: { fontFamily: 'Inter', fontSize: 24, color: '#111827' },
    } as never);
    const effects = [
      { type: 'outline', color: '#1d4ed8', width: 3 },
      { type: 'hollow', width: 2 },
      { type: 'background', color: '#fde047', padding: 8, radius: 8 },
      { type: 'neon', color: '#ec4899', intensity: 60 },
      { type: 'echo', color: '#f9731680', offsetX: 5, offsetY: 5 },
    ];
    effects.forEach((effect, i) => {
      add({
        type: 'text',
        x: 20 + (i % 3) * 260,
        y: 440 + Math.floor(i / 3) * 80,
        sizing: 'auto-width',
        content: { paragraphs: [para(i === 2 ? 'خلفية Highlight' : effect.type.toUpperCase())] },
        style: {
          fontFamily: i === 2 ? 'Cairo' : 'Inter',
          fontSize: 34,
          fontWeight: 700,
          color: i === 3 ? '#fdf2f8' : '#111827',
        },
        effect,
      } as never);
    });
    const { canvas } = rasterizePage(renderer, platform, store, pageId);
    await expectGolden('typography', canvas);
  });

  it('images with crop, flip, rounded corners, adjustments and frames', async () => {
    const { platform, measurer, renderer, images } = createTestRenderer();
    const { store, pageId, add, run } = createScene(measurer, 720, 420);
    images.set('asset_photo', createTestPhoto() as never);
    run('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_photo',
        kind: 'image',
        name: 'photo',
        mimeType: 'image/png',
        width: 400,
        height: 300,
        size: 1,
        hash: `sha256-${'0'.repeat(64)}`,
        src: null,
      },
    });
    const base = { type: 'image', assetId: 'asset_photo', width: 200, height: 150 };
    add({ ...base, x: 20, y: 20 } as never);
    add({
      ...base,
      x: 250,
      y: 20,
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
      width: 100,
      height: 150,
      stroke: { color: '#111827', width: 4 },
    } as never);
    add({ ...base, x: 380, y: 20, flipX: true, cornerRadius: 30 } as never);
    add({ ...base, x: 20, y: 200, adjustments: { grayscale: 100, contrast: 30 } } as never);
    add({ ...base, x: 250, y: 200, adjustments: { hue: 120, saturation: 50, vignette: 80 } } as never);
    const frame = add({
      type: 'frame',
      shape: 'ellipse',
      x: 490,
      y: 190,
      width: 200,
      height: 200,
      fill: { type: 'solid', color: '#e2e8f0' },
    } as never);
    add({ ...base, x: -50, y: 0, width: 300, height: 225, rotation: 10 } as never, frame);
    // Missing asset renders a placeholder instead of failing.
    add({ type: 'image', assetId: 'asset_missing', x: 600, y: 20, width: 100, height: 100 } as never);
    const { canvas, stats } = rasterizePage(renderer, platform, store, pageId, { quality: 'export' });
    expect(stats.missingImages).toBe(1);
    await expectGolden('images', canvas);
  });

  it('groups, opacity layers, shadows, blur and blend modes', async () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add, run } = createScene(measurer, 640, 360, { type: 'solid', color: '#f1f5f9' });
    const a = add({
      type: 'shape',
      shape: 'rect',
      x: 40,
      y: 40,
      width: 140,
      height: 140,
      fill: { type: 'solid', color: '#ef4444' },
    } as never);
    const b = add({
      type: 'shape',
      shape: 'ellipse',
      x: 110,
      y: 90,
      width: 140,
      height: 140,
      fill: { type: 'solid', color: '#3b82f6' },
    } as never);
    const group = run('node.group', { ids: [a, b] }).select![0]!;
    // Group opacity must composite as one layer: no overlap darkening.
    run('node.update', { ids: [group], patch: { opacity: 0.5, rotation: -8 } });
    add({
      type: 'shape',
      shape: 'rect',
      x: 320,
      y: 40,
      width: 120,
      height: 120,
      cornerRadius: 18,
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#94a3b8', width: 2 },
      shadow: { color: '#0f172a59', offsetX: 0, offsetY: 12, blur: 24 },
    } as never);
    add({
      type: 'shape',
      shape: 'star',
      x: 480,
      y: 40,
      width: 120,
      height: 120,
      fill: { type: 'solid', color: '#a855f7' },
      blur: 6,
    } as never);
    add({
      type: 'shape',
      shape: 'rect',
      x: 320,
      y: 200,
      width: 280,
      height: 120,
      fill: {
        type: 'linear-gradient',
        angle: 90,
        stops: [
          { offset: 0, color: '#22d3ee' },
          { offset: 1, color: '#facc15' },
        ],
      },
    } as never);
    add({
      type: 'shape',
      shape: 'ellipse',
      x: 380,
      y: 180,
      width: 160,
      height: 160,
      fill: { type: 'solid', color: '#ec4899' },
      blendMode: 'multiply',
    } as never);
    const { canvas, stats } = rasterizePage(renderer, platform, store, pageId);
    expect(stats.layers).toBeGreaterThanOrEqual(1);
    await expectGolden('effects', canvas);
  });

  it('lines with arrowheads and vector paths', async () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add } = createScene(measurer, 600, 320);
    const heads = ['none', 'arrow', 'triangle', 'circle', 'square', 'bar'] as const;
    heads.forEach((head, i) => {
      add({
        type: 'line',
        x: 30,
        y: 30 + i * 40,
        width: 240,
        height: 4,
        startArrow: heads[(i + 3) % heads.length],
        endArrow: head,
        stroke: {
          color: '#0f172a',
          width: 4,
          style: i === 5 ? 'dashed' : 'solid',
          cap: 'round',
          join: 'round',
        },
      } as never);
    });
    add({
      type: 'line',
      x: 300,
      y: 150,
      width: 200,
      height: 6,
      rotation: -30,
      endArrow: 'triangle',
      stroke: { color: '#dc2626', width: 6 },
    } as never);
    // Lucide-style stroked icon (heart) and a filled path with a gradient.
    add({
      type: 'path',
      x: 330,
      y: 20,
      width: 96,
      height: 96,
      path: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
      fill: null,
      stroke: { color: '#e11d48', width: 2, cap: 'round', join: 'round' },
    } as never);
    add({
      type: 'path',
      x: 460,
      y: 20,
      width: 110,
      height: 110,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      path: 'M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z',
      fill: {
        type: 'linear-gradient',
        angle: 180,
        stops: [
          { offset: 0, color: '#fbbf24' },
          { offset: 1, color: '#ea580c' },
        ],
      },
    } as never);
    const { canvas } = rasterizePage(renderer, platform, store, pageId);
    await expectGolden('lines-paths', canvas);
  });
});

describe('renderer behaviour', () => {
  it('is deterministic', () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add } = createScene(measurer);
    add({
      type: 'shape',
      x: 10,
      y: 10,
      rotation: 33,
      shadow: { color: '#000000', offsetX: 3, offsetY: 3, blur: 5 },
    } as never);
    add({
      type: 'text',
      x: 100,
      y: 100,
      content: { paragraphs: [para('Deterministic مرحبا')] },
      style: { fontFamily: 'Inter' },
    } as never);
    const a = rasterizePage(renderer, platform, store, pageId);
    const b = rasterizePage(renderer, platform, store, pageId);
    const da = context2d(a.canvas).getImageData(0, 0, a.width, a.height).data;
    const db = context2d(b.canvas).getImageData(0, 0, b.width, b.height).data;
    expect(Buffer.from(da).equals(Buffer.from(db))).toBe(true);
  });

  it('culls nodes outside the viewport and skips hidden ids', () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId, add } = createScene(measurer);
    const visible = add({ type: 'shape', x: 0, y: 0, width: 50, height: 50 } as never);
    add({ type: 'shape', x: 500, y: 300, width: 50, height: 50 } as never);
    const canvas = platform.createCanvas(600, 400);
    const stats = renderer.renderPage(context2d(canvas), store, pageId, {
      viewport: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(stats).toMatchObject({ drawn: 1, culled: 1 });
    const hidden = renderer.renderPage(context2d(canvas), store, pageId, { hiddenIds: new Set([visible]) });
    expect(hidden.drawn).toBe(1);
  });

  it('honours the scale of rasterization', () => {
    const { platform, measurer, renderer } = createTestRenderer();
    const { store, pageId } = createScene(measurer, 300, 200);
    const r = rasterizePage(renderer, platform, store, pageId, { scale: 2 });
    expect([r.width, r.height]).toEqual([600, 400]);
    const capped = rasterizePage(renderer, platform, store, pageId, { scale: 100, maxPixels: 60_000 });
    expect(capped.width * capped.height).toBeLessThanOrEqual(60_000 * 1.01);
  });
});
