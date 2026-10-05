import { createAssetRecord, type ImageNode } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers';

function setup() {
  const t = createTestEditor();
  t.editor.execute('asset.add', {
    asset: createAssetRecord({
      id: 'asset_photo',
      hash: `sha256-${'c'.repeat(64)}`,
      mimeType: 'image/jpeg',
      width: 300,
      height: 200,
      size: 100,
      name: 'photo.jpg',
    }),
  });
  const frame = t.add({ type: 'frame', shape: 'ellipse', x: 500, y: 100, width: 200, height: 200 });
  const photo = t.add({
    type: 'image',
    assetId: 'asset_photo',
    x: 50,
    y: 400,
    width: 150,
    height: 100,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  });
  return { ...t, frame, photo };
}

describe('dragging images into frames', () => {
  it('highlights the frame under a dragged image and places the image inside on drop', () => {
    const t = setup();
    t.editor.select([t.photo]);
    t.editor.pointerDown(t.pointer(125, 450));
    t.editor.pointerMove(t.pointer(400, 300));
    t.editor.pointerMove(t.pointer(600, 200));
    expect(t.editor.state.get().dropTargetId).toBe(t.frame);
    t.editor.pointerUp(t.pointer(600, 200));
    const image = t.store.getNode(t.photo) as ImageNode;
    expect(image).toMatchObject({ parentId: t.frame, x: 0, y: 0, width: 200, height: 200 });
    expect(t.editor.state.get().dropTargetId).toBeNull();
    expect(t.editor.selectedIds).toEqual([t.photo]);
    // One undo step restores the photo where it was.
    t.editor.undo();
    expect(t.store.getNode(t.photo)).toMatchObject({ parentId: t.pageId, x: 50, y: 400 });
  });

  it('a normal move away from frames stays a move', () => {
    const t = setup();
    t.editor.select([t.photo]);
    t.drag([125, 450], [325, 650]);
    expect(t.store.getNode(t.photo)).toMatchObject({ parentId: t.pageId, x: 250, y: 600 });
  });

  it('Escape cancels the drag and the highlight', () => {
    const t = setup();
    t.editor.select([t.photo]);
    t.editor.pointerDown(t.pointer(125, 450));
    t.editor.pointerMove(t.pointer(600, 200));
    expect(t.editor.state.get().dropTargetId).toBe(t.frame);
    t.key('Escape');
    expect(t.editor.state.get().dropTargetId).toBeNull();
    expect(t.store.getNode(t.photo)).toMatchObject({ parentId: t.pageId, x: 50, y: 400 });
  });

  it('other elements and multi-selections never drop into frames', () => {
    const t = setup();
    const box = t.add({ type: 'shape', shape: 'rect', x: 50, y: 600, width: 50, height: 50 });
    t.editor.select([box]);
    t.editor.pointerDown(t.pointer(75, 625));
    t.editor.pointerMove(t.pointer(600, 200));
    expect(t.editor.state.get().dropTargetId).toBeNull();
    t.editor.pointerUp(t.pointer(600, 200));
    expect(t.store.getNode(box)!.parentId).toBe(t.pageId);
  });
});
