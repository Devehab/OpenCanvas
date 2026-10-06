import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { createDesign, exportDesign, getNodes, insertNodes, samplePng } from './support';

const require = createRequire(import.meta.url);
const textNode = (text: string) => ({
  type: 'text' as const,
  x: 100,
  y: 100,
  width: 600,
  sizing: 'auto-height' as const,
  content: { paragraphs: [{ runs: [{ text, style: {} }], list: 'none' as const, indent: 0 }] },
});

const realFont = () =>
  readFileSync(require.resolve('@fontsource/pacifico/files/pacifico-latin-400-normal.woff2'));

test('upload a font in Settings and use it in a design', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-tab-fonts')).toHaveAttribute('aria-current', 'page');

  // Something that only pretends to be a font is refused.
  await page
    .getByTestId('settings-font-input')
    .setInputFiles([{ name: 'fake.ttf', mimeType: 'font/ttf', buffer: samplePng(10, 10) }]);
  await expect(page.getByTestId('toast').filter({ hasText: 'fake.ttf is not a font file' })).toBeVisible();

  // A real font: family and weight come from the file name.
  await page
    .getByTestId('settings-font-input')
    .setInputFiles([{ name: 'MyBrand-Bold.woff2', mimeType: 'font/woff2', buffer: realFont() }]);
  await expect(page.getByTestId('custom-font')).toHaveCount(1);
  await expect(page.getByTestId('custom-font')).toHaveAttribute('data-family', 'MyBrand');
  await expect(page.getByTestId('custom-font-weight')).toHaveValue('700');

  // Rename the family.
  await page.getByTestId('custom-font-family').fill('Acme Script');
  await page.getByTestId('custom-font-family').press('Enter');
  await expect(page.getByTestId('custom-font')).toHaveAttribute('data-family', 'Acme Script');

  // The editor lists it under "Your fonts" and loads it on the canvas.
  await createDesign(page);
  const [id] = await insertNodes(page, [textNode('Hello')]);
  await page.evaluate((nodeId) => window.__opencanvas!.editor.select([nodeId]), id!);
  const picker = page.getByTestId('font-family');
  await expect(picker.locator('optgroup[label="Your fonts"] option')).toHaveText(['Acme Script']);
  await picker.selectOption('Acme Script');
  const [text] = (await getNodes(page)) as { style: { fontFamily: string; fontWeight: number } }[];
  expect(text!.style.fontFamily).toBe('Acme Script');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('700 32px "Acme Script"', 'Hello')))
    .toBe(true);

  // SVG export embeds the uploaded font, so the file shows it anywhere.
  const svg = (await exportDesign(page, 'svg')).bytes.toString('utf8');
  expect(svg).toMatch(/@font-face\{font-family:"Acme Script";[^}]*src:url\(data:font\/woff2;base64,/);

  // Deleting it in Settings removes it from the picker.
  await page.goto('/settings?tab=fonts');
  await page.getByTestId('custom-font-delete').click();
  await expect(page.getByTestId('custom-font')).toHaveCount(0);
});

test('upload a font straight from the text panel', async ({ page }) => {
  await createDesign(page);
  const [id] = await insertNodes(page, [textNode('Hi')]);
  await page.evaluate((nodeId) => window.__opencanvas!.editor.select([nodeId]), id!);
  await page
    .getByTestId('upload-font-input')
    .setInputFiles([{ name: 'Signature-Regular.woff2', mimeType: 'font/woff2', buffer: realFont() }]);
  await expect
    .poll(async () => ((await getNodes(page))[0] as { style: { fontFamily: string } }).style.fontFamily)
    .toBe('Signature');
  await expect(page.getByTestId('font-family')).toHaveValue('Signature');
  // The font file really loads (it is served to @font-face as a blob: URL).
  await expect.poll(() => page.evaluate(() => document.fonts.check('400 32px "Signature"', 'Hi'))).toBe(true);
});
