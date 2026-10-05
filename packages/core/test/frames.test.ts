import { describe, expect, it } from 'vitest';
import { createAssetRecord, type FrameNode, getFrameAtPoint, History, type ImageNode } from '../src';
import { createTestDoc, pageCorners } from './helpers';

const HASH = `sha256-${'a'.repeat(64)}`;
const HASH2 = `sha256-${'b'.repeat(64)}`;

function setup() {
  const t = createTestDoc();
  const wide = createAssetRecord({
    id: 'asset_wide',
    hash: HASH,
    mimeType: 'image/png',
    width: 400,
    height: 200,
    size: 1000,
    name: 'wide.png',
  });
  const tall = createAssetRecord({
    id: 'asset_tall',
    hash: HASH2,
    mimeType: 'image/png',
    width: 100,
    height: 300,
    size: 1000,
    name: 'tall.png',
  });
  t.run('asset.add', { asset: wide });
  t.run('asset.add', { asset: tall });
  const frame = t.add({
    type: 'frame',
    shape: 'ellipse',
    x: 100,
    y: 100,
    width: 200,
    height: 200,
  }) as FrameNode;
  return { ...t, frame };
}

const imagesIn = (t: ReturnType<typeof setup>, id: string) =>
  t.store.getChildren(id).filter((n): n is ImageNode => n.type === 'image');

describe('photo frames', () => {
  it('fills a frame with an asset, cover-cropped to the frame box', () => {
    const t = setup();
    const { result } = t.run('frame.fill', { frameId: t.frame.id, assetId: 'asset_wide' });
    const [image] = imagesIn(t, t.frame.id);
    expect(result.select).toEqual([image!.id]);
    expect(image).toMatchObject({ x: 0, y: 0, width: 200, height: 200, name: 'wide.png' });
    // A 2:1 photo in a square frame shows its middle half.
    expect(image!.crop).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('replaces the previous photo instead of stacking photos', () => {
    const t = setup();
    t.run('frame.fill', { frameId: t.frame.id, assetId: 'asset_wide' });
    t.run('frame.fill', { frameId: t.frame.id, assetId: 'asset_tall' });
    const images = imagesIn(t, t.frame.id);
    expect(images).toHaveLength(1);
    expect(images[0]!.assetId).toBe('asset_tall');
    const crop = images[0]!.crop;
    expect([crop.x, crop.y, crop.width, crop.height].map((v) => +v.toFixed(9))).toEqual([
      0, 0.333333333, 1, 0.333333333,
    ]);
  });

  it('moves an existing image element into a frame', () => {
    const t = setup();
    const photo = t.add({
      type: 'image',
      assetId: 'asset_wide',
      x: 600,
      y: 400,
      width: 300,
      height: 150,
      rotation: 30,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
    t.run('frame.fill', { frameId: t.frame.id, imageId: photo.id });
    const moved = t.store.getNode(photo.id) as ImageNode;
    expect(moved).toMatchObject({ parentId: t.frame.id, x: 0, y: 0, width: 200, height: 200, rotation: 0 });
    expect(t.store.getChildren(t.pageId).map((n) => n.id)).toEqual([t.frame.id]);
  });

  it('follows rotated frames inside groups', () => {
    const t = setup();
    const group = t.add({
      type: 'group',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 15,
      children: [
        { type: 'shape', shape: 'rect', x: 0, y: 0, width: 400, height: 300 },
        { type: 'frame', shape: 'rect', x: 50, y: 50, width: 120, height: 80 },
      ],
    });
    const inner = t.store.getChildren(group.id).find((n) => n.type === 'frame')!;
    t.run('frame.fill', { frameId: inner.id, assetId: 'asset_tall' });
    const [image] = imagesIn(t, inner.id);
    // The photo covers exactly the frame on the page.
    expect(pageCorners(t.store, image!.id, 4)).toEqual(pageCorners(t.store, inner.id, 4));
  });

  it('rejects locked frames, non-frames and missing assets', () => {
    const t = setup();
    t.run('node.update', { ids: [t.frame.id], patch: { locked: true } });
    expect(() => t.run('frame.fill', { frameId: t.frame.id, assetId: 'asset_wide' })).toThrow(/locked/);
    const shape = t.add({ type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10 });
    expect(() => t.run('frame.fill', { frameId: shape.id, assetId: 'asset_wide' })).toThrow(/Not a frame/);
    const open = t.add({ type: 'frame', shape: 'rect', x: 0, y: 0, width: 10, height: 10 });
    expect(() => t.run('frame.fill', { frameId: open.id, assetId: 'asset_missing' })).toThrow(/not found/);
    expect(() => t.run('frame.fill', { frameId: open.id })).toThrow(/exactly one/);
  });

  it('detaches the image at the same place on the page', () => {
    const t = setup();
    t.run('frame.fill', { frameId: t.frame.id, assetId: 'asset_wide' });
    const [image] = imagesIn(t, t.frame.id);
    const before = pageCorners(t.store, image!.id, 4);
    const { result } = t.run('frame.detach', { frameId: t.frame.id });
    expect(result.select).toEqual([image!.id]);
    const detached = t.store.getNode(image!.id)!;
    expect(detached.parentId).toBe(t.pageId);
    expect(pageCorners(t.store, detached.id, 4)).toEqual(before);
    // Directly above the frame in the layer order.
    const order = t.store.getChildren(t.pageId).map((n) => n.id);
    expect(order.indexOf(detached.id)).toBe(order.indexOf(t.frame.id) + 1);
    expect(() => t.run('frame.detach', { frameId: t.frame.id })).toThrow(/no image/);
  });

  it('fill and detach are single undo steps', () => {
    const t = setup();
    const history = new History(t.store);
    const before = t.store.getRecords();
    history.run(() => t.run('frame.fill', { frameId: t.frame.id, assetId: 'asset_wide' }), { label: 'Fill' });
    const filled = t.store.getRecords();
    history.run(() => t.run('frame.detach', { frameId: t.frame.id }), { label: 'Detach' });
    history.undo();
    expect(t.store.getRecords()).toEqual(filled);
    history.undo();
    expect(t.store.getRecords()).toEqual(before);
  });
});

describe('getFrameAtPoint', () => {
  it('finds the innermost unlocked frame under a point, through groups and covering elements', () => {
    const t = setup();
    const mockup = t.add({
      type: 'group',
      x: 500,
      y: 100,
      width: 200,
      height: 400,
      children: [
        { type: 'shape', shape: 'rect', x: 0, y: 0, width: 200, height: 400 },
        { type: 'frame', shape: 'rect', x: 20, y: 20, width: 160, height: 360 },
        { type: 'shape', shape: 'rect', x: 0, y: 0, width: 200, height: 40 },
      ],
    });
    const screen = t.store.getChildren(mockup.id).find((n) => n.type === 'frame')!;
    expect(getFrameAtPoint(t.store, t.pageId, { x: 600, y: 300 })?.id).toBe(screen.id);
    // Covered by the top bar of the mockup, still the screen frame.
    expect(getFrameAtPoint(t.store, t.pageId, { x: 600, y: 130 })?.id).toBe(screen.id);
    // Outside the ellipse shape of the first frame (its corner).
    expect(getFrameAtPoint(t.store, t.pageId, { x: 105, y: 105 })).toBeNull();
    expect(getFrameAtPoint(t.store, t.pageId, { x: 200, y: 200 })?.id).toBe(t.frame.id);
    t.run('node.update', { ids: [t.frame.id], patch: { locked: true } });
    expect(getFrameAtPoint(t.store, t.pageId, { x: 200, y: 200 })).toBeNull();
    expect(
      getFrameAtPoint(t.store, t.pageId, { x: 600, y: 300 }, { exclude: new Set([screen.id]) }),
    ).toBeNull();
  });
});

describe('nested creation', () => {
  it('creates groups and frames with children in one command', () => {
    const t = setup();
    const polaroid = t.add({
      type: 'group',
      x: 10,
      y: 10,
      width: 220,
      height: 260,
      children: [
        {
          type: 'shape',
          shape: 'rect',
          x: 0,
          y: 0,
          width: 220,
          height: 260,
          fill: { type: 'solid', color: '#ffffff' },
        },
        { type: 'frame', shape: 'rect', x: 10, y: 10, width: 200, height: 200 },
      ],
    });
    const kids = t.store.getChildren(polaroid.id);
    expect(kids.map((n) => n.type)).toEqual(['shape', 'frame']);
    expect(t.store.getNode(polaroid.id)).toMatchObject({ width: 220, height: 260 });
    expect(() =>
      t.add({ type: 'shape', shape: 'rect', children: [{ type: 'shape', shape: 'rect' }] } as never),
    ).toThrow();
  });
});
