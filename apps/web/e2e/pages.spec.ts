import { expect, test } from './fixtures';
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

  test('scroll view: the wheel scrolls everywhere, also over page headers and rulers', async ({ page }) => {
    await choosePageView(page, 'scroll');
    await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      editor.zoomTo(0.4);
      editor.setCurrentPage(editor.store.getPageIds()[0]!);
    });
    await waitForCanvasIdle(page);
    const header = page.getByTestId('page-header').nth(1);
    const headerY = async () => (await header.boundingBox())!.y;
    // Over a page title (an input) and over the page actions alike: the pages move up.
    for (const target of [header.getByTestId('page-title'), header.getByTestId('page-lock')]) {
      const box = (await target.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const before = await headerY();
      await page.mouse.wheel(0, 120);
      await expect.poll(headerY).toBeLessThan(before - 40);
    }
    // The page under the middle of the view becomes the current page while scrolling.
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 200);
    await expect.poll(() => currentPage(page)).toBe((await pageIds(page))[2]);
    // The browser itself never scrolls or zooms.
    expect(await page.evaluate(() => [window.scrollY, document.scrollingElement!.scrollTop])).toEqual([0, 0]);
  });

  test('scroll view: scrolling far sideways or past the last page never loses the pages', async ({
    page,
  }) => {
    await choosePageView(page, 'scroll');
    const canvas = (await page.getByTestId('canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(800, 0);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 800);
    await waitForCanvasIdle(page);
    // The last page is still there, centered across, with its "Add page" button in view.
    const last = (await page.getByTestId('page-header').last().boundingBox())!;
    expect(Math.abs(last.x + last.width / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(2);
    await expect(page.getByTestId('canvas-add-page')).toBeInViewport();
    for (let i = 0; i < 30; i++) await page.mouse.wheel(-800, -800);
    await expect(page.getByTestId('page-header').first()).toBeInViewport();
  });

  test('grid view scrolls by itself', async ({ page }) => {
    for (let i = 0; i < 9; i++) await page.getByTestId('add-page').click();
    await choosePageView(page, 'grid');
    const grid = page.getByTestId('page-grid');
    const box = (await grid.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
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

  test('closing the thumbnails shows every page in a scroll, and the choice is remembered', async ({
    page,
  }) => {
    await page.getByTestId('toggle-thumbnails').click();
    await expect(page.getByTestId('pages-list')).toHaveCount(0);
    expect(await page.evaluate(() => window.__opencanvas!.editor.pageView)).toBe('scroll');
    await page.reload();
    await page.waitForFunction(() => !!window.__opencanvas?.editor);
    await expect(page.getByTestId('pages-list')).toHaveCount(0);
    await expect(page.getByTestId('toggle-thumbnails')).toHaveAttribute('aria-pressed', 'false');
  });

  test('"Add page" under the last page adds a page at the end', async ({ page }) => {
    await page.evaluate(() => window.__opencanvas!.editor.setPageView('single'));
    const before = await pageIds(page);
    // Single page view: the button sits under the current page and adds after the last one.
    await page.getByTestId('canvas-add-page').click();
    const after = await pageIds(page);
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, -1)).toEqual(before);
  });
});

test('grid view keeps wide pages inside their own tiles', async ({ page }) => {
  await createDesign(page);
  // LinkedIn banner proportions (1584 × 396) on three pages.
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    const [square] = editor.store.getPageIds();
    for (let i = 0; i < 3; i++) {
      editor.execute('page.create', { afterId: editor.store.getPageIds().at(-1)!, width: 1584, height: 396 });
    }
    editor.deletePage(square!);
  });
  await page.getByTestId('grid-view').click();
  await expect(page.getByTestId('grid-page')).toHaveCount(3);
  const boxes = await page.getByTestId('grid-page').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const t = tile.getBoundingClientRect();
      const c = tile.querySelector('canvas')!.getBoundingClientRect();
      return { tile: [t.left, t.right], preview: [c.left, c.right], width: c.width };
    }),
  );
  for (const { tile, preview, width } of boxes) {
    expect(width).toBeGreaterThan(50);
    expect(preview[0]!).toBeGreaterThanOrEqual(tile[0]!);
    expect(preview[1]!).toBeLessThanOrEqual(tile[1]!);
  }
});

test.describe('page menu', () => {
  test.beforeEach(async ({ page }) => {
    await createDesign(page);
    await page.getByTestId('element-shape-circle').click();
    await page.getByTestId('add-page').click();
    expect(await pageIds(page)).toHaveLength(2);
  });

  test('right-click a thumbnail: copy the page, then paste it as a new page', async ({ page }) => {
    const [first] = await pageIds(page);
    await page.getByTestId('page-thumb').first().click({ button: 'right' });
    await page.getByTestId('page-menu-copy').click();
    await page.getByTestId('page-thumb').nth(1).click({ button: 'right' });
    await page.getByTestId('page-menu-paste').click();
    const ids = await pageIds(page);
    expect(ids).toHaveLength(3);
    const types = (id: string) =>
      page.evaluate((p) => window.__opencanvas!.editor.store.getChildren(p).map((n) => n.type), id);
    expect(await types(ids[2]!)).toEqual(await types(first!));
    expect(await types(ids[2]!)).toEqual(['shape']);
  });

  test('right-click a grid tile to hide a page and move it', async ({ page }) => {
    await page.getByTestId('grid-view').click();
    const [first, second] = await pageIds(page);
    await page.getByTestId('grid-page').first().click({ button: 'right' });
    await expect(page.getByTestId('page-menu')).toBeVisible();
    await expect(page.getByTestId('page-menu-move-up')).toBeDisabled();
    await page.getByTestId('page-menu-move-down').click();
    expect(await pageIds(page)).toEqual([second, first]);
    await page.getByTestId('grid-page').nth(1).click({ button: 'right' });
    await page.getByTestId('page-menu-hide').click();
    expect(await page.evaluate((id) => window.__opencanvas!.editor.store.getPage(id)?.hidden, first!)).toBe(
      true,
    );
  });

  test('the header menu downloads just that page and renames it', async ({ page }) => {
    await page.getByTestId('page-menu-button').first().click();
    await page.getByTestId('page-menu-download').click();
    await expect(page.getByRole('radio', { name: /This page/ })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    await page.getByTestId('page-menu-button').first().click();
    await page.getByTestId('page-menu-rename').click();
    await expect(page.getByTestId('page-title').first()).toBeFocused();
    await page.keyboard.type('Intro');
    await page.keyboard.press('Enter');
    const id = await currentPage(page);
    expect(await page.evaluate((p) => window.__opencanvas!.editor.store.getPage(p)?.name, id)).toBe('Intro');
  });
});
