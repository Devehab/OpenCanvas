/**
 * Shared helpers for the end-to-end tests. Tests drive the real UI; these
 * helpers only read the document model (exposed on `window.__opencanvas`)
 * to assert on exact state, and wait until the canvas finished drawing.
 */
import { readFileSync } from 'node:fs';
import type { AnyNodeProps, AnyRecord, Id, NodeRecord } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import type { CanvasView } from '@opencanvas/editor/dom';
import { type Download, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { EditorSession } from '../src/lib/session';

declare global {
  interface Window {
    __opencanvas?: { editor: Editor; view: CanvasView; session: EditorSession };
  }
}

/** Opens the dashboard and creates a design from a format preset. */
export async function createDesign(page: Page, format = 'instagram-post'): Promise<string> {
  await page.goto('/');
  await page.getByTestId(`format-${format}`).click();
  await page.waitForURL(/\/design\/[^/?#]+$/);
  await waitForEditor(page);
  return new URL(page.url()).pathname.split('/').pop()!;
}

export async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__opencanvas?.editor);
  await waitForCanvasIdle(page);
}

/**
 * Waits until the fonts the design uses and its images are loaded and no
 * redraw or font check is pending, for three animation frames in a row.
 * (The view's font check has timeouts, so a font that cannot load, offline
 * for example, never hangs this. The predicate must stay synchronous:
 * waitForFunction treats a returned promise as truthy.)
 */
export async function waitForCanvasIdle(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __ocIdleFrames: number }).__ocIdleFrames = 0;
  });
  await page.waitForFunction(() => {
    const oc = window.__opencanvas;
    const w = window as unknown as { __ocIdleFrames?: number };
    const ready = !!oc && oc.view.idle && oc.session.images.pending === 0;
    w.__ocIdleFrames = ready ? (w.__ocIdleFrames ?? 0) + 1 : 0;
    return w.__ocIdleFrames >= 3;
  });
}

/** Opens a side panel tab (clicking the active tab would collapse the panel). */
export async function openPanel(
  page: Page,
  id: 'elements' | 'text' | 'brand' | 'uploads' | 'layers' | 'plugins',
): Promise<void> {
  const tab = page.getByTestId(`panel-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
}

/** Nodes of the current page in z-order (bottom first), including nested ones. */
export async function getNodes(page: Page): Promise<NodeRecord[]> {
  return page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    const out: NodeRecord[] = [];
    const walk = (parentId: string) => {
      for (const child of editor.store.getChildren(parentId)) {
        out.push(child);
        walk(child.id);
      }
    };
    walk(editor.pageId);
    return out;
  });
}

export async function getSelection(page: Page): Promise<NodeRecord[]> {
  return page.evaluate(() => window.__opencanvas!.editor.getSelectedNodes() as NodeRecord[]);
}

/** Canonical snapshot of every record (sorted by id) for exact comparisons. */
export async function getRecords(page: Page): Promise<AnyRecord[]> {
  return page.evaluate(() =>
    [...window.__opencanvas!.editor.store.getRecords()].sort((a, b) => (a.id < b.id ? -1 : 1)),
  );
}

/** Inserts nodes through the editor API (for scenes the UI would take long to build). */
export async function insertNodes(
  page: Page,
  props: AnyNodeProps[],
  options: { center?: boolean } = {},
): Promise<Id[]> {
  // `unknown` keeps Playwright's serializable-argument types from expanding the node union.
  const arg: { props: unknown; options: { center?: boolean } } = { props, options };
  const ids = await page.evaluate(
    (a) => window.__opencanvas!.editor.insertNodes(a.props as AnyNodeProps[], a.options),
    arg,
  );
  await waitForCanvasIdle(page);
  return ids;
}

/** Screen position (page coordinates of the viewport) of a point on the design page. */
export async function toScreen(
  page: Page,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  return page.evaluate((p) => {
    const { editor, view } = window.__opencanvas!;
    const s = editor.pageToScreen(p);
    const rect = view.scene.getBoundingClientRect();
    return { x: rect.left + s.x, y: rect.top + s.y };
  }, point);
}

/** Center of a node on screen. */
export async function nodeCenter(page: Page, id: Id): Promise<{ x: number; y: number }> {
  return page.evaluate((nodeId) => {
    const { editor, view } = window.__opencanvas!;
    const b = editor.getSelectionBounds([nodeId])!;
    const s = editor.pageToScreen({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const rect = view.scene.getBoundingClientRect();
    return { x: rect.left + s.x, y: rect.top + s.y };
  }, id);
}

export async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export function downloadBytes(download: Download): Promise<Buffer> {
  return download.path().then((p) => readFileSync(p));
}

/** Runs the export dialog and returns the downloaded file. */
export async function exportDesign(
  page: Page,
  type: 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf' | 'pdfPrint' | 'opencanvas',
  options: { scale?: number; transparent?: boolean; pages?: 'all' | 'current' } = {},
): Promise<{ name: string; bytes: Buffer }> {
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-type').click();
  await page.getByTestId(`export-type-${type}`).click();
  if (options.pages) await page.getByTestId(`export-pages-${options.pages}`).click();
  if (options.scale && options.scale !== 1) {
    await page.getByTestId('export-scale-input').fill(String(options.scale));
    await page.getByTestId('export-scale-input').press('Enter');
  }
  if (options.transparent) await page.getByTestId('export-transparent').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId('export-start').click();
  const download = await pending;
  return { name: download.suggestedFilename(), bytes: await downloadBytes(download) };
}

export function decodePng(bytes: Buffer): PNG {
  return PNG.sync.read(bytes);
}

/** Fraction of pixels in a PNG that differ from white/transparent (i.e. "drawn"). */
export function inkRatio(png: PNG): number {
  let ink = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
    if (a > 16 && (r < 235 || g < 235 || b < 235)) ink++;
  }
  return ink / (png.width * png.height);
}

/** A PNG of deterministic noise; noise does not compress, so bytes ≈ width × height × 3. */
export function noisePng(width: number, height: number, seed = 1): Buffer {
  const png = new PNG({ width, height });
  let s = seed >>> 0;
  for (let i = 0; i < png.data.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    png.data[i] = s & 255;
    png.data[i + 1] = (s >>> 8) & 255;
    png.data[i + 2] = (s >>> 16) & 255;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** A small, valid PNG (gradient) generated on the fly. */
export function samplePng(width = 64, height = 48): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      png.data[i] = Math.round((x / width) * 255);
      png.data[i + 1] = Math.round((y / height) * 255);
      png.data[i + 2] = 200;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** Phones show the inspector over the canvas on demand: open it if needed. */
export async function showInspector(page: Page): Promise<void> {
  const toggle = page.getByTestId('toggle-inspector');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-pressed')) !== 'true')
    await toggle.click();
}

/**
 * A minimal valid PDF: one page per size (in points), each filled with a
 * colored rectangle, so imports can be checked without a fixture file.
 */
export function samplePdf(pages: { width: number; height: number; rgb: [number, number, number] }[]): Buffer {
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  for (const [i, p] of pages.entries()) {
    const content = `${p.rgb.map((c) => (c / 255).toFixed(3)).join(' ')} rg 0 0 ${p.width} ${p.height} re f`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Contents ${4 + i * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [i, body] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
