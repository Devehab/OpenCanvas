import { expect, test } from './fixtures';
import { createDesign, getNodes, insertNodes } from './support';

const rect = {
  type: 'shape',
  shape: 'rect',
  x: 100,
  y: 100,
  width: 200,
  height: 120,
  fill: { type: 'solid', color: '#6d5dfc' },
} as const;

test.beforeEach(async ({ page }) => {
  await createDesign(page);
  const [id] = await insertNodes(page, [rect], { center: false });
  await page.evaluate((nodeId) => window.__opencanvas!.editor.select([nodeId]), id!);
  await page.getByTestId('fill-color').click();
});

const fill = async (page: import('@playwright/test').Page) =>
  ((await getNodes(page))[0] as unknown as { fill: unknown }).fill;

test('the palette: document colors, default colors with "See all", gradients and no color', async ({
  page,
}) => {
  const picker = page.getByTestId('color-picker');
  // The document's own color comes first, and is marked as the current one.
  await expect(
    picker.getByTestId('document-swatches').getByRole('button', { name: '#6d5dfc' }),
  ).toHaveAttribute('aria-pressed', 'true');
  // 4 rows of 7 default colors, all of them after "See all".
  const defaults = picker.getByTestId('default-swatches').getByRole('button', { name: /^#/ });
  await expect(defaults).toHaveCount(28);
  await picker.getByTestId('color-see-all').click();
  await expect(defaults).toHaveCount(49);

  await defaults.nth(7).click(); // first red
  expect(await fill(page)).toEqual({ type: 'solid', color: '#ff3131' });

  await picker.getByTestId('default-gradients').getByRole('button').nth(3).click();
  expect(await fill(page)).toEqual({
    type: 'linear-gradient',
    angle: 90,
    stops: [
      { offset: 0, color: '#ff3131' },
      { offset: 1, color: '#ff914d' },
    ],
  });
  await expect(page.getByTestId('fill-color')).toContainText('Linear gradient');

  await picker.getByRole('button', { name: 'No color' }).click();
  expect(await fill(page)).toBeNull();
});

test('a custom color: hex code, then a gradient with three colors and a radial style', async ({ page }) => {
  await page.getByTestId('color-custom').click();
  const hex = page.getByRole('textbox', { name: 'Color (hex)' });
  await hex.fill('#10b981');
  await hex.press('Enter');
  expect(await fill(page)).toEqual({ type: 'solid', color: '#10b981' });

  // Gradient tab: from the current color to white.
  await page.getByTestId('color-tab-gradient').click();
  expect(await fill(page)).toMatchObject({
    type: 'linear-gradient',
    stops: [
      { offset: 0, color: '#10b981' },
      { offset: 1, color: '#ffffff' },
    ],
  });
  // A third color, evenly spaced, edited through the same hex field.
  await page.getByTestId('gradient-add-stop').click();
  await hex.fill('#000000');
  await hex.press('Enter');
  expect(await fill(page)).toMatchObject({
    stops: [
      { offset: 0, color: '#10b981' },
      { offset: 0.5, color: '#ffffff' },
      { offset: 1, color: '#000000' },
    ],
  });
  await page.getByRole('button', { name: 'Radial' }).click();
  expect(await fill(page)).toMatchObject({ type: 'radial-gradient', cx: 0.5, cy: 0.5 });

  // Back to a solid color: the gradient's first color.
  await page.getByTestId('color-tab-solid').click();
  expect(await fill(page)).toEqual({ type: 'solid', color: '#10b981' });
});
