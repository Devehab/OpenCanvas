import { expect, test } from '@playwright/test';
import { createDesign, getNodes, openPanel, waitForCanvasIdle } from './support';

const pageIds = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__opencanvas!.editor.store.getPageIds());
const currentPage = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__opencanvas!.editor.pageId);

async function choosePageView(page: import('@playwright/test').Page, view: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /Page view/ }).hover();
  await page.getByTestId(`page-view-${view}`).click();
}

test.describe('page views', () => {
  test.beforeEach(async ({ page }) => {
    await createDesign(page);
    await page.getByTestId('add-page').click();
    await page.getByTestId('add-page').click();
    expect(await pageIds(page)).toHaveLength(3);
  });

  test('scroll view stacks pages with a header and actions for each', async ({ page }) => {
    await choosePageView(page, 'scroll');
    await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      editor.zoomTo(0.11);
      editor.setCurrentPage(editor.store.getPageIds()[0]!); // scrolls to the first page
    });
    await waitForCanvasIdle(page);
    const headers = page.getByTestId('page-header');
    await expect(headers).toHaveCount(3);
    // The thumbnail strip is hidden in the scroll view.
    await expect(page.getByTestId('pages-list')).toHaveCount(0);

    // Title the first page and hide it.
    const first = headers.first();
    await first.getByTestId('page-title').fill('Cover');
    await first.getByTestId('page-title').press('Enter');
    await first.getByTestId('page-hide').click();
    const p1 = (await pageIds(page))[0]!;
    expect(await page.evaluate((id) => window.__opencanvas!.editor.store.getPage(id), p1)).toMatchObject({
      name: 'Cover',
      hidden: true,
    });

    // Move the last page up: it becomes the second page.
    const ids = await pageIds(page);
    await headers.nth(2).getByTestId('page-move-up').click();
    expect(await pageIds(page)).toEqual([ids[0], ids[2], ids[1]]);

    // Clicking inside another page makes it current.
    const box = await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      const s = editor.state.get();
      const slot = editor.getPageSlots()[0]!;
      return { x: s.camera.x + slot.x * s.camera.zoom, y: s.camera.y + slot.y * s.camera.zoom };
    });
    const canvas = await page.getByTestId('canvas').boundingBox();
    await page.mouse.click(canvas!.x + box.x + 20, canvas!.y + box.y + 20);
    expect(await currentPage(page)).toBe(ids[0]);
  });

  test('locked pages cannot be changed', async ({ page }) => {
    await page.getByTestId('page-lock').click();
    await openPanel(page, 'elements');
    await page.getByTestId('element-shape-circle').click();
    expect(await getNodes(page)).toHaveLength(0);
    await expect(page.getByTestId('toast')).toContainText(/locked/i);
    await page.getByTestId('page-lock').click();
    await page.getByTestId('element-shape-circle').click();
    expect(await getNodes(page)).toHaveLength(1);
  });

  test('grid view shows every page and opens one on click', async ({ page }) => {
    await page.getByTestId('grid-view').click();
    await expect(page.getByTestId('grid-page')).toHaveCount(3);
    await page.getByTestId('grid-page').first().click();
    await expect(page.getByTestId('page-grid')).toHaveCount(0);
    expect(await currentPage(page)).toBe((await pageIds(page))[0]);
    await expect(page.getByTestId('page-position')).toHaveText('1 / 3');
  });

  test('single page view hides the thumbnails and remembers the choice', async ({ page }) => {
    await page.getByTestId('toggle-thumbnails').click();
    await expect(page.getByTestId('pages-list')).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => !!window.__opencanvas?.editor);
    await expect(page.getByTestId('pages-list')).toHaveCount(0);
    await expect(page.getByTestId('toggle-thumbnails')).toHaveAttribute('aria-pressed', 'false');
  });
});
