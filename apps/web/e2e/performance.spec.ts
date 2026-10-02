import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnyNodeProps } from '@opencanvas/core';
import { expect, type Page, test } from '@playwright/test';
import { createDesign, insertNodes, waitForCanvasIdle, waitForEditor } from './support';

/**
 * Rendering and interaction budgets. Frame times are measured inside the page
 * (scene redraw + gesture update), so they reflect the engine, not test I/O.
 * Budgets are for headless Chromium on CI hardware; real GPUs are faster.
 */
const BUDGETS = [
  { count: 100, redrawMs: 16.7, dragFrameMs: 16.7 },
  { count: 300, redrawMs: 25, dragFrameMs: 25 },
  { count: 500, redrawMs: 33, dragFrameMs: 33 },
  { count: 1000, redrawMs: 50, dragFrameMs: 50 },
];

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

async function measure(page: Page) {
  return page.evaluate(() => {
    const { editor, view } = window.__opencanvas!;
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    // Full scene redraws (e.g. zoom, page switch).
    const redraws: number[] = [];
    for (let i = 0; i < 15; i++) {
      view.invalidateScene();
      view.render();
      redraws.push(view.lastRenderMs);
    }
    // Dragging one element: gesture update + redraw per pointer move.
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
      frames.push(performance.now() - t0);
    }
    editor.pointerUp(input(start.x + 90, start.y + 60));
    // Undo of the drag is a single step.
    const t0 = performance.now();
    editor.undo();
    const undoMs = performance.now() - t0;
    return { redrawMs: median(redraws), dragFrameMs: median(frames), undoMs };
  });
}

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
      await page.reload();
      await waitForEditor(page);
      const openMs = Date.now() - t1;

      const result = { count: budget.count, insertMs, openMs, ...metrics };
      results.push(result);
      test.info().annotations.push({ type: 'metrics', description: JSON.stringify(result) });
      expect(metrics.redrawMs).toBeLessThan(budget.redrawMs);
      expect(metrics.dragFrameMs).toBeLessThan(budget.dragFrameMs);
      expect(metrics.undoMs).toBeLessThan(budget.dragFrameMs);
      expect(openMs).toBeLessThan(10_000);
    });
  }

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern for fixtures
  test.afterAll(({}, testInfo) => {
    if (!results.length) return;
    mkdirSync(testInfo.project.outputDir, { recursive: true });
    writeFileSync(join(testInfo.project.outputDir, 'performance.json'), JSON.stringify(results, null, 2));
  });
});
