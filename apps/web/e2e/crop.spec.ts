import { expect, test } from './fixtures';
import {
  createDesign,
  dragMouse,
  getNodes,
  nodeCenter,
  openPanel,
  samplePng,
  toScreen,
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

test('leaving crop mode removes the faded preview outside the box', async ({ page }) => {
  await createDesign(page);
  await openPanel(page, 'uploads');
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: samplePng(800, 400) }]);
  await expect.poll(async () => (await getNodes(page)).length).toBe(1);
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    const [id] = editor.selectedIds;
    editor.execute('node.update', {
      ids: [id],
      patch: { x: 340, y: 340, width: 400, height: 400, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
    });
  });
  await waitForCanvasIdle(page);
  // A point left of the box, where the hidden part of the photo is shown faded while cropping.
  // Located on screen when it is read (the layout may still settle), and read until drawn.
  const sceneColor = () =>
    page.evaluate(() => {
      const { editor } = window.__opencanvas!;
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="scene"]')!;
      const p = editor.pageToScreen({ x: 300, y: 540 });
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      const [red, green, blue] = canvas
        .getContext('2d')!
        .getImageData(Math.round(p.x * scale), Math.round(p.y * scale), 1, 1).data;
      return red! + green! + blue!;
    });
  await expect.poll(sceneColor).toBe(255 * 3); // white page

  const [image] = await getNodes(page);
  const center = await nodeCenter(page, image!.id);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId('crop-bar')).toBeVisible();
  await expect.poll(sceneColor).toBeLessThan(255 * 3); // faded photo visible

  // Done without changing anything: the page is white again.
  await page.getByTestId('crop-done').click();
  await expect(page.getByTestId('crop-bar')).toHaveCount(0);
  await expect.poll(sceneColor).toBe(255 * 3);
});

test('resizing a photo frame keeps the photo covering it, like Canva', async ({ page }) => {
  await createDesign(page);
  await openPanel(page, 'uploads');
  await page
    .getByTestId('upload-input')
    .setInputFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: samplePng(800, 400) }]);
  await expect.poll(async () => (await getNodes(page)).length).toBe(1);
  // A 300×300 frame (placed in the middle of the page) holding the 2:1 photo (the middle half shows).
  await page.evaluate(() => {
    const { editor } = window.__opencanvas!;
    const [imageId] = editor.selectedIds;
    const [frameId] = editor.insertNodes([{ type: 'frame', width: 300, height: 300, shape: 'rect' }]);
    editor.execute('frame.fill', { frameId, imageId });
    editor.select([frameId!]);
  });
  await waitForCanvasIdle(page);
  type Box = { x: number; y: number; width: number; height: number };
  const state = async () => {
    const [frame, photo] = (await getNodes(page)) as (Box & { type: string; crop: Box })[];
    return { frame: frame!, photo: photo! };
  };
  // The photo always fills the frame, undistorted (crop proportions = frame proportions).
  const expectCovering = async () => {
    const { frame, photo } = await state();
    expect(photo).toMatchObject({ x: 0, y: 0, width: frame.width, height: frame.height });
    const { crop } = photo;
    expect(crop.x).toBeGreaterThanOrEqual(-1e-6);
    expect(crop.y).toBeGreaterThanOrEqual(-1e-6);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-6);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-6);
    expect((crop.width * 800) / (crop.height * 400)).toBeCloseTo(frame.width / frame.height, 2);
    return { frame, photo };
  };

  // Wider from the right edge: the hidden sides of the photo come into view.
  const { x: left, y: top } = (await state()).frame;
  const right = await toScreen(page, { x: left + 300, y: top + 150 });
  const zoom = await page.evaluate(() => window.__opencanvas!.editor.state.get().camera.zoom);
  await dragMouse(page, right, { x: right.x + 150 * zoom, y: right.y });
  let { frame, photo } = await expectCovering();
  expect(frame.width).toBeCloseTo(450, 0);
  expect(frame.height).toBe(300);
  expect(photo.crop.height).toBeCloseTo(1, 5);
  expect(photo.crop.x).toBeCloseTo((1 - photo.crop.width) / 2, 2);

  // Taller from the bottom edge: no spare height, so the photo zooms in to cover.
  const bottom = await toScreen(page, { x: left + frame.width / 2, y: top + 300 });
  await dragMouse(page, bottom, { x: bottom.x, y: bottom.y + 200 * zoom });
  ({ frame, photo } = await expectCovering());
  expect(frame.height).toBeCloseTo(500, 0);

  // From a corner: frame and photo scale together, the same part stays visible.
  const before = photo.crop;
  const corner = await toScreen(page, { x: left + frame.width, y: top + frame.height });
  await dragMouse(page, corner, { x: corner.x - 100 * zoom, y: corner.y - 100 * zoom });
  ({ frame, photo } = await expectCovering());
  expect(frame.width).toBeLessThan(450);
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(photo.crop[k]).toBeCloseTo(before[k], 3);
});
