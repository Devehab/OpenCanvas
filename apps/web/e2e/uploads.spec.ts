import type { ImageNode } from '@opencanvas/core';
import { expect, type Page, test } from '@playwright/test';
import {
  createDesign,
  getNodes,
  insertNodes,
  nodeCenter,
  openPanel,
  samplePng,
  waitForCanvasIdle,
  waitForEditor,
  waitForSaved,
} from './support';

const MALICIOUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" onload="alert(1)">
  <script>alert('xss')</script>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
  <image href="https://tracker.example/pixel.png" width="1" height="1"/>
  <rect width="120" height="80" style="fill:#16a34a"/>
</svg>`;

async function upload(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await openPanel(page, 'uploads');
  await page.getByTestId('upload-input').setInputFiles(files);
}

/** Reads an uploaded asset's stored bytes back from IndexedDB. */
async function storedAssetText(page: Page, hash: string): Promise<string> {
  return page.evaluate(async (h) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('opencanvas');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const record = await new Promise<{ blob: Blob }>((resolve, reject) => {
      const req = db.transaction('assets').objectStore('assets').get(h);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record.blob.text();
  }, hash);
}

test.describe('uploads', () => {
  test.beforeEach(async ({ page }) => {
    await createDesign(page);
  });

  test('uploads an image, inserts it and keeps it after reload @smoke', async ({ page }) => {
    await upload(page, [{ name: 'gradient.png', mimeType: 'image/png', buffer: samplePng(640, 480) }]);
    await expect.poll(async () => (await getNodes(page)).length).toBe(1);
    const [image] = (await getNodes(page)) as ImageNode[];
    expect(image!.type).toBe('image');
    expect(image!.width / image!.height).toBeCloseTo(640 / 480, 2);
    const asset = await page.evaluate((id) => window.__opencanvas!.editor.store.getAsset(id), image!.assetId);
    expect(asset).toMatchObject({ mimeType: 'image/png', width: 640, height: 480 });
    expect(asset!.hash).toMatch(/^sha256-[0-9a-f]{64}$/);
    await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText('Image');

    await waitForSaved(page);
    await page.reload();
    await waitForEditor(page);
    // The image decodes from local storage (nothing pending, nothing failed).
    const loaded = await page.evaluate(async (id) => {
      const { editor, session } = window.__opencanvas!;
      const a = editor.store.getAsset(id)!;
      return (await session.images.load(a)) !== null;
    }, image!.assetId);
    expect(loaded).toBe(true);
  });

  test('deduplicates identical uploads by content hash', async ({ page }) => {
    const png = samplePng(32, 32);
    await upload(page, [{ name: 'a.png', mimeType: 'image/png', buffer: png }]);
    await expect.poll(async () => (await getNodes(page)).length).toBe(1);
    await page
      .getByTestId('upload-input')
      .setInputFiles([{ name: 'b.png', mimeType: 'image/png', buffer: png }]);
    await expect.poll(async () => (await getNodes(page)).length).toBe(2);
    const assets = await page.evaluate(() => window.__opencanvas!.editor.store.getAssets().length);
    expect(assets).toBe(1);
  });

  test('rejects files that are not images, whatever their name says', async ({ page }) => {
    await upload(page, [
      { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('#!/bin/sh\necho not an image\n') },
    ]);
    await expect(page.getByTestId('toast')).toContainText('“photo.png” is not a supported image.');
    expect(await getNodes(page)).toHaveLength(0);
  });

  test('sanitizes SVG uploads before storing them', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await upload(page, [{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(MALICIOUS_SVG) }]);
    await expect.poll(async () => (await getNodes(page)).length).toBe(1);
    const [image] = (await getNodes(page)) as ImageNode[];
    const hash = await page.evaluate(
      (id) => window.__opencanvas!.editor.store.getAsset(id)!.hash,
      image!.assetId,
    );
    const stored = await storedAssetText(page, hash);
    expect(stored).not.toMatch(/script|onload|foreignObject|tracker\.example/i);
    expect(stored).toContain('fill:#16a34a');
    expect(dialogs).toEqual([]);
  });

  test('dropping a photo onto a frame fills the frame', async ({ page }) => {
    await openPanel(page, 'elements');
    await page.getByTestId('element-frame-ellipse').click();
    const [frame] = await getNodes(page);
    const at = await nodeCenter(page, frame!.id);
    const base64 = samplePng(400, 200).toString('base64');
    await page.evaluate(
      ({ b64, x, y }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], 'wide.png', { type: 'image/png' }));
        const target = document.querySelector('[data-testid="canvas"]')!;
        for (const type of ['dragenter', 'dragover', 'drop'])
          target.dispatchEvent(
            new DragEvent(type, {
              dataTransfer: data,
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true,
            }),
          );
      },
      { b64: base64, x: at.x, y: at.y },
    );
    await expect.poll(async () => (await getNodes(page)).length).toBe(2);
    const [outer, child] = await getNodes(page);
    expect(child).toMatchObject({
      type: 'image',
      parentId: outer!.id,
      width: outer!.width,
      height: outer!.height,
    });
    // Cover crop: the wide photo is cropped horizontally to fill the square frame.
    const crop = (child as ImageNode).crop;
    expect(crop.height).toBeCloseTo(1, 5);
    expect(crop.width).toBeLessThan(1);
    // One undo removes the whole drop.
    await page.getByTestId('undo').click();
    expect(await getNodes(page)).toHaveLength(1);
  });

  test('image adjustments re-render without touching the original asset', async ({ page }) => {
    await upload(page, [{ name: 'gradient.png', mimeType: 'image/png', buffer: samplePng(200, 200) }]);
    await expect.poll(async () => (await getNodes(page)).length).toBe(1);
    const [image] = (await getNodes(page)) as ImageNode[];
    const assetBefore = await page.evaluate(
      (id) => window.__opencanvas!.editor.store.getAsset(id),
      image!.assetId,
    );
    const brightness = page.getByTestId('adjust-brightness').getByRole('slider');
    await brightness.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await waitForCanvasIdle(page);
    const [adjusted] = (await getNodes(page)) as ImageNode[];
    expect(adjusted!.adjustments.brightness).toBeGreaterThan(0);
    const assetAfter = await page.evaluate(
      (id) => window.__opencanvas!.editor.store.getAsset(id),
      image!.assetId,
    );
    expect(assetAfter).toEqual(assetBefore);
  });
});

test('images placed through the API render once loaded', async ({ page }) => {
  await createDesign(page);
  await upload(page, [{ name: 'gradient.png', mimeType: 'image/png', buffer: samplePng(100, 100) }]);
  await expect.poll(async () => (await getNodes(page)).length).toBe(1);
  const [image] = (await getNodes(page)) as ImageNode[];
  await insertNodes(page, [{ type: 'image', assetId: image!.assetId, x: 0, y: 0, width: 300, height: 300 }], {
    center: false,
  });
  const pixel = await page.evaluate(() => {
    const { editor, view } = window.__opencanvas!;
    const dpr = view.scene.width / view.scene.getBoundingClientRect().width;
    const p = editor.pageToScreen({ x: 290, y: 150 });
    return [
      ...view.scene.getContext('2d')!.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data,
    ];
  });
  // Right edge of the gradient: red channel high, blue 200.
  expect(pixel[0]).toBeGreaterThan(200);
  expect(pixel[2]).toBeGreaterThan(180);
});
