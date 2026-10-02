import { describe, expect, it } from 'vitest';
import {
  coverCrop,
  getPageBounds,
  getPageRotation,
  type ImageNode,
  type NodeRecord,
  resizeImageCrop,
  resizeLocalBox,
  type TextNode,
} from '../src';
import { cornerSet, createTestDoc, pageCorners, round } from './helpers';

describe('create / delete / duplicate', () => {
  it('creates nodes on top in order', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape' });
    const b = t.add({ type: 'shape' });
    expect(t.store.getChildIds(t.pageId)).toEqual([a.id, b.id]);
    expect(a.index < b.index).toBe(true);
  });

  it('rejects children for leaf nodes', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape' });
    expect(() => t.run('node.create', { parentId: a.id, nodes: [{ type: 'shape' }] })).toThrow();
  });

  it('deletes whole subtrees and skips locked nodes', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape' });
    const b = t.add({ type: 'shape', x: 300 });
    const { result } = t.run('node.group', { ids: [a.id, b.id] });
    const groupId = result.select![0]!;
    const locked = t.add({ type: 'shape', locked: true });
    t.run('node.delete', { ids: [groupId, locked.id] });
    expect(t.store.getNode(groupId)).toBeUndefined();
    expect(t.store.getNode(a.id)).toBeUndefined();
    expect(t.store.getNode(locked.id)).toBeDefined();
  });

  it('duplicates subtrees directly above the original with new ids', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 10, y: 10 });
    const c = t.add({ type: 'shape', x: 500 });
    const { result } = t.run('node.duplicate', { ids: [a.id] });
    const copy = t.store.getNode(result.select![0]!)!;
    expect(copy.id).not.toBe(a.id);
    expect(copy).toMatchObject({ x: 30, y: 30, type: 'shape' });
    expect(t.store.getChildIds(t.pageId)).toEqual([a.id, copy.id, c.id]);
  });
});

describe('group / ungroup', () => {
  it('groups nodes without moving them visually, and ungroups back', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 50, rotation: 30 });
    const b = t.add({ type: 'shape', x: 400, y: 300, width: 80, height: 80, flipX: true });
    const before = { a: pageCorners(t.store, a.id), b: pageCorners(t.store, b.id) };
    const { result } = t.run('node.group', { ids: [a.id, b.id] });
    const g = t.store.getNode(result.select![0]!)!;
    expect(g.type).toBe('group');
    expect(t.store.getChildIds(g.id)).toEqual([a.id, b.id]);
    expect(pageCorners(t.store, a.id)).toEqual(before.a);
    expect(pageCorners(t.store, b.id)).toEqual(before.b);

    // Rotate the group, then ungroup: children keep their rotated look.
    t.run('node.set-rotation', { ids: [g.id], rotation: 45 });
    const rotated = { a: cornerSet(t.store, a.id), b: cornerSet(t.store, b.id) };
    const { result: ungrouped } = t.run('node.ungroup', { ids: [g.id] });
    expect(ungrouped.select).toEqual([a.id, b.id]);
    expect(t.store.getNode(g.id)).toBeUndefined();
    expect(cornerSet(t.store, a.id)).toEqual(rotated.a);
    expect(cornerSet(t.store, b.id)).toEqual(rotated.b);
    expect(round(getPageRotation(t.store, t.store.getNode(a.id)!))).toBe(75);
  });

  it('keeps group bounds equal to children bounds after child edits', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 0, y: 0, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 200, y: 0, width: 100, height: 100 });
    const g = t.store.getNode(t.run('node.group', { ids: [a.id, b.id] }).result.select![0]!)!;
    expect(g).toMatchObject({ x: 0, y: 0, width: 300, height: 100 });
    t.run('node.translate', { ids: [b.id], dx: 100, dy: 50 });
    const g2 = t.store.getNode(g.id)!;
    expect(g2).toMatchObject({ x: 0, y: 0, width: 400, height: 150 });
    t.run('node.delete', { ids: [a.id] });
    expect(t.store.getNode(g.id)).toMatchObject({ x: 300, y: 50, width: 100, height: 100 });
    expect(getPageBounds(t.store, t.store.getNode(b.id)!)).toEqual({
      x: 300,
      y: 50,
      width: 100,
      height: 100,
    });
    t.run('node.delete', { ids: [b.id] });
    expect(t.store.getNode(g.id)).toBeUndefined(); // empty groups disappear
  });
});

describe('z-order', () => {
  it('brings forward / backward / front / back', () => {
    const t = createTestDoc();
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((name) => t.add({ type: 'shape', name }));
    const order = () => t.store.getChildren(t.pageId).map((n) => n.name);
    t.run('node.reorder', { ids: [a!.id], direction: 'forward' });
    expect(order()).toEqual(['b', 'a', 'c', 'd']);
    t.run('node.reorder', { ids: [a!.id], direction: 'front' });
    expect(order()).toEqual(['b', 'c', 'd', 'a']);
    t.run('node.reorder', { ids: [d!.id, c!.id], direction: 'back' });
    expect(order()).toEqual(['c', 'd', 'b', 'a']);
    t.run('node.reorder', { ids: [a!.id], direction: 'backward' });
    expect(order()).toEqual(['c', 'd', 'a', 'b']);
    // Already at the front: no change.
    const before = t.store.getRecords();
    t.run('node.reorder', { ids: [b!.id], direction: 'front' });
    expect(t.store.getRecords()).toEqual(before);
  });
});

describe('align / distribute / flip / rotate', () => {
  it('aligns to selection bounds and to the page', () => {
    const t = createTestDoc({ width: 1000, height: 800 });
    const a = t.add({ type: 'shape', x: 10, y: 10, width: 50, height: 50 });
    const b = t.add({ type: 'shape', x: 200, y: 300, width: 100, height: 20 });
    t.run('node.align', { ids: [a.id, b.id], alignment: 'right' });
    expect(t.store.getNode(a.id)!.x).toBe(250);
    t.run('node.align', { ids: [a.id], alignment: 'center' });
    expect(t.store.getNode(a.id)!.x).toBe(475);
    t.run('node.align', { ids: [b.id], alignment: 'bottom', relativeTo: 'page' });
    expect(t.store.getNode(b.id)!.y).toBe(780);
  });

  it('distributes with equal gaps', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 0, width: 10 });
    const b = t.add({ type: 'shape', x: 15, width: 30 });
    const c = t.add({ type: 'shape', x: 100, width: 10 });
    t.run('node.distribute', { ids: [a.id, b.id, c.id], axis: 'horizontal' });
    expect(t.store.getNode(b.id)!.x).toBe(40);
  });

  it('flips a single rotated node in place', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 200, height: 100, rotation: 30 });
    const bounds = getPageBounds(t.store, a);
    t.run('node.flip', { ids: [a.id], axis: 'horizontal' });
    const flipped = t.store.getNode(a.id)!;
    expect(flipped.flipX).toBe(true);
    expect(round(flipped.rotation)).toBe(-30);
    const after = getPageBounds(t.store, flipped);
    expect(round(after.x)).toBe(round(bounds.x));
    expect(round(after.width)).toBe(round(bounds.width));
    t.run('node.flip', { ids: [a.id], axis: 'horizontal' });
    expect(t.store.getNode(a.id)).toMatchObject({ flipX: false });
    expect(round(t.store.getNode(a.id)!.rotation)).toBe(30);
  });

  it('mirrors multiple nodes across their combined center', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 0, y: 0, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 300, y: 0, width: 100, height: 100 });
    t.run('node.flip', { ids: [a.id, b.id], axis: 'horizontal' });
    expect(t.store.getNode(a.id)).toMatchObject({ x: 300, flipX: true });
    expect(t.store.getNode(b.id)).toMatchObject({ x: 0, flipX: true });
  });

  it('rotates multiple nodes around the selection center', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 0, y: 0, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 200, y: 0, width: 100, height: 100 });
    t.run('node.rotate-by', { ids: [a.id, b.id], angle: 90 });
    const na = t.store.getNode(a.id)!;
    expect(round(na.x)).toBe(100);
    expect(round(na.y)).toBe(-100);
    expect(na.rotation).toBe(90);
  });
});

describe('resize math', () => {
  const opts = { keepAspect: false, fromCenter: false, minWidth: 1, minHeight: 1 };
  it('moves only the dragged edges', () => {
    expect(resizeLocalBox(100, 50, 'e', { x: 20, y: 99 }, opts)).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 50,
    });
    expect(resizeLocalBox(100, 50, 'nw', { x: 10, y: 10 }, opts)).toEqual({
      x: 10,
      y: 10,
      width: 90,
      height: 40,
    });
  });
  it('keeps aspect ratio on corners and resizes from center', () => {
    const r = resizeLocalBox(100, 50, 'se', { x: 100, y: 0 }, { ...opts, keepAspect: true });
    expect(r).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    const c = resizeLocalBox(100, 50, 'e', { x: 10, y: 0 }, { ...opts, fromCenter: true });
    expect(c).toEqual({ x: -10, y: 0, width: 120, height: 50 });
  });
  it('clamps at the minimum size instead of flipping', () => {
    expect(resizeLocalBox(100, 50, 'e', { x: -500, y: 0 }, opts).width).toBe(1);
  });
  it('crops images on side handles and stops at the image edge', () => {
    const start = { width: 200, height: 100, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } };
    const shrink = resizeImageCrop(start, { x: 0, y: 0, width: 100, height: 100 });
    expect(shrink.crop).toEqual({ x: 0.25, y: 0, width: 0.25, height: 1 });
    const grow = resizeImageCrop(start, { x: -1000, y: 0, width: 1200, height: 100 });
    expect(grow.crop.x).toBe(0);
    expect(grow.box.x).toBe(-100);
  });
  it('computes cover crops', () => {
    expect(coverCrop(200, 100, 100, 100)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(coverCrop(100, 200, 100, 100)).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
  });
});

describe('pages', () => {
  it('creates, duplicates, moves and deletes pages', () => {
    const t = createTestDoc();
    t.add({ type: 'shape', x: 5 });
    const { result: dup } = t.run('page.duplicate', { id: t.pageId });
    const copyId = dup.pageId!;
    expect(t.store.getPageIds()).toEqual([t.pageId, copyId]);
    expect(t.store.getChildren(copyId)).toHaveLength(1);
    t.run('page.move', { id: copyId, position: 0 });
    expect(t.store.getPageIds()).toEqual([copyId, t.pageId]);
    t.run('page.delete', { id: copyId });
    expect(t.store.getPageIds()).toEqual([t.pageId]);
    expect(() => t.run('page.delete', { id: t.pageId })).toThrow();
  });

  it('resizes the design scaling content to fit', () => {
    const t = createTestDoc({ width: 1000, height: 1000 });
    const a = t.add({ type: 'shape', x: 0, y: 0, width: 1000, height: 1000 });
    t.run('document.resize', { width: 500, height: 1000 });
    expect(t.store.getNode(a.id)).toMatchObject({ x: 0, y: 250, width: 500, height: 500 });
    expect(t.store.getPage(t.pageId)).toMatchObject({ width: 500, height: 1000 });
  });
});

describe('text', () => {
  it('auto-sizes text boxes as content changes', () => {
    const t = createTestDoc();
    const text = t.add({
      type: 'text',
      sizing: 'auto-width',
      content: { paragraphs: [{ runs: [{ text: 'ab', style: {} }], list: 'none', indent: 0 }] },
      style: { fontFamily: 'Inter', fontSize: 20 } as never,
    }) as TextNode;
    // Mock measurer: 'a','b' = 0.55em each → 22px, line height 1.4 → 28px
    expect(text.width).toBeCloseTo(22);
    expect(text.height).toBeCloseTo(28);
    t.run('text.set-content', {
      id: text.id,
      content: {
        paragraphs: [
          { runs: [{ text: 'abab', style: {} }], list: 'none', indent: 0 },
          { runs: [{ text: 'x', style: {} }] },
        ],
      },
    });
    const after = t.store.getNode(text.id) as TextNode;
    expect(after.width).toBeCloseTo(44);
    expect(after.height).toBeCloseTo(56);
  });

  it('grows right-aligned text to the left', () => {
    const t = createTestDoc();
    const text = t.add({
      type: 'text',
      x: 500,
      sizing: 'auto-width',
      align: 'right',
      content: { paragraphs: [{ runs: [{ text: 'مرحبا', style: {} }], list: 'none', indent: 0 }] },
    }) as TextNode;
    const right = text.x + text.width;
    t.run('text.set-content', {
      id: text.id,
      content: { paragraphs: [{ runs: [{ text: 'مرحبا بالعالم', style: {} }], list: 'none', indent: 0 }] },
    });
    const after = t.store.getNode(text.id) as TextNode;
    expect(after.width).toBeGreaterThan(text.width);
    expect(round(after.x + after.width, 6)).toBe(round(right, 6));
  });

  it('applies node-level style and clears run overrides', () => {
    const t = createTestDoc();
    const text = t.add({
      type: 'text',
      content: {
        paragraphs: [
          {
            runs: [
              { text: 'a', style: { color: '#ff0000' } },
              { text: 'b', style: {} },
            ],
            list: 'none',
            indent: 0,
          },
        ],
      },
    }) as TextNode;
    t.run('text.set-style', { ids: [text.id], style: { color: '#00ff00', fontWeight: 700 } });
    const after = t.store.getNode(text.id) as TextNode;
    expect(after.style.color).toBe('#00ff00');
    expect(after.content.paragraphs[0]!.runs).toEqual([{ text: 'ab', style: {} }]);
  });

  it('scales font size when a group is resized uniformly', () => {
    const t = createTestDoc();
    const a = t.add({
      type: 'text',
      style: { fontSize: 20 } as never,
      content: { paragraphs: [{ runs: [{ text: 'Hi', style: {} }] }] } as never,
    });
    const b = t.add({ type: 'shape', x: 300 });
    const groupId = t.run('node.group', { ids: [a.id, b.id] }).result.select![0]!;
    const g = t.store.getNode(groupId)!;
    t.run('node.set-size', { id: groupId, width: g.width * 2, keepAspect: true });
    expect((t.store.getNode(a.id) as TextNode).style.fontSize).toBe(40);
  });
});

describe('images', () => {
  it('replaces images with a cover crop', () => {
    const t = createTestDoc();
    const assetBase = { mimeType: 'image/png', size: 10, hash: `sha256-${'a'.repeat(64)}` };
    t.run('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_1',
        kind: 'image',
        name: '',
        src: null,
        width: 100,
        height: 100,
        ...assetBase,
      },
    });
    t.run('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_2',
        kind: 'image',
        name: '',
        src: null,
        width: 400,
        height: 100,
        ...assetBase,
      },
    });
    const img = t.add({ type: 'image', assetId: 'asset_1', width: 100, height: 100 }) as ImageNode;
    t.run('image.replace', { id: img.id, assetId: 'asset_2' });
    expect((t.store.getNode(img.id) as ImageNode).crop).toEqual({ x: 0.375, y: 0, width: 0.25, height: 1 });
  });
});

describe('updates are validated', () => {
  it('rejects invalid patches atomically', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape' });
    const b = t.add({ type: 'shape' });
    expect(() => t.run('node.update', { ids: [a.id, b.id], patch: { opacity: 5 } })).toThrow();
    expect((t.store.getNode(a.id) as NodeRecord).opacity).toBe(1);
  });
});
