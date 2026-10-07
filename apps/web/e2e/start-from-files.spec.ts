import { expect, test } from './fixtures';
import { samplePdf, samplePng, waitForEditor } from './support';

const designRecords = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const { store } = window.__opencanvas!.editor;
    return store.getPageIds().map((id) => {
      const p = store.getPage(id)!;
      const [image] = store.getChildren(id);
      return {
        width: p.width,
        height: p.height,
        image: image && { type: image.type, width: image.width, height: image.height, locked: image.locked },
      };
    });
  });

test('drop an image on the home screen: a design the size of the image', async ({ page }) => {
  await page.goto('/');
  const png = samplePng(800, 400).toString('base64');
  // Drag and drop a file onto the dashboard.
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'Summer sale.png', { type: 'image/png' }));
    const zone = document.querySelector('[data-testid="dashboard-drop-zone"]')!;
    zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, bubbles: true }));
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  }, png);
  await page.waitForURL(/\/design\/[^/?#]+$/);
  await waitForEditor(page);
  expect(await designRecords(page)).toEqual([
    { width: 800, height: 400, image: { type: 'image', width: 800, height: 400, locked: false } },
  ]);
  expect(await page.evaluate(() => window.__opencanvas!.editor.store.getDocument()?.title)).toBe(
    'Summer sale',
  );
});

test('open a PDF: one editable page per PDF page, same sizes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-file-input').setInputFiles([
    {
      name: 'Brochure.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdf([
        { width: 612, height: 792, rgb: [220, 38, 38] }, // US Letter, red
        { width: 792, height: 612, rgb: [37, 99, 235] }, // landscape, blue
      ]),
    },
  ]);
  await page.waitForURL(/\/design\/[^/?#]+$/, { timeout: 30_000 });
  await waitForEditor(page);
  expect(await designRecords(page)).toEqual([
    { width: 816, height: 1056, image: { type: 'image', width: 816, height: 1056, locked: true } },
    { width: 1056, height: 816, image: { type: 'image', width: 1056, height: 816, locked: true } },
  ]);
  // The rendered page shows the PDF's content (once the layout settled and the page image is drawn).
  const center = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="scene"]')!;
      const { editor } = window.__opencanvas!;
      const p = editor.pageToScreen({ x: 408, y: 528 });
      const r = canvas.getBoundingClientRect();
      const s = canvas.width / r.width;
      const [red, , blue] = canvas
        .getContext('2d')!
        .getImageData(Math.round(p.x * s), Math.round(p.y * s), 1, 1).data;
      return red! > 180 && blue! < 90 ? 'red' : `rgb ${red} … ${blue}`;
    });
  await expect.poll(center).toBe('red');
});

test('files that are neither images nor PDFs are refused with a message', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('open-file-input')
    .setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  await expect(page.getByTestId('toast').filter({ hasText: 'notes.txt' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
