import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { context2d, rasterizePage } from '@opencanvas/renderer';
import { decodeImage, encodeCanvas } from '@opencanvas/renderer/node';
import { Resvg } from '@resvg/resvg-js';
import { DOMParser } from '@xmldom/xmldom';
import { PDFDocument } from 'pdf-lib';
import pixelmatch from 'pixelmatch';
import { describe, expect, it } from 'vitest';
import {
  exportPageRaster,
  exportPageSvg,
  exportPdf,
  pdfString,
  readImageInfo,
  readPngDpi,
  resolvePageRange,
  safeFileName,
  writePdf,
  zipFiles,
} from '../src';
import { createExportEnv, photo, pixels } from './setup';

function hasBinary(name: string): boolean {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('raster export', () => {
  it('exports PNG at scale with optional transparency', async () => {
    const env = createExportEnv(200, 100);
    env.add({ type: 'shape', x: 50, y: 25, width: 100, height: 50 } as never);
    const opaque = await exportPageRaster(env.ctx, env.pageId, { format: 'png', scale: 2 });
    expect([opaque.width, opaque.height]).toEqual([400, 200]);
    expect(readImageInfo(opaque.data)).toMatchObject({ mimeType: 'image/png', width: 400, height: 200 });
    const transparent = await exportPageRaster(env.ctx, env.pageId, { format: 'png', transparent: true });
    const img = await decodeImage(transparent.data);
    const c = env.platform.createCanvas(img.width, img.height);
    context2d(c).drawImage(img, 0, 0);
    expect(context2d(c).getImageData(0, 0, 1, 1).data[3]).toBe(0); // corner: transparent
    expect(context2d(c).getImageData(100, 50, 1, 1).data[3]).toBe(255); // shape: opaque
  });

  it('exports print resolution with DPI metadata', async () => {
    const env = createExportEnv(96, 48);
    const r = await exportPageRaster(env.ctx, env.pageId, { format: 'png', dpi: 300 });
    expect([r.width, r.height]).toEqual([300, 150]);
    expect(readPngDpi(r.data)).toBe(300);
  });

  it('JPEG quality changes file size; JPEG ignores transparency', async () => {
    const env = createExportEnv(300, 200);
    env.images.set('asset_p', photo(env.platform, 300, 200) as never);
    env.run('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_p',
        kind: 'image',
        name: '',
        mimeType: 'image/png',
        width: 300,
        height: 200,
        size: 1,
        hash: `sha256-${'1'.repeat(64)}`,
        src: null,
      },
    });
    env.add({
      type: 'image',
      assetId: 'asset_p',
      width: 300,
      height: 200,
      adjustments: { vignette: 50 },
    } as never);
    const hi = await exportPageRaster(env.ctx, env.pageId, {
      format: 'jpeg',
      quality: 0.95,
      transparent: true,
    });
    const lo = await exportPageRaster(env.ctx, env.pageId, { format: 'jpeg', quality: 0.3 });
    expect(lo.data.length).toBeLessThan(hi.data.length);
    expect(hi.mimeType).toBe('image/jpeg');
  });

  it('parses page ranges', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(resolvePageRange(ids, '')).toEqual(ids);
    expect(resolvePageRange(ids, '1-2, 4')).toEqual(['a', 'b', 'd']);
    expect(resolvePageRange(ids, '5-3')).toEqual(['c', 'd', 'e']);
    expect(() => resolvePageRange(ids, 'x')).toThrow();
    expect(() => resolvePageRange(ids, '9')).toThrow();
  });

  it('zips multiple files with unique, safe names', () => {
    const zip = zipFiles([
      { name: 'page/1.png', data: new Uint8Array([1]) },
      { name: 'page/1.png', data: new Uint8Array([2]) },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(safeFileName('  عرض: تقديمي / 2026 ')).toBe('عرض تقديمي 2026');
    expect(safeFileName('???')).toBe('design');
  });
});

describe('PDF export', () => {
  it('writes valid multi-page PDFs with physical page sizes', async () => {
    const env = createExportEnv(794, 1123); // A4 at 96 DPI
    env.add({
      type: 'shape',
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      fill: { type: 'solid', color: '#16a34a' },
    } as never);
    env.run('page.create', {});
    env.run('page.create', {});
    const pdf = await exportPdf(env.ctx, env.store.getPageIds(), { dpi: 72 });
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe('%PDF-1.7');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.5, 0); // A4 = 595 × 842 pt
    expect(height).toBeCloseTo(842.25, 0);
    expect(doc.getTitle()).toBe('تصميم Test');
  });

  it('renders the same pixels as the canvas (poppler)', async () => {
    if (!hasBinary('pdftoppm')) return; // poppler-utils not installed
    const env = createExportEnv(200, 120, { type: 'solid', color: '#fef3c7' });
    env.add({
      type: 'shape',
      shape: 'ellipse',
      x: 20,
      y: 10,
      width: 160,
      height: 100,
      fill: {
        type: 'linear-gradient',
        angle: 90,
        stops: [
          { offset: 0, color: '#7c3aed' },
          { offset: 1, color: '#db2777' },
        ],
      },
    } as never);
    const pdf = await exportPdf(env.ctx, [env.pageId], { dpi: 96, imageFormat: 'lossless' });
    const dir = mkdtempSync(join(tmpdir(), 'oc-pdf-'));
    try {
      writeFileSync(join(dir, 'out.pdf'), pdf);
      execFileSync('pdftoppm', ['-r', '96', '-png', '-singlefile', join(dir, 'out.pdf'), join(dir, 'page')]);
      const rendered = await decodeImage(readFileSync(join(dir, 'page.png')));
      expect([rendered.width, rendered.height]).toEqual([200, 120]);
      const a = env.platform.createCanvas(200, 120);
      context2d(a).drawImage(rendered, 0, 0);
      const expected = rasterizePage(env.renderer, env.platform, env.store, env.pageId).canvas;
      // Poppler resamples the page image, so only anti-aliased edges may differ…
      const diff = pixelmatch(pixels(a), pixels(expected), undefined, 200, 120, { threshold: 0.1 });
      expect(diff / (200 * 120)).toBeLessThan(0.01);
      // …while interior colors match exactly (±1).
      const pdfCenter = context2d(a).getImageData(100, 60, 1, 1).data;
      const canvasCenter = context2d(expected).getImageData(100, 60, 1, 1).data;
      for (let i = 0; i < 4; i++) expect(Math.abs(pdfCenter[i]! - canvasCenter[i]!)).toBeLessThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('encodes non-ASCII metadata as UTF-16', () => {
    expect(pdfString('Hi (x)')).toBe('(Hi \\(x\\))');
    expect(pdfString('سلام')).toBe('<FEFF0633064406270645>');
    expect(() => writePdf([])).toThrow();
  });
});

describe('SVG export', () => {
  async function svgPixels(svg: string, width: number, height: number) {
    const png = new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } })
      .render()
      .asPng();
    const env = createExportEnv(width, height);
    const img = await decodeImage(png);
    const c = env.platform.createCanvas(width, height);
    context2d(c).drawImage(img, 0, 0);
    return pixels(c);
  }

  it('produces well-formed SVG that renders like the canvas (non-text scene)', async () => {
    const env = createExportEnv(420, 300, {
      type: 'radial-gradient',
      cx: 0.3,
      cy: 0.3,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#c7d2fe' },
      ],
    });
    env.images.set('asset_p', photo(env.platform, 120, 80) as never);
    env.run('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_p',
        kind: 'image',
        name: '',
        mimeType: 'image/png',
        width: 120,
        height: 80,
        size: 1,
        hash: `sha256-${'2'.repeat(64)}`,
        src: null,
      },
    });
    env.add({
      type: 'shape',
      shape: 'star',
      x: 20,
      y: 20,
      width: 120,
      height: 120,
      rotation: 12,
      fill: {
        type: 'linear-gradient',
        angle: 45,
        stops: [
          { offset: 0, color: '#f59e0b' },
          { offset: 1, color: '#ef4444' },
        ],
      },
      stroke: { color: '#111827', width: 3, style: 'dashed' },
    } as never);
    env.add({
      type: 'shape',
      shape: 'rect',
      x: 180,
      y: 30,
      width: 100,
      height: 80,
      cornerRadius: 16,
      fill: { type: 'solid', color: '#10b98199' },
      flipX: true,
    } as never);
    env.add({
      type: 'image',
      assetId: 'asset_p',
      x: 300,
      y: 20,
      width: 90,
      height: 120,
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      cornerRadius: 12,
    } as never);
    const frame = env.add({
      type: 'frame',
      shape: 'hexagon',
      x: 40,
      y: 160,
      width: 140,
      height: 120,
      fill: { type: 'solid', color: '#1e293b' },
    } as never);
    env.add(
      {
        type: 'shape',
        shape: 'ellipse',
        x: 60,
        y: 40,
        width: 120,
        height: 120,
        fill: { type: 'solid', color: '#38bdf8' },
      } as never,
      frame,
    );
    env.add({
      type: 'line',
      x: 210,
      y: 200,
      width: 180,
      height: 6,
      rotation: -15,
      startArrow: 'circle',
      endArrow: 'triangle',
      stroke: { color: '#7c3aed', width: 6 },
    } as never);
    env.add({
      type: 'path',
      x: 220,
      y: 230,
      width: 48,
      height: 48,
      path: 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5-6.5 4.5 2-7.5L2 9h7z',
      fill: { type: 'solid', color: '#e11d48' },
    } as never);
    const svg = await exportPageSvg(env.store, env.pageId, {
      measurer: env.measurer,
      resolveImage: async () =>
        `data:image/png;base64,${Buffer.from(await encodeCanvas(photo(env.platform, 120, 80), 'png')).toString('base64')}`,
    });
    const errors: string[] = [];
    new DOMParser({ onError: (level, msg) => level !== 'warning' && errors.push(msg) }).parseFromString(
      svg,
      'image/svg+xml',
    );
    expect(errors).toEqual([]);
    const fromSvg = await svgPixels(svg, 420, 300);
    const fromCanvas = pixels(
      rasterizePage(env.renderer, env.platform, env.store, env.pageId, { quality: 'export' }).canvas,
    );
    const diff = pixelmatch(fromSvg, fromCanvas, undefined, 420, 300, { threshold: 0.15 });
    expect(diff / (420 * 300)).toBeLessThan(0.02);
  });

  it('emits positioned, escaped, direction-aware text', async () => {
    const env = createExportEnv(600, 200);
    env.add({
      type: 'text',
      x: 10,
      y: 10,
      width: 500,
      align: 'right',
      content: {
        paragraphs: [{ runs: [{ text: 'مرحبا <OpenCanvas> & 2026', style: {} }], list: 'none', indent: 0 }],
      },
      style: { fontFamily: 'Cairo', fontSize: 30 },
      effect: { type: 'outline', color: '#ff000080', width: 2 },
    } as never);
    const svg = await exportPageSvg(env.store, env.pageId, {
      measurer: env.measurer,
      resolveImage: () => null,
    });
    // Text is escaped. The bidi algorithm keeps '<' with the Arabic run and
    // 'OpenCanvas> & 2026' as one left-to-right run, exactly like a browser.
    expect(svg).toContain('OpenCanvas&gt; &amp; 2026');
    expect(svg).toContain('مرحبا &lt;');
    expect(svg).not.toMatch(/<OpenCanvas/);
    expect(svg).toContain('direction="rtl"');
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('stroke-opacity="0.502"');
    expect(svg).toContain('<title>تصميم Test</title>');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('text').length).toBeGreaterThanOrEqual(2);
  });
});

describe('fixtures directory sanity', () => {
  it('node_modules fonts exist for reproducible rendering', () => {
    expect(
      existsSync(
        new URL('../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2', import.meta.url),
      ),
    ).toBe(true);
  });
});
