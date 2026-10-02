import { expect, test } from '@playwright/test';
import { createDesign, getNodes, getRecords, insertNodes, waitForEditor, waitForSaved } from './support';

const scene = [
  {
    type: 'shape',
    shape: 'star',
    x: 80,
    y: 80,
    width: 240,
    height: 240,
    rotation: 15,
    fill: {
      type: 'linear-gradient',
      angle: 45,
      stops: [
        { offset: 0, color: '#f97316' },
        { offset: 1, color: '#db2777' },
      ],
    },
    shadow: { color: '#0000004d', blur: 12, offsetX: 4, offsetY: 6 },
  },
  {
    type: 'text',
    x: 360,
    y: 120,
    width: 600,
    sizing: 'auto-height',
    align: 'right',
    style: { fontFamily: 'Cairo', fontSize: 48, fontWeight: 700 },
    content: {
      paragraphs: [
        {
          runs: [
            { text: 'تصميم ', style: {} },
            { text: 'OpenCanvas', style: { color: '#6d5dfc' } },
          ],
          list: 'none',
          indent: 0,
        },
        { runs: [{ text: 'قائمة', style: {} }], list: 'bullet', indent: 0 },
      ],
    },
  },
  { type: 'line', x: 100, y: 700, width: 800, height: 4, endArrow: 'triangle' },
] as const;

test.describe('persistence', () => {
  test('autosaves and restores the exact document after reload @smoke', async ({ page }) => {
    await createDesign(page);
    await insertNodes(page, scene as never, { center: false });
    await page.getByTestId('add-page').click();
    await waitForSaved(page);
    const before = await getRecords(page);

    await page.reload();
    await waitForEditor(page);
    expect(await getRecords(page)).toEqual(before);
  });

  test('Ctrl+S writes immediately and the dashboard thumbnail updates', async ({ page }) => {
    await createDesign(page);
    await insertNodes(page, scene as never, { center: false });
    await page.keyboard.press('ControlOrMeta+s');
    await waitForSaved(page);
    await page.goto('/');
    const thumb = page.getByTestId('design-card').first().locator('img');
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveJSProperty('complete', true);
    expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test('keeps saving locally while offline', async ({ page, context }) => {
    await createDesign(page);
    await context.setOffline(true);
    await insertNodes(page, scene as never, { center: false });
    await waitForSaved(page);
    const saved = await page.evaluate(async () => {
      const { session } = window.__opencanvas!;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('opencanvas');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const record = await new Promise<{ snapshot: { records: unknown[] } }>((resolve, reject) => {
        const req = db.transaction('designs').objectStore('designs').get(session.design.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return record.snapshot.records.length;
    });
    // document + page + 3 nodes
    expect(saved).toBe(5);
    await context.setOffline(false);
  });

  test('an idle tab follows edits saved in another tab', async ({ page, context }) => {
    const id = await createDesign(page);
    const other = await context.newPage();
    await other.goto(`/design/${id}`);
    await waitForEditor(other);

    await insertNodes(page, scene as never, { center: false });
    await waitForSaved(page);
    await expect.poll(async () => (await getNodes(other)).length).toBe(3);
    await expect(other.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    expect(await getRecords(other)).toEqual(await getRecords(page));
  });

  test('concurrent edits never overwrite each other; local edits can be kept as a copy', async ({
    page,
    context,
  }) => {
    const id = await createDesign(page);
    const other = await context.newPage();
    await other.goto(`/design/${id}`);
    await waitForEditor(other);

    // Both tabs edit before either saved.
    await page.evaluate(() => {
      window.__opencanvas!.editor.insertNodes([
        { type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100 },
      ]);
    });
    await other.evaluate(() => {
      window.__opencanvas!.editor.insertNodes([
        { type: 'shape', shape: 'ellipse', x: 0, y: 0, width: 100, height: 100 },
      ]);
    });
    await page.evaluate(() => window.__opencanvas!.session.autosave.flush());
    await waitForSaved(page);

    const banner = other.getByTestId('conflict-banner');
    await expect(banner).toBeVisible();
    await other.getByTestId('conflict-keep-copy').click();
    await other.waitForURL((url) => !url.pathname.endsWith(id));
    await waitForEditor(other);
    const copy = await getNodes(other);
    expect(copy.map((n) => (n.type === 'shape' ? n.shape : n.type))).toEqual(['ellipse']);
    await expect(other.getByTestId('design-title-input')).toHaveValue(/^Copy of /);

    // The first tab's version is untouched.
    await page.reload();
    await waitForEditor(page);
    expect((await getNodes(page)).map((n) => (n.type === 'shape' ? n.shape : n.type))).toEqual(['rect']);
  });

  test('a design that does not exist shows a friendly message', async ({ page }) => {
    await page.goto('/design/design_doesnotexist');
    await expect(page.getByText('This design does not exist on this device.')).toBeVisible();
    await page.getByRole('link', { name: 'Back to home' }).click();
    await page.waitForURL((url) => url.pathname === '/');
  });
});
