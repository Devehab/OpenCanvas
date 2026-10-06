import { expect, test } from '@playwright/test';
import { createDesign, getNodes, insertNodes, openPanel, samplePng } from './support';

test('brand kit: create, edit, and use it in the editor', async ({ page }) => {
  await page.goto('/brand');
  await page.getByTestId('new-brand').first().click();
  await page.getByTestId('brand-kit-name').fill('Acme');
  await page.getByTestId('create-brand').click();
  await page.waitForURL(/\/brand\?id=/);
  await expect(page.getByTestId('brand-name')).toHaveValue('Acme');

  // Colors: the default palette plus one more color.
  await expect(page.getByTestId('brand-color')).toHaveCount(3);
  await page.getByTestId('brand-add-color').click();
  await expect(page.getByTestId('brand-color')).toHaveCount(4);

  // Logo upload.
  await page
    .getByTestId('brand-input-logos')
    .setInputFiles([{ name: 'logo.png', mimeType: 'image/png', buffer: samplePng(200, 100) }]);
  await expect(page.getByTestId('brand-images-logos').locator('li')).toHaveCount(1);

  // Fonts and voice.
  await page.getByTestId('brand-font-heading-family').selectOption('Cairo');
  await page.getByTestId('brand-voice-tone').fill('friendly');
  await page.getByTestId('brand-voice-tone').press('Enter');
  await expect(page.getByTestId('brand-section-voice')).toContainText('friendly');

  // Use it in a design.
  await createDesign(page);
  await openPanel(page, 'brand');
  await expect(page.getByTestId('brand-panel')).toBeVisible();
  await expect(page.getByTestId('brand-select')).toHaveValue(/brand_/);

  const [shapeId] = await insertNodes(
    page,
    [{ type: 'shape', shape: 'rect', x: 10, y: 10, width: 100, height: 100 }],
    {
      center: false,
    },
  );
  await page.evaluate((id) => window.__opencanvas!.editor.select([id]), shapeId!);
  await page.getByTestId('brand-panel-color').first().click();
  const [shape] = await getNodes(page);
  expect(shape).toMatchObject({ fill: { type: 'solid', color: '#7c6cf8' } });

  // Brand heading: Cairo, bold.
  await page.getByTestId('brand-panel-font-heading').click();
  const text = (await getNodes(page)).find((n) => n.type === 'text') as {
    style: { fontFamily: string; fontWeight: number };
  };
  expect(text.style).toMatchObject({ fontFamily: 'Cairo', fontWeight: 700 });

  // Logo onto the page.
  await page.getByTestId('brand-panel-image').first().click();
  await expect.poll(async () => (await getNodes(page)).some((n) => n.type === 'image')).toBe(true);

  // Brand colors lead every color picker.
  await page.evaluate((id) => window.__opencanvas!.editor.select([id]), shapeId!);
  await page.getByTestId('fill-color').click();
  await expect(page.getByTestId('brand-swatches').getByRole('button')).toHaveCount(4);
});
