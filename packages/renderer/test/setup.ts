import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { expect } from 'vitest';
import { type CanvasLike, context2d, createCanvasMeasurer, MapImageResolver, SceneRenderer } from '../src';
import { createNodePlatform, decodeImage, encodeCanvas, registerFont } from '../src/node';

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, '../node_modules/@fontsource');

let fontsRegistered = false;
export function registerTestFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const weight of [400, 700]) {
    registerFont(join(fontsDir, `inter/files/inter-latin-${weight}-normal.woff2`), 'Inter');
    registerFont(join(fontsDir, `cairo/files/cairo-arabic-${weight}-normal.woff2`), 'Cairo');
    registerFont(join(fontsDir, `cairo/files/cairo-latin-${weight}-normal.woff2`), 'Cairo Latin');
  }
}

/** Fallback chain that only uses bundled fonts, so goldens never depend on system fonts. */
export const TEST_FALLBACKS = ['Cairo Latin', 'Cairo'];

export function createTestRenderer() {
  registerTestFonts();
  const platform = createNodePlatform();
  const measurer = createCanvasMeasurer(platform, TEST_FALLBACKS);
  const images = new MapImageResolver();
  const renderer = new SceneRenderer(platform, images, measurer);
  return { platform, measurer, images, renderer };
}

const UPDATE = process.env.OPENCANVAS_UPDATE_GOLDENS === '1';

/**
 * Compares a canvas against `__goldens__/<name>.png`. Missing goldens are
 * written locally but fail on CI. On mismatch, `.actual.png` and `.diff.png`
 * are written next to the golden for inspection.
 */
export async function expectGolden(
  name: string,
  canvas: CanvasLike,
  { threshold = 0.1, maxDiffRatio = 0.001 }: { threshold?: number; maxDiffRatio?: number } = {},
): Promise<void> {
  const dir = join(here, '__goldens__');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.png`);
  const png = await encodeCanvas(canvas, 'png');
  if (UPDATE || !existsSync(file)) {
    if (!UPDATE && process.env.CI)
      throw new Error(`Missing golden image ${name}.png — run "pnpm test:visual:update" and commit it`);
    writeFileSync(file, png);
    return;
  }
  const expectedImage = await decodeImage(readFileSync(file));
  const { width, height } = canvas;
  expect([expectedImage.width, expectedImage.height], `${name}: size`).toEqual([width, height]);
  const platform = createNodePlatform();
  const scratch = platform.createCanvas(width, height);
  const sctx = context2d(scratch);
  sctx.drawImage(expectedImage, 0, 0);
  const expected = sctx.getImageData(0, 0, width, height).data;
  const actual = context2d(canvas).getImageData(0, 0, width, height).data;
  const diffCanvas = platform.createCanvas(width, height);
  const dctx = context2d(diffCanvas);
  const diff = dctx.createImageData(width, height);
  const mismatched = pixelmatch(actual, expected, diff.data, width, height, { threshold });
  const ratio = mismatched / (width * height);
  if (ratio > maxDiffRatio) {
    writeFileSync(join(dir, `${name}.actual.png`), png);
    dctx.putImageData(diff, 0, 0);
    writeFileSync(join(dir, `${name}.diff.png`), await encodeCanvas(diffCanvas, 'png'));
  }
  expect(
    ratio,
    `${name}: ${mismatched} pixels differ (see __goldens__/${name}.diff.png)`,
  ).toBeLessThanOrEqual(maxDiffRatio);
}

/** Procedural test photo: gradient sky, sun, hills and a checker strip — no binary fixtures needed. */
export function createTestPhoto(width = 400, height = 300): CanvasLike {
  const platform = createNodePlatform();
  const canvas = platform.createCanvas(width, height);
  const ctx = context2d(canvas);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#2563eb');
  sky.addColorStop(1, '#f9a8d4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(width * 0.7, height * 0.35, height * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.quadraticCurveTo(width * 0.3, height * 0.4, width * 0.6, height * 0.8);
  ctx.quadraticCurveTo(width * 0.8, height * 0.6, width, height * 0.75);
  ctx.lineTo(width, height);
  ctx.fill();
  for (let i = 0; i < width / 20; i++) {
    ctx.fillStyle = i % 2 ? '#111827' : '#f9fafb';
    ctx.fillRect(i * 20, height - 16, 20, 16);
  }
  return canvas;
}

export function writeDebug(name: string, data: Uint8Array): void {
  writeFileSync(join(here, '__goldens__', name), data);
}
