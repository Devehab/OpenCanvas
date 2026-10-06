import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
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

/** A logo with a transparent background: a blue block and a smaller yellow one. */
function twoColorLogo(): Buffer {
  const png = new PNG({ width: 120, height: 60 });
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 120; x++) {
      const i = (y * 120 + x) * 4;
      const color = x < 60 ? [40, 92, 255, 255] : x < 80 && y < 30 ? [255, 200, 0, 255] : [0, 0, 0, 0];
      png.data.set(color, i);
    }
  }
  return PNG.sync.write(png);
}

test('brand colors: type or paste a code, and add colors from the logo', async ({ page }) => {
  await page.goto('/brand');
  await page.getByTestId('new-brand').first().click();
  await page.getByTestId('brand-kit-name').fill('Codes');
  await page.getByTestId('create-brand').click();
  await page.waitForURL(/\/brand\?id=/);

  // Type a code without "#", then paste one with CSS around it.
  await page.getByTestId('brand-color').first().click();
  const input = page.getByTestId('brand-color-input');
  await input.fill('285CFF');
  await input.press('Enter');
  await expect(page.getByTestId('brand-color').first()).toHaveAttribute('data-color', '#285cff');
  await input.fill('not a color');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('color: rgb(16, 185, 129);');
  await page.keyboard.press('Escape'); // closing the popover keeps the new color
  await expect(page.getByTestId('brand-color').first()).toHaveAttribute('data-color', '#10b981');

  // Colors from the logo, transparent background ignored.
  await page
    .getByTestId('brand-input-logos')
    .setInputFiles([{ name: 'logo.png', mimeType: 'image/png', buffer: twoColorLogo() }]);
  await expect(page.getByTestId('brand-logo-color')).toHaveCount(2);
  await expect(page.getByTestId('brand-logo-color').first()).toHaveAttribute('data-color', '#285cff');
  await page.getByTestId('brand-logo-color').first().click();
  await expect(page.locator('[data-testid="brand-color"][data-color="#285cff"]')).toHaveCount(1);
  // Added colors are no longer suggested.
  await expect(page.getByTestId('brand-logo-color')).toHaveCount(1);
});
