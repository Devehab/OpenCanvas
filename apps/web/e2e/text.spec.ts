import type { NodeRecord, TextNode } from '@opencanvas/core';
import { expect, type Page, test } from './fixtures';
import {
  createDesign,
  getNodes,
  insertNodes,
  openPanel,
  toScreen,
  waitForCanvasIdle,
  waitForEditor,
} from './support';

const paragraphs = (node: NodeRecord | undefined) =>
  (node as TextNode).content.paragraphs.map((p) => p.runs.map((r) => r.text).join(''));

/** Fraction of "inked" pixels of the scene canvas inside a page-space box. */
async function canvasInk(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await waitForCanvasIdle(page);
  return page.evaluate((b) => {
    const { editor, view } = window.__opencanvas!;
    const dpr = view.scene.width / view.scene.getBoundingClientRect().width;
    const tl = editor.pageToScreen({ x: b.x, y: b.y });
    const br = editor.pageToScreen({ x: b.x + b.width, y: b.y + b.height });
    const x = Math.round(tl.x * dpr);
    const y = Math.round(tl.y * dpr);
    const w = Math.max(1, Math.round((br.x - tl.x) * dpr));
    const h = Math.max(1, Math.round((br.y - tl.y) * dpr));
    const data = view.scene.getContext('2d')!.getImageData(x, y, w, h).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 128 && data[i + 3]! > 128) ink++;
    return ink / (w * h);
  }, box);
}

test.describe('text', () => {
  test.beforeEach(async ({ page }) => {
    await createDesign(page);
  });

  test('edits text in place; a single undo reverts the whole edit', async ({ page }) => {
    await openPanel(page, 'text');
    await page.getByTestId('add-text-box').click();
    const original = paragraphs((await getNodes(page))[0]);

    // Enter edits the selected text box.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Enter');
    const overlay = page.locator('.oc-text-editor');
    await expect(overlay).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Hello OpenCanvas');
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    expect(paragraphs((await getNodes(page))[0])).toEqual(['Hello OpenCanvas']);

    await page.keyboard.press('ControlOrMeta+z');
    expect(paragraphs((await getNodes(page))[0])).toEqual(original);
  });

  test('types Arabic and mixed-direction paragraphs with the text tool @smoke', async ({ page }) => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('t');
    const at = await toScreen(page, { x: 150, y: 300 });
    await page.mouse.click(at.x, at.y);
    const overlay = page.locator('.oc-text-editor');
    await expect(overlay).toBeFocused();
    await page.keyboard.insertText('مرحبا بالعالم');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('OpenCanvas ٢٠٢٦ تصميم');
    await page.keyboard.press('Escape');

    const [node] = await getNodes(page);
    expect(node!.type).toBe('text');
    expect(paragraphs(node)).toEqual(['مرحبا بالعالم', 'OpenCanvas ٢٠٢٦ تصميم']);
    expect(node!.width).toBeGreaterThan(100);
    expect(await canvasInk(page, node!)).toBeGreaterThan(0.02);
  });

  test('bold applies to the selected characters only', async ({ page }) => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('t');
    const at = await toScreen(page, { x: 150, y: 300 });
    await page.mouse.click(at.x, at.y);
    await expect(page.locator('.oc-text-editor')).toBeFocused();
    await page.keyboard.type('Hello world');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.press('Escape');
    const runs = ((await getNodes(page))[0] as TextNode).content.paragraphs[0]!.runs;
    expect(runs.map((r) => [r.text, r.style.fontWeight ?? null])).toEqual([
      ['Hello ', null],
      ['world', 700],
    ]);
  });

  test('font, size and alignment from the inspector re-measure the box', async ({ page }) => {
    await openPanel(page, 'text');
    await page.getByTestId('text-preset-heading').click();
    const before = (await getNodes(page))[0] as TextNode;

    await page.getByTestId('font-size').fill(String(before.style.fontSize * 2));
    await page.getByTestId('font-size').press('Enter');
    await waitForCanvasIdle(page);
    const bigger = (await getNodes(page))[0] as TextNode;
    expect(bigger.style.fontSize).toBe(before.style.fontSize * 2);
    expect(bigger.width / before.width).toBeGreaterThan(1.7);
    expect(bigger.height / before.height).toBeGreaterThan(1.7);

    await page.getByTestId('font-family').selectOption('Amiri');
    await page.getByRole('radio', { name: 'Right', exact: true }).click();
    await waitForCanvasIdle(page);
    const styled = (await getNodes(page))[0] as TextNode;
    expect(styled.style.fontFamily).toBe('Amiri');
    expect(styled.align).toBe('right');
    expect(await page.evaluate(() => document.fonts.check('700 32px "Amiri"'))).toBe(true);
  });

  test('Arabic presets use an Arabic font, right alignment and render shaped text', async ({ page }) => {
    await openPanel(page, 'text');
    await page.getByTestId('text-preset-arabic-heading').click();
    await waitForCanvasIdle(page);
    const [node] = (await getNodes(page)) as TextNode[];
    expect(node!.style.fontFamily).toBe('Cairo');
    expect(node!.align).toBe('right');
    expect(await page.evaluate(() => document.fonts.check('700 64px "Cairo"', 'عربي'))).toBe(true);
    expect(await canvasInk(page, node!)).toBeGreaterThan(0.02);
  });

  test('pasting plain text creates a text box (Arabic gets an Arabic font)', async ({ page }) => {
    await page.getByTestId('canvas').focus();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', 'نص ملصوق من الحافظة');
      // A real paste carries its clipboardData; Firefox ignores it in the constructor of a synthetic one.
      const event = new ClipboardEvent('paste', { bubbles: true });
      Object.defineProperty(event, 'clipboardData', { value: data });
      document.dispatchEvent(event);
    });
    const [node] = (await getNodes(page)) as TextNode[];
    expect(paragraphs(node)).toEqual(['نص ملصوق من الحافظة']);
    expect(node!.style.fontFamily).toBe('Cairo');
    expect(node!.align).toBe('right');
  });

  test('text stays editable after reload (never flattened)', async ({ page }) => {
    await insertNodes(page, [
      {
        type: 'text',
        x: 100,
        y: 100,
        width: 600,
        sizing: 'auto-height',
        content: {
          paragraphs: [{ runs: [{ text: 'Editable after reload', style: {} }], list: 'none', indent: 0 }],
        },
      },
    ]);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForEditor(page);
    const [node] = await getNodes(page);
    expect(node!.type).toBe('text');
    expect(paragraphs(node)).toEqual(['Editable after reload']);
  });
});
