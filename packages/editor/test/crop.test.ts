import { createAssetRecord, type ImageNode } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers';

function setup() {
  const t = createTestEditor();
  t.editor.execute('asset.add', {
    asset: createAssetRecord({
      id: 'asset_photo',
      hash: `sha256-${'e'.repeat(64)}`,
      mimeType: 'image/jpeg',
      width: 800,
      height: 400,
      size: 100,
      name: 'photo.jpg',
    }),
  });
  // A 200×200 box showing the middle of a 2:1 photo: the whole photo is 400×200 here.
  const id = t.add({
    type: 'image',
    assetId: 'asset_photo',
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
  });
  const image = () => t.store.getNode(id) as ImageNode;
  return { ...t, id, image };
}

describe('crop mode', () => {
  it('double-click enters crop mode; dragging moves the photo, not the element', () => {
    const t = setup();
    t.editor.doubleClick(t.pointer(200, 200));
    expect(t.editor.croppingId).toBe(t.id);
    t.drag([200, 200], [250, 200]);
    expect(t.image()).toMatchObject({ x: 100, y: 100, width: 200, height: 200 });
    expect(t.image().crop.x).toBeCloseTo(0.125);
    t.key('Enter');
    expect(t.editor.croppingId).toBeNull();
  });

  it('the whole crop session is one undo step; undo while cropping discards it', () => {
    const t = setup();
    t.editor.startCrop(t.id);
    t.drag([200, 200], [150, 200]);
    t.drag([200, 200], [180, 200]);
    t.editor.finishCrop();
    expect(t.image().crop.x).toBeCloseTo(0.25 + 70 / 400);
    t.editor.undo();
    expect(t.image().crop.x).toBeCloseTo(0.25);

    t.editor.startCrop(t.id);
    t.drag([200, 200], [150, 200]);
    t.key('z', { ctrlKey: true });
    expect(t.editor.croppingId).toBeNull();
    expect(t.image().crop.x).toBeCloseTo(0.25);
  });

  it('dragging the crop box edge reveals more of the photo', () => {
    const t = setup();
    t.editor.startCrop(t.id);
    // East edge handle of the crop box at (300, 200) → drag 50 right.
    t.drag([300, 200], [350, 200]);
    t.editor.finishCrop();
    expect(t.image()).toMatchObject({ x: 100, width: 250 });
    expect(t.image().crop.width).toBeCloseTo(0.625);
  });

  it('dragging a photo corner scales the photo around the opposite corner', () => {
    const t = setup();
    t.editor.startCrop(t.id);
    // The whole photo spans x 0…400 (page), y 100…300; drag its bottom-right corner.
    t.drag([400, 300], [500, 350]);
    t.editor.finishCrop();
    const img = t.image();
    expect(img).toMatchObject({ width: 200, height: 200 });
    // 1.25× bigger photo: 500×250, anchored at its top-left (page 0, 100).
    expect(img.crop.width).toBeCloseTo(200 / 500);
    expect(img.crop.x).toBeCloseTo(100 / 500);
    expect(img.crop.height).toBeCloseTo(200 / 250);
  });

  it('clicking outside the photo ends crop mode; reset shows the whole photo', () => {
    const t = setup();
    t.editor.startCrop(t.id);
    t.click(900, 700);
    expect(t.editor.croppingId).toBeNull();
    t.editor.select([t.id]);
    t.editor.resetCrop();
    expect(t.image()).toMatchObject({ width: 200, height: 100, crop: { x: 0, y: 0, width: 1, height: 1 } });
  });
});
