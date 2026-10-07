import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';
import { createDesign, insertNodes, openPanel } from './support';

/** Fails on WCAG 2.1 A/AA violations of serious or critical impact. */
async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(report, `${label}\n${report.join('\n')}`).toEqual([]);
}

test.describe('accessibility', () => {
  test('dashboard pages (English and Arabic)', async ({ page, context }) => {
    for (const path of ['/', '/designs', '/trash']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectAccessible(page, `en ${path}`);
    }
    await context.addCookies([{ name: 'oc-locale', value: 'ar', url: page.url() }]);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expectAccessible(page, 'ar /');
  });

  test('custom size dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('format-custom').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'custom size dialog');
  });

  test('editor: empty, with a text selection and with each panel', async ({ page }) => {
    await createDesign(page);
    await expectAccessible(page, 'editor (page inspector)');

    await openPanel(page, 'text');
    await page.getByTestId('text-preset-heading').click();
    await expectAccessible(page, 'editor (text inspector)');

    await insertNodes(page, [{ type: 'shape', shape: 'star', x: 100, y: 100, width: 200, height: 200 }]);
    await expectAccessible(page, 'editor (shape inspector)');

    for (const tab of ['elements', 'uploads', 'layers'] as const) {
      await openPanel(page, tab);
      await expectAccessible(page, `editor (${tab} panel)`);
    }
  });

  test('editor dialogs', async ({ page }) => {
    await createDesign(page);
    await page.getByTestId('open-export').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'export dialog');
    await page.keyboard.press('Escape');

    await page.getByTestId('open-resize').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'resize dialog');
    await page.keyboard.press('Escape');

    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'shortcuts dialog');
  });

  test('the editor is operable with the keyboard alone', async ({ page }) => {
    await createDesign(page);
    await insertNodes(page, [
      { type: 'shape', shape: 'rect', x: 100, y: 100, width: 200, height: 200 },
      { type: 'shape', shape: 'ellipse', x: 500, y: 500, width: 200, height: 200 },
    ]);
    await openPanel(page, 'layers');
    // Select a layer from the tree, move it with arrow keys from the canvas.
    await page.getByTestId('layer-row').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selection-announcer')).toContainText('selected');
    const before = await page.evaluate(() => window.__opencanvas!.editor.getSelectedNodes()[0]!.x);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Shift+ArrowRight');
    const after = await page.evaluate(() => window.__opencanvas!.editor.getSelectedNodes()[0]!.x);
    expect(after - before).toBe(10);
    // Focus is visible on the canvas region.
    await expect(page.getByTestId('canvas')).toBeFocused();
  });
});
