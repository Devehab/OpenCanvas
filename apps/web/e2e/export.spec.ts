import type { AnyNodeProps } from '@opencanvas/core';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  createDesign,
  decodePng,
  exportDesign,
  getNodes,
  inkRatio,
  insertNodes,
  waitForEditor,
} from './support';

/** A page exercising text (Arabic + Latin), gradients, strokes, shadows and lines. */
const SCENE = [
  {
    type: 'shape',
    shape: 'rect',
    x: 0,
    y: 0,
    width: 1080,
    height: 360,
    fill: {
      type: 'linear-gradient',
      angle: 90,
      stops: [
        { offset: 0, color: '#6d5dfc' },
        { offset: 1, color: '#db2777' },
      ],
    },
  },
  {
    type: 'text',
    x: 80,
    y: 100,
    width: 920,
    sizing: 'auto-height',
    align: 'right',
    style: { fontFamily: 'Cairo', fontSize: 72, fontWeight: 700, color: '#ffffff' },
    content: {
      paragraphs: [{ runs: [{ text: 'مرحبا بكم في OpenCanvas', style: {} }], list: 'none', indent: 0 }],
    },
  },
  {
    type: 'text',
    x: 80,
    y: 480,
    width: 920,
    sizing: 'auto-height',
    style: { fontFamily: 'Inter', fontSize: 48, fontWeight: 400, color: '#111827' },
    content: {
      paragraphs: [{ runs: [{ text: 'Every element stays editable.', style: {} }], list: 'none', indent: 0 }],
    },
  },
  {
    type: 'shape',
    shape: 'ellipse',
    x: 120,
    y: 680,
    width: 280,
    height: 280,
    fill: { type: 'solid', color: '#f59e0b' },
    stroke: { color: '#111827', width: 8, style: 'solid', cap: 'butt', join: 'miter' },
    shadow: { color: '#00000040', offsetX: 0, offsetY: 12, blur: 24 },
  },
  { type: 'line', x: 480, y: 820, width: 480, height: 6, endArrow: 'triangle' },
] as unknown as AnyNodeProps[];

async function buildScene(page: Page) {
  await createDesign(page);
  await insertNodes(page, SCENE, { center: false });
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < bytes.length) {
    const marker = bytes[i + 1]!;
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3)
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error('no SOF marker');
}

/** Renders an SVG string to PNG in the browser at the given size. */
async function rasterizeSvg(page: Page, svg: string, width: number, height: number): Promise<PNG> {
  const dataUrl = await page.evaluate(
    async ({ markup, w, h }) => {
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      const img = new Image();
      img.src = url;
      await img.decode();
      // Give embedded fonts a moment to apply inside the SVG image.
      await new Promise((r) => setTimeout(r, 250));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return canvas.toDataURL('image/png');
    },
    { markup: svg, w: width, h: height },
  );
  return PNG.sync.read(Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

test.describe('export', () => {
  test('PNG at 1× and 2× with print DPI metadata @smoke', async ({ page }) => {
    await buildScene(page);
    const one = await exportDesign(page, 'png');
    expect(one.name).toBe('Instagram Post.png');
    const png1 = decodePng(one.bytes);
    expect([png1.width, png1.height]).toEqual([1080, 1080]);
    expect(inkRatio(png1)).toBeGreaterThan(0.3);

    const two = await exportDesign(page, 'png', { scale: 2 });
    const png2 = decodePng(two.bytes);
    expect([png2.width, png2.height]).toEqual([2160, 2160]);
    // pHYs chunk: 2× of 96 DPI = 192 DPI = 7559 px/m.
    const phys = two.bytes.indexOf('pHYs');
    expect(phys).toBeGreaterThan(0);
    expect(two.bytes.readUInt32BE(phys + 4)).toBe(7559);
  });

  test('transparent PNG keeps an empty background transparent', async ({ page }) => {
    await createDesign(page);
    await insertNodes(page, [{ type: 'shape', shape: 'ellipse', x: 340, y: 340, width: 400, height: 400 }], {
      center: false,
    });
    const { bytes } = await exportDesign(page, 'png', { transparent: true });
    const png = decodePng(bytes);
    expect(png.data[3]).toBe(0); // top-left corner
    const center = (540 * png.width + 540) * 4;
    expect(png.data[center + 3]).toBe(255);
  });

  test('JPEG and WebP', async ({ page }) => {
    await buildScene(page);
    const jpg = await exportDesign(page, 'jpeg');
    expect(jpg.name).toBe('Instagram Post.jpg');
    expect([...jpg.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(jpegSize(jpg.bytes)).toEqual({ width: 1080, height: 1080 });

    const webp = await exportDesign(page, 'webp');
    expect(webp.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(webp.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  test('SVG is self-contained and matches the PNG export', async ({ page }) => {
    await buildScene(page);
    const { name, bytes } = await exportDesign(page, 'svg');
    expect(name).toBe('Instagram Post.svg');
    const svg = bytes.toString('utf8');
    expect(svg).toMatch(/^<svg [^>]*width="1080" height="1080"/);
    expect(svg).not.toMatch(/<script|javascript:|https?:\/\/(?!www\.w3\.org)/i);
    // Text stays text (selectable, editable in vector tools), with fonts embedded.
    expect(svg).toContain('OpenCanvas');
    expect(svg).toContain('Every element stays editable.');
    expect(svg).toMatch(/@font-face\{font-family:"Cairo";[^}]*src:url\(data:font\/woff2;base64,/);
    expect(svg).toMatch(/@font-face\{font-family:"Inter";/);

    const png = decodePng((await exportDesign(page, 'png')).bytes);
    const fromSvg = await rasterizeSvg(page, svg, png.width, png.height);
    const diff = new PNG({ width: png.width, height: png.height });
    const different = pixelmatch(png.data, fromSvg.data, diff.data, png.width, png.height, {
      threshold: 0.2,
    });
    const ratio = different / (png.width * png.height);
    test.info().annotations.push({ type: 'svg-vs-png diff', description: `${(ratio * 100).toFixed(2)}%` });
    if (ratio >= 0.02)
      await test.info().attach('svg-diff.png', { body: PNG.sync.write(diff), contentType: 'image/png' });
    expect(ratio).toBeLessThan(0.02);
  });

  test('PDF and print PDF contain one page per design page', async ({ page }) => {
    await buildScene(page);
    await page.getByTestId('add-page').click();
    const pdf = await exportDesign(page, 'pdf');
    expect(pdf.name).toBe('Instagram Post.pdf');
    const text = pdf.bytes.toString('latin1');
    expect(text.startsWith('%PDF-1.')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);

    const print = await exportDesign(page, 'pdfPrint');
    expect(print.bytes.length).toBeGreaterThan(pdf.bytes.length);
    // 1080 px at 96 DPI = 810 pt.
    expect(print.bytes.toString('latin1')).toMatch(/\/MediaBox\s*\[\s*0 0 810 810\s*\]/);
  });

  test('several pages as PNG download as a zip', async ({ page }) => {
    await buildScene(page);
    await page.getByTestId('page-duplicate').click();
    const { name, bytes } = await exportDesign(page, 'png');
    expect(name).toBe('Instagram Post.zip');
    const files = unzipSync(new Uint8Array(bytes));
    expect(Object.keys(files).sort()).toEqual(['Instagram Post-1.png', 'Instagram Post-2.png']);
    for (const data of Object.values(files)) expect(decodePng(Buffer.from(data)).width).toBe(1080);
  });

  test('.opencanvas package round-trips through "Open file"', async ({ page }) => {
    await buildScene(page);
    const before = await getNodes(page);
    const { name, bytes } = await exportDesign(page, 'opencanvas');
    expect(name).toBe('Instagram Post.opencanvas');
    const files = unzipSync(new Uint8Array(bytes));
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    expect(manifest.format).toBe('opencanvas.package');
    expect(Object.keys(files)).toContain('document.json');

    await page.goto('/');
    await page.getByTestId('open-file-input').setInputFiles({
      name,
      mimeType: 'application/vnd.opencanvas+zip',
      buffer: bytes,
    });
    await page.waitForURL(/\/design\//);
    await waitForEditor(page);
    const after = await getNodes(page);
    const shape = (nodes: typeof before) => nodes.map(({ id: _id, parentId: _p, ...rest }) => rest);
    expect(shape(after)).toEqual(shape(before));
  });
});
