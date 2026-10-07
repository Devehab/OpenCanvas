import { expect, type Page, test } from './fixtures';
import { createDesign, dragMouse, getNodes, insertNodes, nodeCenter, waitForCanvasIdle } from './support';

const guides = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    return editor.store.getPage(editor.pageId)!.guides;
  });

test.describe('rulers and guides', () => {
  test.beforeEach(async ({ page }) => {
    await createDesign(page);
  });

  test('Shift+R shows rulers; dragging from a ruler adds a guide, back onto it removes it', async ({
    page,
  }) => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Shift+R');
    const ruler = page.getByTestId('ruler-x');
    await expect(ruler).toBeVisible();
    const box = (await ruler.boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 250, { steps: 6 });
    await page.mouse.up();
    const [added] = await guides(page);
    expect(added).toMatchObject({ axis: 'y' });
    await expect(page.getByTestId('guide')).toHaveCount(1);

    // Drag the guide back onto the ruler: removed. Undo brings it back.
    const guide = (await page.getByTestId('guide').boundingBox())!;
    await page.mouse.move(guide.x + 200, guide.y + guide.height / 2);
    await page.mouse.down();
    await page.mouse.move(guide.x + 200, box.y + 5, { steps: 6 });
    await page.mouse.up();
    expect(await guides(page)).toEqual([]);
    await page.getByTestId('undo').click();
    expect(await guides(page)).toEqual([added]);
  });

  test('Add guides presets and snapping to guides', async ({ page }) => {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByTestId('menu-add-guides').click();
    await page.getByTestId('guides-3x3').check({ force: true });
    await page.getByTestId('apply-guides').click();
    expect(await guides(page)).toEqual([
      { axis: 'x', position: 360 },
      { axis: 'x', position: 720 },
      { axis: 'y', position: 360 },
      { axis: 'y', position: 720 },
    ]);
    await expect(page.getByTestId('guide')).toHaveCount(4);

    // A shape dragged near a guide snaps its edge onto it.
    const [id] = await insertNodes(
      page,
      [
        {
          type: 'shape',
          shape: 'rect',
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          fill: { type: 'solid', color: '#333333' },
        },
      ],
      { center: false },
    );
    await waitForCanvasIdle(page);
    const zoom = await page.evaluate(() => window.__opencanvas!.editor.state.get().camera.zoom);
    const from = await nodeCenter(page, id!);
    // Move right by ~157 page px: the left edge lands at ~257, near no guide; the right edge at ~357 → snaps to 360.
    await dragMouse(page, from, { x: from.x + 157 * zoom, y: from.y });
    const [node] = await getNodes(page);
    expect(node!.x + node!.width).toBe(360);
  });
});
