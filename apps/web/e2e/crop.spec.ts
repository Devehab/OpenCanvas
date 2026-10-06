import { expect, test } from '@playwright/test';
import {
  createDesign,
  dragMouse,
  getNodes,
  nodeCenter,
  openPanel,
  samplePng,
  waitForCanvasIdle,
} from './support';

test('double-click a photo to crop it inside its box; one undo step', async ({ page }) => {
  await createDesign(page);
  await openPanel(page, 'uploads');
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: samplePng(800, 400) }]);
  await expect.poll(async () => (await getNodes(page)).length).toBe(1);
  // Square box over a 2:1 photo: the middle half is visible.
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    const [id] = editor.selectedIds;
    editor.execute('node.update', {
      ids: [id],
      patch: { x: 340, y: 340, width: 400, height: 400, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
    });
  });
  await waitForCanvasIdle(page);
  const [image] = await getNodes(page);
  const center = await nodeCenter(page, image!.id);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId('crop-bar')).toBeVisible();

  // Drag the photo to the right: the element stays, the photo moves.
  const zoom = await page.evaluate(() => window.__opencanvas!.editor.state.get().camera.zoom);
  await dragMouse(page, center, { x: center.x + 100 * zoom, y: center.y });
  let [after] = (await getNodes(page)) as { x: number; crop: { x: number } }[];
  expect(after!.x).toBe(340);
  expect(after!.crop.x).toBeCloseTo(0.25 - 100 / 800, 2);

  await page.getByTestId('crop-done').click();
  await expect(page.getByTestId('crop-bar')).toHaveCount(0);
  await page.getByTestId('undo').click();
  [after] = (await getNodes(page)) as { x: number; crop: { x: number } }[];
  expect(after!.crop.x).toBeCloseTo(0.25, 5);
});
