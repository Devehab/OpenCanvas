import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnyNodeProps } from '@opencanvas/core';
import { expect, type Page, test } from './fixtures';
import {
  createDesign,
  decodePng,
  exportDesign,
  insertNodes,
  noisePng,
  openPanel,
  waitForCanvasIdle,
  waitForEditor,
} from './support';

/**
 * Rendering and interaction budgets. Frame times are measured inside the page
 * (scene redraw + gesture update), so they reflect the engine, not test I/O.
 * Budgets are for headless Chromium on CI hardware; real GPUs are faster.
 */
/**
 * Targets from the product spec: 100 objects at 60 FPS, 300 smooth, 500+ usable.
 * `PERF_BUDGET_SCALE` (e.g. 1.5) relaxes every budget on slower machines.
 */
const SCALE = Number(process.env.PERF_BUDGET_SCALE ?? 1) || 1;
const BUDGETS = [
  { count: 100, redrawMs: 16.7, dragFrameMs: 16.7, minFps: 50 },
  { count: 300, redrawMs: 25, dragFrameMs: 25, minFps: 30 },
  { count: 500, redrawMs: 33, dragFrameMs: 33, minFps: 24 },
  { count: 1000, redrawMs: 50, dragFrameMs: 50, minFps: 15 },
].map((b) => ({
  ...b,
  redrawMs: b.redrawMs * SCALE,
  dragFrameMs: b.dragFrameMs * SCALE,
  minFps: b.minFps / SCALE,
}));
const ms = (budget: number) => budget * SCALE;

function scene(count: number): AnyNodeProps[] {
  const kinds = ['rect', 'ellipse', 'star', 'hexagon', 'heart'] as const;
  const nodes: AnyNodeProps[] = [];
  const cols = Math.ceil(Math.sqrt(count));
  const cell = 1080 / cols;
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    if (i % 5 === 4) {
      nodes.push({
        type: 'text',
        x,
        y,
        width: cell,
        sizing: 'auto-height',
        style: { fontFamily: i % 10 === 4 ? 'Cairo' : 'Inter', fontSize: Math.max(8, cell / 5) },
        content: {
          paragraphs: [
            {
              runs: [{ text: i % 10 === 4 ? `عنصر ${i}` : `Item ${i}`, style: {} }],
              list: 'none',
              indent: 0,
            },
          ],
        },
      } as AnyNodeProps);
    } else {
      nodes.push({
        type: 'shape',
        shape: kinds[i % kinds.length],
        x,
        y,
        width: cell * 0.8,
        height: cell * 0.8,
        rotation: (i * 7) % 45,
        fill: { type: 'solid', color: ['#6d5dfc', '#ef4444', '#10b981', '#f59e0b'][i % 4]! },
        ...(i % 3 === 0
          ? { stroke: { color: '#111827', width: 2, style: 'solid', cap: 'butt', join: 'miter' } }
          : {}),
        ...(i % 7 === 0 ? { shadow: { color: '#00000040', offsetX: 2, offsetY: 4, blur: 8 } } : {}),
      } as AnyNodeProps);
    }
  }
  return nodes;
}

/**
 * Frame costs measured inside the page. Canvas 2D records drawing commands and
 * rasterizes them later, so every timed frame ends with a 1-pixel readback,
 * which waits for the pixels: the numbers include rasterization.
 */
async function measure(page: Page) {
  return page.evaluate(async () => {
    const { editor, view } = window.__opencanvas!;
    const ctx = view.scene.getContext('2d')!;
    const flush = () => ctx.getImageData(0, 0, 1, 1);
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    flush();

    // Full scene redraws (zoom, page switch, image loaded).
    const redraws: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      view.invalidateScene();
      view.render();
      flush();
      redraws.push(performance.now() - t0);
    }

    // Dragging one element: gesture update + redraw + raster per pointer move.
    const target = editor.store.getChildren(editor.pageId)[0]!;
    const b = editor.getSelectionBounds([target.id])!;
    const start = editor.pageToScreen({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const input = (x: number, y: number) => ({
      point: { x, y },
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });
    const frames: number[] = [];
    editor.pointerDown(input(start.x, start.y));
    for (let i = 1; i <= 30; i++) {
      const t0 = performance.now();
      editor.pointerMove(input(start.x + i * 3, start.y + i * 2));
      view.render();
      flush();
      frames.push(performance.now() - t0);
    }
    editor.pointerUp(input(start.x + 90, start.y + 60));
    const t0 = performance.now();
    editor.undo();
    const undoMs = performance.now() - t0;

    // Real frame rate while dragging: one pointer move per animation frame,
    // drawn by the view's own requestAnimationFrame loop. The first frames
    // only warm up (code compiled, caches filled); the rate comes from the
    // median frame interval, so a single hitch from another process (other
    // tests run in parallel) does not count, while steady slowness does.
    const fps = await new Promise<number>((resolve) => {
      const warmup = 20;
      const total = 60;
      let frame = 0;
      let last = 0;
      const intervals: number[] = [];
      editor.pointerDown(input(start.x, start.y));
      const tick = (time: number) => {
        if (frame > warmup) intervals.push(time - last);
        last = time;
        if (frame > 0) editor.pointerMove(input(start.x + (frame % 40) * 2, start.y + (frame % 40)));
        flush();
        if (frame++ < warmup + total) requestAnimationFrame(tick);
        else {
          editor.pointerUp(input(start.x, start.y));
          resolve(1000 / median(intervals));
        }
      };
      requestAnimationFrame(tick);
    });
    editor.undo();
    return { redrawMs: median(redraws), dragFrameMs: median(frames), undoMs, fps };
  });
}

// Trace recording (screencast, snapshots) costs frames; measure the app, not the instrumentation.
test.use({ trace: 'off', video: 'off' });

test.describe('performance @perf', () => {
  test.describe.configure({ mode: 'serial' });
  const results: Record<string, unknown>[] = [];

  for (const budget of BUDGETS) {
    test(`${budget.count} elements stay within the frame budget`, async ({ page }) => {
      test.setTimeout(120_000);
      await createDesign(page);
      const t0 = Date.now();
      await insertNodes(page, scene(budget.count), { center: false });
      const insertMs = Date.now() - t0;
      await waitForCanvasIdle(page);
      expect(
        await page.evaluate(
          () => window.__opencanvas!.editor.store.getChildren(window.__opencanvas!.editor.pageId).length,
        ),
      ).toBe(budget.count);

      const metrics = await measure(page);

      // Opening the saved design again (load + layout + first render).
      await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
        timeout: 30_000,
      });
      const t1 = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForEditor(page);
      const openMs = Date.now() - t1;

      const result = { count: budget.count, insertMs, openMs, ...metrics };
      results.push(result);
      test.info().annotations.push({ type: 'metrics', description: JSON.stringify(result) });
      expect(metrics.redrawMs).toBeLessThan(budget.redrawMs);
      expect(metrics.dragFrameMs).toBeLessThan(budget.dragFrameMs);
      expect(metrics.undoMs).toBeLessThan(budget.dragFrameMs);
      expect(metrics.fps).toBeGreaterThan(budget.minFps);
      expect(openMs).toBeLessThan(ms(10_000));
    });
  }

  test('exports a 4K PNG of a busy slide', async ({ page }) => {
    test.setTimeout(120_000);
    await createDesign(page, 'presentation');
    await insertNodes(page, scene(300), { center: false });
    const t0 = Date.now();
    const { bytes } = await exportDesign(page, 'png', { scale: 2 });
    const exportMs = Date.now() - t0;
    const png = decodePng(bytes);
    expect([png.width, png.height]).toEqual([3840, 2160]);
    const result = { scenario: '4K PNG export, 300 elements', exportMs, bytes: bytes.length };
    results.push(result);
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify(result) });
    expect(exportMs).toBeLessThan(ms(15_000));
  });

  test('a 100-page document opens, switches pages and exports to PDF', async ({ page }) => {
    test.setTimeout(300_000);
    await createDesign(page);
    await insertNodes(page, scene(20), { center: false });
    await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      const first = editor.pageId;
      for (let i = 0; i < 99; i++) editor.execute('page.duplicate', { id: first });
    });
    const pageCount = () => page.evaluate(() => window.__opencanvas!.editor.store.getPageIds().length);
    expect(await pageCount()).toBe(100);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
      timeout: 60_000,
    });

    const t1 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForEditor(page);
    const openMs = Date.now() - t1;
    expect(await pageCount()).toBe(100);

    // Switching pages: camera fit + full redraw of the new page.
    const switchMs = await page.evaluate(() => {
      const { editor, view } = window.__opencanvas!;
      const ids = editor.store.getPageIds();
      const times: number[] = [];
      for (let i = 1; i <= 20; i++) {
        const t = performance.now();
        editor.setCurrentPage(ids[i * 4]!);
        view.render();
        times.push(performance.now() - t);
      }
      return times.sort((a, b) => a - b)[10]!;
    });

    const t2 = Date.now();
    const { bytes } = await exportDesign(page, 'pdf');
    const pdfMs = Date.now() - t2;
    expect(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(100);

    const result = { scenario: '100 pages × 20 elements', openMs, switchMs, pdfMs, pdfBytes: bytes.length };
    results.push(result);
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify(result) });
    expect(openMs).toBeLessThan(ms(10_000));
    expect(switchMs).toBeLessThan(ms(50));
    expect(pdfMs).toBeLessThan(ms(120_000));
  });

  test('a 10 MB photo uploads quickly and keeps editing fluid', async ({ page }) => {
    test.setTimeout(120_000);
    await createDesign(page);
    const photo = noisePng(2000, 1600);
    expect(photo.length).toBeGreaterThan(9_000_000);
    await openPanel(page, 'uploads');
    const t0 = Date.now();
    await page
      .getByTestId('upload-input')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__opencanvas!.editor.store.getChildren(window.__opencanvas!.editor.pageId).length,
          ),
        { timeout: 30_000 },
      )
      .toBe(1);
    await waitForCanvasIdle(page);
    const uploadMs = Date.now() - t0;
    const metrics = await measure(page);
    const result = { scenario: '10 MB image', uploadMs, bytes: photo.length, ...metrics };
    results.push(result);
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify(result) });
    expect(uploadMs).toBeLessThan(ms(15_000));
    expect(metrics.dragFrameMs).toBeLessThan(ms(33));
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern for fixtures
  test.afterAll(({}, testInfo) => {
    if (!results.length) return;
    mkdirSync(testInfo.project.outputDir, { recursive: true });
    writeFileSync(join(testInfo.project.outputDir, 'performance.json'), JSON.stringify(results, null, 2));
  });
});
