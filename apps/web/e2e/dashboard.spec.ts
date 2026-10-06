import { expect, test } from '@playwright/test';
import { createDesign, samplePng, waitForEditor, waitForSaved } from './support';

test.describe('dashboard', () => {
  test('creates a design from a format and lists it under recent designs @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const id = await createDesign(page, 'instagram-post');
    await expect(page.getByTestId('design-title-input')).toHaveValue('Instagram Post');
    const size = await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      const p = editor.store.getPage(editor.pageId)!;
      return [p.width, p.height];
    });
    expect(size).toEqual([1080, 1080]);
    await waitForSaved(page);

    await page.goto('/');
    const card = page.getByTestId('design-card').filter({ hasText: 'Instagram Post' });
    await expect(card).toHaveCount(1);
    await card.getByRole('link').first().click();
    await page.waitForURL(`**/design/${id}`);
  });

  test('creates a custom size in millimetres', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('format-custom').click();
    await page.getByRole('dialog').getByRole('combobox', { name: 'Unit' }).selectOption('mm');
    await page.getByTestId('custom-width').fill('210');
    await page.getByTestId('custom-height').fill('297');
    await page.getByTestId('custom-create').click();
    await page.waitForURL(/\/design\//);
    await page.waitForFunction(() => !!window.__opencanvas);
    const size = await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      const p = editor.store.getPage(editor.pageId)!;
      return [p.width, p.height];
    });
    // A4 at 96 DPI.
    expect(size).toEqual([794, 1123]);
  });

  test('create dialog: categories, platform filter and search', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('create-design').click();
    const dialog = page.getByTestId('create-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('create-tab-social').click();
    await page.getByTestId('platform-pinterest').click();
    await expect(dialog.getByTestId('format-pinterest-pin')).toBeVisible();
    await expect(dialog.getByTestId('format-instagram-post')).toHaveCount(0);
    await page.getByTestId('create-search').fill('whiteboard');
    await dialog.getByTestId('format-whiteboard').click();
    await page.waitForURL(/\/design\//);
    await waitForEditor(page);
    const page0 = await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      return editor.store.getPage(editor.pageId)!;
    });
    expect([page0.width, page0.height]).toEqual([3840, 2160]);
  });

  test('photo editor creates a design at the photo size', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('create-design').click();
    await page.getByTestId('create-tab-photo').click();
    await page.getByTestId('create-photo-input').setInputFiles([
      { name: 'Holiday.png', mimeType: 'image/png', buffer: samplePng(900, 600) },
    ]);
    await page.waitForURL(/\/design\//);
    await waitForEditor(page);
    const state = await page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      const p = editor.store.getPage(editor.pageId)!;
      const nodes = editor.store.getChildren(p.id);
      return { w: p.width, h: p.height, title: editor.store.getDocument()!.title, nodes: nodes.map((n) => [n.type, n.width, n.height]) };
    });
    expect(state).toEqual({ w: 900, h: 600, title: 'Holiday', nodes: [['image', 900, 600]] });
  });

  test('renames, duplicates, trashes, restores and deletes designs', async ({ page }) => {
    await createDesign(page, 'presentation');
    await waitForSaved(page);
    await page.goto('/designs');
    /** The card whose title is exactly `title`. */
    const card = (title: string) =>
      page
        .getByTestId('design-card')
        .filter({ has: page.getByTestId('design-title').getByText(title, { exact: true }) });
    const openMenu = async (title: string) => {
      await card(title).hover();
      await card(title).getByTestId('design-menu').click();
    };

    await openMenu('Presentation (16:9)');
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill('Quarterly review');
    await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
    await expect(card('Quarterly review')).toHaveCount(1);

    await openMenu('Quarterly review');
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(card('Copy of Quarterly review')).toHaveCount(1);

    await openMenu('Quarterly review');
    await page.getByTestId('design-trash').click();
    await expect(card('Quarterly review')).toHaveCount(0);

    await page.goto('/trash');
    await expect(card('Quarterly review')).toHaveCount(1);
    await openMenu('Quarterly review');
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await expect(card('Quarterly review')).toHaveCount(0);

    await page.goto('/designs');
    await expect(card('Quarterly review')).toHaveCount(1);
    await openMenu('Quarterly review');
    await page.getByTestId('design-trash').click();
    await page.goto('/trash');
    await openMenu('Quarterly review');
    await page.getByRole('menuitem', { name: 'Delete forever' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(card('Quarterly review')).toHaveCount(0);
    await page.goto('/designs');
    await expect(card('Quarterly review')).toHaveCount(0);
    await expect(card('Copy of Quarterly review')).toHaveCount(1);
  });

  test('search ignores Arabic diacritics and letter variants', async ({ page }) => {
    await createDesign(page, 'poster');
    await page.getByTestId('design-title-input').fill('مُلصَق إعلانيّ ٢٠٢٦');
    await page.getByTestId('design-title-input').press('Enter');
    await waitForSaved(page);
    await page.goto('/designs');
    const search = page.getByTestId('search-designs');
    await search.fill('ملصق اعلاني');
    await expect(page.getByTestId('design-card')).toHaveCount(1);
    await search.fill('2026');
    await expect(page.getByTestId('design-card')).toHaveCount(1);
    await search.fill('غير موجود');
    await expect(page.getByTestId('design-card')).toHaveCount(0);
  });

  test('switches the interface to Arabic with a right-to-left layout @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.getByTestId('language-select').selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('create-design')).toContainText('إنشاء تصميم');
    // The choice survives a reload.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('serves the health endpoint and security headers', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBe(true);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    const home = await request.get('/');
    const headers = home.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
