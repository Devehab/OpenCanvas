import type { ImageNode, LineNode, TextNode } from '@opencanvas/core';
import { getPageBounds } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers';

describe('selection', () => {
  it('click selects, shift-click toggles, clicking empty canvas deselects', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 400, y: 100, width: 100, height: 100 });
    t.click(150, 150);
    expect(t.editor.selectedIds).toEqual([a]);
    t.click(450, 150, { shiftKey: true });
    expect(t.editor.selectedIds).toEqual([a, b]);
    t.click(450, 150, { shiftKey: true });
    expect(t.editor.selectedIds).toEqual([a]);
    t.click(800, 700);
    expect(t.editor.selectedIds).toEqual([]);
  });

  it('marquee-selects intersecting elements', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 300, y: 100, width: 100, height: 100 });
    t.add({ type: 'shape', x: 700, y: 600, width: 50, height: 50 });
    t.drag([50, 50], [320, 150]);
    expect([...t.editor.selectedIds].sort()).toEqual([a, b].sort());
    expect(t.editor.state.get().marquee).toBeNull();
  });

  it('selects groups as a whole; double-click enters the group', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 300, y: 100, width: 100, height: 100 });
    t.editor.select([a, b]);
    t.key('g', { metaKey: true });
    const group = t.editor.selectedIds[0]!;
    expect(t.store.getNode(group)!.type).toBe('group');
    t.click(800, 700);
    t.click(150, 150);
    expect(t.editor.selectedIds).toEqual([group]);
    t.editor.doubleClick(t.pointer(350, 150));
    expect(t.editor.selectedIds).toEqual([b]);
    expect(t.editor.state.get().focusedGroupId).toBe(group);
    // Inside the group, a click selects siblings.
    t.click(150, 150);
    expect(t.editor.selectedIds).toEqual([a]);
    t.key('Escape');
    expect(t.editor.selectedIds).toEqual([group]);
    expect(t.editor.state.get().focusedGroupId).toBeNull();
  });
});

describe('dragging', () => {
  it('moves the selection as one undo step', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    t.editor.state.set({ snapping: false });
    t.drag([150, 150], [250, 210], {}, 10);
    expect(t.store.getNode(a)).toMatchObject({ x: 200, y: 160 });
    const entries = t.editor.history.getUndoStack();
    expect(entries[entries.length - 1]!.label).toBe('Move');
    t.editor.undo();
    expect(t.store.getNode(a)).toMatchObject({ x: 100, y: 100 });
  });

  it('snaps to the page center and shows guides', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    t.editor.pointerDown(t.pointer(150, 150));
    t.editor.pointerMove(t.pointer(300, 150));
    t.editor.pointerMove(t.pointer(497, 150)); // center would be 497 → snaps to the page center (500)
    expect(t.store.getNode(a)!.x).toBe(450);
    expect(t.editor.state.get().guides.some((g) => g.axis === 'x' && g.position === 500)).toBe(true);
    t.editor.pointerUp(t.pointer(497, 150));
    expect(t.editor.state.get().guides).toEqual([]);
  });

  it('locks to an axis with Shift and duplicates with Alt', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    t.editor.state.set({ snapping: false });
    t.drag([150, 150], [260, 170], { shiftKey: true });
    expect(t.store.getNode(a)).toMatchObject({ x: 210, y: 100 });
    t.drag([260, 150], [260, 400], { altKey: true });
    expect(t.store.getNode(a)).toMatchObject({ x: 210, y: 100 });
    const copy = t.editor.selectedIds[0]!;
    expect(copy).not.toBe(a);
    expect(t.store.getNode(copy)).toMatchObject({ x: 210, y: 350 });
    t.editor.undo();
    expect(t.store.getNode(copy)).toBeUndefined();
  });

  it('cancels a drag with Escape', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    t.editor.pointerDown(t.pointer(150, 150));
    t.editor.pointerMove(t.pointer(400, 400));
    t.key('Escape');
    expect(t.store.getNode(a)).toMatchObject({ x: 100, y: 100 });
  });

  it('does not move locked elements', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100, locked: true });
    t.drag([150, 150], [400, 400]);
    expect(t.store.getNode(a)).toMatchObject({ x: 100, y: 100 });
    expect(t.editor.getSelectionFrame()!.handles).toEqual([]);
  });
});

describe('handles', () => {
  it('resizes a shape from the bottom-right handle', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    t.editor.select([a]);
    t.editor.state.set({ snapping: false });
    t.drag([200, 200], [300, 250]);
    expect(t.store.getNode(a)).toMatchObject({ x: 100, y: 100, width: 200, height: 150 });
  });

  it('keeps image aspect on corners and crops on sides', () => {
    const t = createTestEditor();
    t.editor.execute('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_1',
        kind: 'image',
        name: '',
        mimeType: 'image/png',
        width: 400,
        height: 200,
        size: 1,
        hash: `sha256-${'a'.repeat(64)}`,
        src: null,
      },
    });
    const img = t.add({ type: 'image', assetId: 'asset_1', x: 100, y: 100, width: 200, height: 100 });
    t.editor.select([img]);
    t.editor.state.set({ snapping: false });
    t.drag([300, 200], [400, 210]);
    const scaled = t.store.getNode(img) as ImageNode;
    expect(scaled.width / scaled.height).toBeCloseTo(2);
    expect(scaled.width).toBeCloseTo(300);
    // Right side handle shrinks the visible area (crop), keeping the image scale.
    t.drag([400, 175], [250, 175]);
    const cropped = t.store.getNode(img) as ImageNode;
    expect(cropped.width).toBeCloseTo(150);
    expect(cropped.crop.width).toBeCloseTo(0.5);
  });

  it('scales text font size from corners and changes width from sides', () => {
    const t = createTestEditor();
    const text = t.add({
      type: 'text',
      x: 100,
      y: 100,
      sizing: 'auto-width',
      content: { paragraphs: [{ runs: [{ text: 'Hello', style: {} }], list: 'none', indent: 0 }] },
      style: { fontFamily: 'Inter', fontSize: 20 } as never,
    });
    t.editor.select([text]);
    t.editor.state.set({ snapping: false });
    const before = t.store.getNode(text) as TextNode;
    t.drag([100 + before.width, 100 + before.height], [100 + before.width * 2, 100 + before.height * 2]);
    const scaled = t.store.getNode(text) as TextNode;
    expect(scaled.style.fontSize).toBeCloseTo(40);
    t.drag([100 + scaled.width, 100 + scaled.height / 2], [100 + 60, 100 + scaled.height / 2]);
    const wrapped = t.store.getNode(text) as TextNode;
    expect(wrapped.sizing).toBe('auto-height');
    expect(wrapped.width).toBeCloseTo(60);
    expect(wrapped.height).toBeGreaterThan(scaled.height); // text wrapped onto more lines
  });

  it('rotates with 15° snapping when Shift is held', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    t.editor.select([a]);
    const rotate = t.editor.getSelectionFrame()!.handles.find((h) => h.kind === 'rotate')!;
    // Pivot (150,150); handle below center. Drag to the right of the pivot ≈ −80°.
    t.drag([rotate.point.x, rotate.point.y], [250, 165], { shiftKey: true });
    expect(t.store.getNode(a)!.rotation).toBe(-75);
  });

  it('scales multi-selections uniformly', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100, width: 100, height: 100 });
    const b = t.add({ type: 'shape', x: 300, y: 100, width: 100, height: 100 });
    t.editor.select([a, b]);
    t.editor.state.set({ snapping: false });
    t.drag([400, 200], [700, 300]); // se corner of the 300×100 selection, doubled width
    expect(t.store.getNode(a)).toMatchObject({ x: 100, y: 100, width: 200, height: 200 });
    expect(t.store.getNode(b)).toMatchObject({ x: 500, y: 100, width: 200, height: 200 });
  });

  it('moves line endpoints', () => {
    const t = createTestEditor();
    const line = t.add({ type: 'line', x: 100, y: 98, width: 200, height: 4 });
    t.editor.select([line]);
    t.drag([300, 100], [100, 300]);
    const l = t.store.getNode(line) as LineNode;
    expect(l.width).toBeCloseTo(200);
    expect(l.rotation).toBeCloseTo(90);
    const b = getPageBounds(t.store, l);
    expect(b.x + b.width / 2).toBeCloseTo(100);
  });
});

describe('creation tools', () => {
  it('draws a rectangle by dragging and returns to select', () => {
    const t = createTestEditor();
    t.key('r');
    expect(t.editor.state.get().tool).toBe('rect');
    t.drag([100, 100], [250, 180]);
    const id = t.editor.selectedIds[0]!;
    expect(t.store.getNode(id)).toMatchObject({ type: 'shape', x: 100, y: 100, width: 150, height: 80 });
    expect(t.editor.state.get().tool).toBe('select');
    expect(t.editor.history.undoLabel).toBe('Add rect');
  });

  it('creates text and removes it without history if nothing was typed', () => {
    const t = createTestEditor();
    const before = t.editor.history.getUndoStack().length;
    t.key('t');
    t.click(100, 100);
    const id = t.editor.state.get().editingTextId!;
    expect(t.store.getNode(id)!.type).toBe('text');
    t.key('Escape');
    expect(t.store.getNode(id)).toBeUndefined();
    expect(t.editor.history.getUndoStack().length).toBe(before);
  });

  it('typing into a new text box is one undo step', () => {
    const t = createTestEditor();
    t.key('t');
    t.click(100, 100);
    const id = t.editor.state.get().editingTextId!;
    for (const text of ['H', 'He', 'Hel', 'Hello']) {
      t.editor.updateEditingText({ paragraphs: [{ runs: [{ text, style: {} }], list: 'none', indent: 0 }] });
    }
    t.click(900, 700);
    expect((t.store.getNode(id) as TextNode).content.paragraphs[0]!.runs[0]!.text).toBe('Hello');
    expect(t.editor.history.undoLabel).toBe('Add text');
    t.editor.undo();
    expect(t.store.getNode(id)).toBeUndefined();
  });
});

describe('keyboard', () => {
  it('nudges with arrows, coalescing quick repeats into one undo step', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100 });
    t.editor.select([a]);
    const before = t.editor.history.getUndoStack().length;
    t.key('ArrowRight');
    t.tick(100);
    t.key('ArrowRight', { shiftKey: true });
    t.tick(100);
    t.key('ArrowDown');
    expect(t.store.getNode(a)).toMatchObject({ x: 111, y: 101 });
    expect(t.editor.history.getUndoStack().length).toBe(before + 1);
  });

  it('deletes, duplicates, undoes and redoes', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100 });
    t.editor.select([a]);
    t.key('d', { metaKey: true });
    const copy = t.editor.selectedIds[0]!;
    expect(copy).not.toBe(a);
    t.key('Delete');
    expect(t.store.getNode(copy)).toBeUndefined();
    t.key('z', { ctrlKey: true });
    expect(t.store.getNode(copy)).toBeDefined();
    expect(t.editor.selectedIds).toEqual([copy]);
    t.key('z', { ctrlKey: true, shiftKey: true });
    expect(t.store.getNode(copy)).toBeUndefined();
  });

  it('changes z-order and locks', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape' });
    const b = t.add({ type: 'shape' });
    t.editor.select([a]);
    t.key(']', { metaKey: true });
    expect(t.store.getChildIds(t.pageId)).toEqual([b, a]);
    t.key('l', { metaKey: true, shiftKey: true });
    expect(t.store.getNode(a)!.locked).toBe(true);
    t.key('Delete');
    expect(t.store.getNode(a)).toBeDefined();
  });

  it('switches pages', () => {
    const t = createTestEditor({ pages: 3 });
    const pages = t.store.getPageIds();
    t.key('PageDown');
    expect(t.editor.pageId).toBe(pages[1]);
    t.key('PageDown');
    t.key('PageDown');
    expect(t.editor.pageId).toBe(pages[2]);
    t.key('PageUp');
    expect(t.editor.pageId).toBe(pages[1]);
  });
});

describe('clipboard', () => {
  it('pastes copies with growing offsets on the same page', () => {
    const t = createTestEditor();
    const a = t.add({ type: 'shape', x: 100, y: 100 });
    t.editor.select([a]);
    const data = t.editor.copy()!;
    const [p1] = t.editor.paste(data);
    const [p2] = t.editor.paste(data);
    expect(t.store.getNode(p1!)).toMatchObject({ x: 120, y: 120 });
    expect(t.store.getNode(p2!)).toMatchObject({ x: 140, y: 140 });
    expect(t.editor.selectedIds).toEqual([p2]);
  });

  it('pastes in place on another page', () => {
    const t = createTestEditor({ pages: 2 });
    const a = t.add({ type: 'shape', x: 100, y: 100 });
    t.editor.select([a]);
    const data = t.editor.cut()!;
    expect(t.store.getNode(a)).toBeUndefined();
    t.editor.goToPage(1);
    const [pasted] = t.editor.paste(data);
    expect(t.store.getNode(pasted!)).toMatchObject({ x: 100, y: 100 });
    expect(t.store.getPageIdOf(pasted!)).toBe(t.store.getPageIds()[1]);
  });
});

describe('camera', () => {
  it('zooms at the cursor with ctrl+wheel and pans with wheel', () => {
    const t = createTestEditor();
    t.editor.wheel({
      point: { x: 200, y: 100 },
      deltaX: 0,
      deltaY: -100,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    });
    const cam = t.editor.state.get().camera;
    expect(cam.zoom).toBeGreaterThan(1);
    const anchor = t.editor.screenToPage({ x: 200, y: 100 });
    expect(anchor.x).toBeCloseTo(200);
    expect(anchor.y).toBeCloseTo(100);
    t.editor.wheel({
      point: { x: 0, y: 0 },
      deltaX: 10,
      deltaY: 20,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });
    expect(t.editor.state.get().camera.x).toBeCloseTo(cam.x - 10);
  });

  it('fits the page into the viewport', () => {
    const t = createTestEditor({ width: 2000, height: 1000 });
    t.editor.zoomToFit();
    const { zoom, x } = t.editor.state.get().camera;
    expect(zoom).toBeCloseTo((1000 - 80) / 2000);
    expect(x).toBeCloseTo(40);
  });
});

describe('errors', () => {
  it('surfaces impossible actions instead of throwing', () => {
    const t = createTestEditor();
    t.editor.execute('page.delete', { id: t.pageId });
    expect(t.editor.state.get().lastError?.message).toMatch(/at least one page/);
  });
});
