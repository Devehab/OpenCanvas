import { expect, type Page, test } from '@playwright/test';
import {
  createDesign,
  dragMouse,
  getNodes,
  getRecords,
  getSelection,
  insertNodes,
  nodeCenter,
  openPanel,
  toScreen,
  waitForCanvasIdle,
  waitForSaved,
} from './support';

const rect = (x: number, y: number, color = '#6d5dfc') =>
  ({
    type: 'shape',
    shape: 'rect',
    x,
    y,
    width: 200,
    height: 120,
    fill: { type: 'solid', color },
  }) as const;

async function addTwoShapes(page: Page) {
  const [a] = await insertNodes(page, [rect(100, 100)], { center: false });
  const [b] = await insertNodes(page, [rect(500, 600, '#ef4444')], { center: false });
  return [a!, b!] as const;
}

test.describe('editor', () => {
  test.beforeEach(async ({ page }) => {
    await createDesign(page);
  });

  test('adds shapes, lines, frames, icons and text from the side panels @smoke', async ({ page }) => {
    await openPanel(page, 'elements');
    await page.getByTestId('shape-star').click();
    await page.getByTestId('line-arrow').click();
    await page.getByTestId('frame-ellipse').click();
    await page.getByRole('searchbox', { name: 'Search icons' }).fill('قلب');
    await page.getByTestId('icon-heart').click();
    await openPanel(page, 'text');
    await page.getByTestId('text-preset-heading').click();
    await waitForCanvasIdle(page);

    const nodes = await getNodes(page);
    expect(nodes.map((n) => n.type)).toEqual(['shape', 'line', 'frame', 'path', 'text']);
    // Each insert selects the new element.
    expect((await getSelection(page)).map((n) => n.type)).toEqual(['text']);
    await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText('Text');
  });

  test('moves a shape by dragging; undo and redo restore exact states', async ({ page }) => {
    const [id] = await insertNodes(page, [rect(100, 100)], { center: false });
    const before = await getRecords(page);
    const zoom = await page.evaluate(() => window.__opencanvas!.editor.state.get().camera.zoom);
    const from = await nodeCenter(page, id!);
    await dragMouse(page, from, { x: from.x + 100, y: from.y + 50 });
    const [moved] = await getNodes(page);
    expect(moved!.x).toBeCloseTo(100 + 100 / zoom, 0);
    expect(moved!.y).toBeCloseTo(100 + 50 / zoom, 0);
    const after = await getRecords(page);

    await page.getByTestId('undo').click();
    expect(await getRecords(page)).toEqual(before);
    await page.getByTestId('redo').click();
    expect(await getRecords(page)).toEqual(after);
  });

  test('resizes from a corner handle', async ({ page }) => {
    const [id] = await insertNodes(page, [rect(100, 100)], { center: false });
    await page.evaluate((nodeId) => window.__opencanvas!.editor.select([nodeId]), id!);
    await waitForCanvasIdle(page);
    const corner = await toScreen(page, { x: 300, y: 220 });
    await dragMouse(page, corner, { x: corner.x + 60, y: corner.y + 40 });
    const [resized] = await getNodes(page);
    expect(resized!.x).toBeCloseTo(100, 0);
    expect(resized!.y).toBeCloseTo(100, 0);
    expect(resized!.width).toBeGreaterThan(250);
    expect(resized!.height).toBeGreaterThan(150);
  });

  test('keyboard shortcuts: nudge, duplicate, group, delete, undo, redo', async ({ page }) => {
    const [a, b] = await addTwoShapes(page);
    await page.evaluate((id) => window.__opencanvas!.editor.select([id]), a);
    await page.getByTestId('canvas').focus();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    let [first] = await getNodes(page);
    expect([first!.x, first!.y]).toEqual([101, 110]);

    await page.keyboard.press('ControlOrMeta+d');
    expect(await getNodes(page)).toHaveLength(3);

    await page.keyboard.press('ControlOrMeta+a');
    expect(await getSelection(page)).toHaveLength(3);
    await page.keyboard.press('ControlOrMeta+g');
    let nodes = await getNodes(page);
    expect(nodes[0]!.type).toBe('group');
    expect(nodes.filter((n) => n.parentId === nodes[0]!.id)).toHaveLength(3);

    await page.keyboard.press('ControlOrMeta+Shift+g');
    nodes = await getNodes(page);
    expect(nodes.every((n) => n.type === 'shape')).toBe(true);

    await page.evaluate((id) => window.__opencanvas!.editor.select([id]), b);
    await page.keyboard.press('Delete');
    expect((await getNodes(page)).map((n) => n.id)).not.toContain(b);
    await page.keyboard.press('ControlOrMeta+z');
    expect((await getNodes(page)).map((n) => n.id)).toContain(b);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect((await getNodes(page)).map((n) => n.id)).not.toContain(b);

    [first] = await getNodes(page);
    expect(first!.id).toBe(a);
  });

  test('marquee and shift-click selection', async ({ page }) => {
    const [a, b] = await addTwoShapes(page);
    const start = await toScreen(page, { x: 20, y: 20 });
    const end = await toScreen(page, { x: 1060, y: 1060 });
    await dragMouse(page, start, end);
    expect((await getSelection(page)).map((n) => n.id).sort()).toEqual([a, b].sort());

    await page.keyboard.press('Escape');
    expect(await getSelection(page)).toHaveLength(0);
    await page.mouse.click(...xy(await nodeCenter(page, a)));
    await page.keyboard.down('Shift');
    await page.mouse.click(...xy(await nodeCenter(page, b)));
    await page.keyboard.up('Shift');
    expect(await getSelection(page)).toHaveLength(2);
    await expect(page.getByTestId('selection-announcer')).toHaveText('2 elements selected');
  });

  test('draws a rectangle with the rectangle tool', async ({ page }) => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('r');
    await expect(page.getByTestId('tool-rect')).toHaveAttribute('aria-pressed', 'true');
    const from = await toScreen(page, { x: 200, y: 200 });
    const to = await toScreen(page, { x: 600, y: 500 });
    await dragMouse(page, from, to);
    const [node] = await getNodes(page);
    expect(node).toMatchObject({ type: 'shape', shape: 'rect' });
    expect(node!.x).toBeCloseTo(200, -1);
    expect(node!.width).toBeCloseTo(400, -1);
    expect(node!.height).toBeCloseTo(300, -1);
    // The tool returns to selection after drawing.
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  });

  test('inspector edits position, fill and opacity, and they persist after reload', async ({ page }) => {
    const [id] = await insertNodes(page, [rect(100, 100)], { center: false });
    await page.evaluate((nodeId) => window.__opencanvas!.editor.select([nodeId]), id!);

    await page.getByTestId('pos-x').fill('240');
    await page.getByTestId('pos-x').press('Enter');
    await page.getByTestId('fill-color').click();
    const hex = page.getByRole('textbox', { name: 'Color (hex)' });
    await hex.fill('#10b981');
    await hex.press('Enter');
    await page.keyboard.press('Escape');
    const opacity = page.getByTestId('opacity').getByRole('slider');
    await opacity.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');

    const expected = { x: 240, fill: { type: 'solid', color: '#10b981' }, opacity: 0.95 };
    expect((await getNodes(page))[0]).toMatchObject(expected);
    await waitForSaved(page);
    await page.reload();
    await page.waitForFunction(() => !!window.__opencanvas);
    expect((await getNodes(page))[0]).toMatchObject(expected);
  });

  test('layers panel selects, hides and locks layers', async ({ page }) => {
    const [a, b] = await addTwoShapes(page);
    await openPanel(page, 'layers');
    const rows = page.getByTestId('layer-row');
    await expect(rows).toHaveCount(2);
    // Topmost layer first.
    await rows.first().click();
    expect((await getSelection(page)).map((n) => n.id)).toEqual([b]);

    await rows.nth(1).hover();
    await rows.nth(1).getByTestId('layer-visibility').click();
    await rows.nth(1).getByRole('button', { name: 'Lock' }).click();
    const nodes = await getNodes(page);
    expect(nodes.find((n) => n.id === a)).toMatchObject({ visible: false, locked: true });

    // Keyboard navigation inside the tree.
    await rows.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
  });

  test('context menu duplicates and deletes', async ({ page }) => {
    const [id] = await insertNodes(page, [rect(300, 300)], { center: false });
    await page.mouse.click(...xy(await nodeCenter(page, id!)), { button: 'right' });
    const menu = page.getByTestId('context-menu');
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    expect(await getNodes(page)).toHaveLength(2);
    const copy = (await getSelection(page))[0]!;
    await page.mouse.click(...xy(await nodeCenter(page, copy.id)), { button: 'right' });
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    expect((await getNodes(page)).map((n) => n.id)).toEqual([id]);
  });

  test('copy and paste through the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const [id] = await insertNodes(page, [rect(300, 300)], { center: false });
    await page.evaluate((nodeId) => window.__opencanvas!.editor.select([nodeId]), id!);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    const nodes = await getNodes(page);
    expect(nodes).toHaveLength(2);
    expect(nodes[1]!.id).not.toBe(id);
    expect(nodes[1]).toMatchObject({ type: 'shape', width: 200, height: 120 });
  });

  test('pages: add, duplicate, navigate and delete with undo', async ({ page }) => {
    await insertNodes(page, [rect(100, 100)], { center: false });
    const pageCount = () => page.evaluate(() => window.__opencanvas!.editor.store.getPageIds().length);
    await page.getByTestId('add-page').click();
    expect(await pageCount()).toBe(2);
    await expect(page.getByTestId('page-position')).toContainText('2');
    expect(await getNodes(page)).toHaveLength(0);

    await page.getByTestId('page-thumb').first().click();
    await page.getByTestId('duplicate-page').click();
    expect(await pageCount()).toBe(3);
    // The duplicate is a deep copy with new ids.
    const copy = await getNodes(page);
    expect(copy).toHaveLength(1);

    await page.getByTestId('delete-page').click();
    expect(await pageCount()).toBe(2);
    await page.getByTestId('undo').click();
    expect(await pageCount()).toBe(3);
    await expect(page.getByTestId('page-thumb')).toHaveCount(3);
  });

  test('renames the design from the top bar', async ({ page }) => {
    const title = page.getByTestId('design-title-input');
    await title.fill('Launch poster');
    await title.press('Enter');
    await expect(page).toHaveTitle(/Launch poster/);
    await waitForSaved(page);
    await page.reload();
    await expect(page.getByTestId('design-title-input')).toHaveValue('Launch poster');
  });
});

function xy(p: { x: number; y: number }): [number, number] {
  return [p.x, p.y];
}
