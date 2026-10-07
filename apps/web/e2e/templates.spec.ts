import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createDesign, getNodes, insertNodes, waitForEditor, waitForSaved } from './support';

interface StoredDesign {
  id: string;
  title: string;
  kind?: string;
  folderId?: string | null;
  deletedAt: number | null;
  snapshot: { records: { typeName: string; type?: string; x?: number; title?: string }[] };
}

/** Every design and template stored in this browser. */
function storedDesigns(page: Page): Promise<StoredDesign[]> {
  return page.evaluate(
    () =>
      new Promise<StoredDesign[]>((resolve, reject) => {
        const open = indexedDB.open('opencanvas');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('designs').objectStore('designs').getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as StoredDesign[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

const nodesOf = (d: StoredDesign) => d.snapshot.records.filter((r) => r.typeName === 'node');

async function designWithShape(page: Page): Promise<string> {
  const id = await createDesign(page);
  await insertNodes(
    page,
    [
      {
        type: 'shape',
        shape: 'rect',
        x: 100,
        y: 120,
        width: 300,
        height: 200,
        fill: { type: 'solid', color: '#ff0000' },
      },
    ],
    { center: false },
  );
  await waitForSaved(page);
  return id;
}

async function newTemplateFolder(page: Page, name: string, icon: string) {
  await page.getByTestId('new-template-folder').click();
  await page.getByTestId('template-folder-name').fill(name);
  await page.locator(`input[data-testid="template-folder-icon"][value="${icon}"]`).check({ force: true });
  await page.getByTestId('save-template-folder').click();
  await expect(page.getByTestId('template-folder-card').filter({ hasText: name })).toHaveCount(1);
}

test.describe('templates', () => {
  test('a design saved as a template goes into a folder with an icon, and stays out of designs', async ({
    page,
  }) => {
    await designWithShape(page);
    await page.goto('/templates');
    await newTemplateFolder(page, 'Marketing', 'megaphone');
    await expect(page.getByTestId('template-folder-card').locator('[data-icon]')).toHaveAttribute(
      'data-icon',
      'megaphone',
    );

    await page.goto('/designs');
    const card = page.getByTestId('design-card').first();
    await card.hover();
    await card.getByTestId('design-menu').click();
    await page.getByTestId('design-save-as-template').click();
    await page.getByTestId('template-name').fill('Promo');
    await page.getByTestId('template-folder-select').selectOption({ label: 'Marketing' });
    await page.getByTestId('confirm-save-template').click();

    // The template is a copy; designs and projects still list one design.
    await expect.poll(async () => (await storedDesigns(page)).length).toBe(2);
    await expect(page.getByTestId('design-card')).toHaveCount(1);
    await page.goto('/');
    await expect(page.getByTestId('design-card')).toHaveCount(1);

    await page.goto('/templates');
    await expect(page.getByTestId('templates-empty')).toBeVisible();
    await expect(page.getByTestId('template-folder-card')).toContainText('1 template');
    await page.getByTestId('template-folder-link').click();
    await expect(page.getByTestId('templates-title')).toContainText('Marketing');
    await expect(page.getByTestId('template-card')).toHaveCount(1);
    await expect(page.getByTestId('template-title')).toHaveText('Promo');
  });

  test('using a template opens a copy in a new tab; the template does not change', async ({ page }) => {
    await designWithShape(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByTestId('editor-save-as-template').click();
    await page.getByTestId('template-name').fill('Base');
    await page.getByTestId('confirm-save-template').click();
    await expect
      .poll(async () => (await storedDesigns(page)).filter((d) => d.kind === 'template').length)
      .toBe(1);
    const template = (await storedDesigns(page)).find((d) => d.kind === 'template')!;
    expect(template.title).toBe('Base');

    await page.goto('/templates');
    const [copyTab] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByTestId('template-card').filter({ hasText: 'Base' }).getByTestId('use-template').click(),
    ]);
    await copyTab.waitForURL(/\/design\/design_/);
    await waitForEditor(copyTab);
    const copyId = new URL(copyTab.url()).pathname.split('/').pop()!;
    expect(copyId).not.toBe(template.id);
    await expect(copyTab.getByTestId('design-title-input')).toHaveValue('Base');
    await expect(copyTab.getByTestId('editing-template')).toHaveCount(0);
    const [shape] = await getNodes(copyTab);
    expect(shape!.type).toBe('shape');

    // Editing the copy leaves the template as it was.
    await copyTab.evaluate(
      (nodeId) => window.__opencanvas!.editor.execute('node.update', { ids: [nodeId], patch: { x: 555 } }),
      shape!.id,
    );
    await waitForSaved(copyTab);
    const after = await storedDesigns(page);
    const stillTemplate = after.find((d) => d.id === template.id)!;
    expect(stillTemplate.kind).toBe('template');
    expect(nodesOf(stillTemplate).map((n) => n.x)).toEqual([100]);
    expect(nodesOf(after.find((d) => d.id === copyId)!).map((n) => n.x)).toEqual([555]);
    expect(after.find((d) => d.id === copyId)!.kind).toBeUndefined();
    await copyTab.close();

    // Editing the template itself is a deliberate choice, and says so.
    const card = page.getByTestId('template-card').filter({ hasText: 'Base' });
    await card.hover();
    await card.getByTestId('template-menu').click();
    await page.getByTestId('edit-template').click();
    await page.waitForURL(`**/design/${template.id}`);
    await waitForEditor(page);
    await expect(page.getByTestId('editing-template')).toBeVisible();
  });

  test('templates can be renamed, moved between folders, deleted and restored', async ({ page }) => {
    await designWithShape(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByTestId('editor-save-as-template').click();
    await page.getByTestId('confirm-save-template').click();
    await expect
      .poll(async () => (await storedDesigns(page)).filter((d) => d.kind === 'template').length)
      .toBe(1);

    await page.goto('/templates');
    await newTemplateFolder(page, 'Events', 'calendar');
    const card = page.getByTestId('template-card').first();
    await card.hover();
    await card.getByTestId('template-menu').click();
    await page.getByTestId('rename-template').click();
    await page.getByTestId('rename-template-input').fill('Flyer');
    await page.getByTestId('confirm-rename-template').click();
    await expect(page.getByTestId('template-title')).toHaveText('Flyer');

    await card.hover();
    await card.getByTestId('template-menu').click();
    await page.getByRole('menuitem', { name: 'Move to folder' }).click();
    await page.getByTestId('move-template-to-folder').filter({ hasText: 'Events' }).click();
    await expect(page.getByTestId('templates-empty')).toBeVisible();
    await page.getByTestId('template-folder-link').click();
    const moved = page.getByTestId('template-card');
    await expect(moved).toHaveCount(1);

    await moved.hover();
    await moved.getByTestId('template-menu').click();
    await page.getByTestId('template-trash').click();
    await expect(page.getByTestId('template-card')).toHaveCount(0);

    await page.goto('/trash');
    const trashed = page.getByTestId('design-card').filter({ hasText: 'Flyer' });
    await expect(trashed.getByTestId('template-badge')).toBeVisible();
    await trashed.hover();
    await trashed.getByTestId('design-menu').click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await page.goto(
      '/templates?folder=' + (await storedDesigns(page)).find((d) => d.kind === 'template')!.folderId,
    );
    await expect(page.getByTestId('template-title')).toHaveText('Flyer');
  });

  test('starter templates: previews, a new design from one, and a copy to change', async ({ page }) => {
    await page.goto('/templates');
    const starters = page.getByTestId('starter-card');
    await expect(starters).toHaveCount(6);
    // Every preview is drawn.
    await expect(page.getByTestId('starter-grid').locator('img')).toHaveCount(6, { timeout: 30_000 });

    const sale = starters.filter({ hasText: 'Summer sale' });
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      sale.getByTestId('use-starter').click(),
    ]);
    await tab.waitForURL(/\/design\/design_/);
    await waitForEditor(tab);
    await expect(tab.getByTestId('design-title-input')).toHaveValue('Summer sale');
    expect((await getNodes(tab)).length).toBeGreaterThan(5);
    await tab.close();

    await sale.hover();
    await sale.getByTestId('starter-menu').click();
    await page.getByTestId('copy-starter').click();
    await expect(page.getByTestId('template-card').filter({ hasText: 'Summer sale' })).toHaveCount(1);
  });

  test('in Arabic: starter templates are in Arabic, and the editor bar is the English one mirrored', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await context.addCookies([{ name: 'oc-locale', value: 'ar', url: page.url() }]);
    await page.goto('/templates');
    const sale = page.getByTestId('starter-card').filter({ hasText: 'تخفيضات الصيف' });
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      sale.getByTestId('use-starter').click(),
    ]);
    await tab.waitForURL(/\/design\/design_/);
    await waitForEditor(tab);
    await expect(tab.getByTestId('design-title-input')).toHaveValue('تخفيضات الصيف');
    const texts = (await getNodes(tab)).filter((n) => n.type === 'text') as unknown as { align: string }[];
    expect(texts.some((n) => n.align === 'right')).toBe(true);

    // Right to left: logo and menus on the right, Download on the left.
    const home = await tab.getByRole('link', { name: 'الرئيسية' }).first().boundingBox();
    const file = await tab.getByRole('button', { name: 'ملف', exact: true }).boundingBox();
    const download = await tab.getByTestId('open-export').boundingBox();
    expect(home!.x).toBeGreaterThan(file!.x);
    expect(file!.x).toBeGreaterThan(download!.x);
    // One save status.
    await expect(tab.getByTestId('save-status')).toHaveCount(1);
    await expect(tab.getByTestId('cloud-status')).toHaveCount(0);
  });

  test('in English the editor bar keeps its order: logo and menus left, Download right', async ({ page }) => {
    await createDesign(page);
    const file = await page.getByRole('button', { name: 'File', exact: true }).boundingBox();
    const download = await page.getByTestId('open-export').boundingBox();
    expect(file!.x).toBeLessThan(download!.x);
    await expect(page.getByTestId('save-status')).toHaveCount(1);
  });
});
