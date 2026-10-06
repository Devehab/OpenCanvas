import { describe, expect, it } from 'vitest';
import { PAGE_GAP_PX, slotScreenRect } from '../src';
import { createTestEditor } from './helpers';

function scrollSetup() {
  const t = createTestEditor({ width: 400, height: 300, pages: 3 });
  t.editor.setPageView('scroll');
  t.editor.setCamera({ x: 100, y: 100, zoom: 0.5 });
  return t;
}

describe('scroll view', () => {
  it('stacks pages with a constant on-screen gap', () => {
    const t = scrollSetup();
    const slots = t.editor.getPageSlots();
    expect(slots).toHaveLength(3);
    const camera = t.editor.state.get().camera;
    const [a, b, c] = slots.map((s) => slotScreenRect(camera, s));
    expect(a).toEqual({ x: 100, y: 100, width: 200, height: 150 });
    expect(b!.y - (a!.y + a!.height)).toBeCloseTo(PAGE_GAP_PX);
    expect(c!.y - (b!.y + b!.height)).toBeCloseTo(PAGE_GAP_PX);
  });

  it('clicking another page makes it current without moving anything on screen', () => {
    const t = scrollSetup();
    const [, second] = t.store.getPageIds();
    const before = t.editor.getPageSlots().map((s) => slotScreenRect(t.editor.state.get().camera, s));
    // A point inside the second page on screen.
    t.click(150, before[1]!.y + 20);
    expect(t.editor.pageId).toBe(second);
    const after = t.editor.getPageSlots().map((s) => slotScreenRect(t.editor.state.get().camera, s));
    for (let i = 0; i < 3; i++) {
      expect(after[i]!.x).toBeCloseTo(before[i]!.x);
      expect(after[i]!.y).toBeCloseTo(before[i]!.y);
    }
  });

  it('scrolling makes the page in the middle of the viewport current', () => {
    const t = scrollSetup();
    const [, second, third] = t.store.getPageIds();
    t.editor.wheel({
      point: { x: 500, y: 400 },
      deltaX: 0,
      deltaY: 50,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });
    expect(t.editor.pageId).toBe(second);
    t.editor.wheel({
      point: { x: 500, y: 400 },
      deltaX: 0,
      deltaY: 150,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });
    expect(t.editor.pageId).toBe(third);
  });

  it('new elements go to the page under the pointer in page coordinates', () => {
    const t = scrollSetup();
    const [, second] = t.store.getPageIds();
    const rect = slotScreenRect(t.editor.state.get().camera, t.editor.getPageSlots()[1]!);
    t.editor.setTool('rect');
    t.drag([rect.x + 10, rect.y + 10], [rect.x + 60, rect.y + 60]);
    const [node] = t.store.getChildren(second!);
    expect(node).toMatchObject({ type: 'shape', x: 20, y: 20, width: 100, height: 100 });
  });

  it('other views show one page at a time', () => {
    const t = createTestEditor({ pages: 3 });
    expect(t.editor.getPageSlots()).toHaveLength(1);
    t.editor.setPageView('single');
    expect(t.editor.getPageSlots()).toHaveLength(1);
  });
});

describe('page state', () => {
  it('locked pages reject edits and new elements', () => {
    const t = createTestEditor();
    const id = t.add({ type: 'shape', shape: 'rect', x: 0, y: 0, width: 50, height: 50 });
    t.editor.updatePage(t.pageId, { locked: true });
    expect(t.editor.isEditable(id)).toBe(false);
    expect(t.editor.insertNodes([{ type: 'shape', shape: 'ellipse' } as never])).toEqual([]);
    expect(t.editor.state.get().lastError?.message).toMatch(/locked/);
    t.editor.updatePage(t.pageId, { locked: false });
    expect(t.editor.isEditable(id)).toBe(true);
  });

  it('moves pages up and down and keeps hidden state on duplicate', () => {
    const t = createTestEditor({ pages: 2 });
    const [a, b] = t.store.getPageIds();
    t.editor.movePage(b!, -1);
    expect(t.store.getPageIds()).toEqual([b, a]);
    t.editor.movePage(b!, -1); // already first: no-op
    expect(t.store.getPageIds()).toEqual([b, a]);
    t.editor.updatePage(a!, { hidden: true, guides: [{ axis: 'x', position: 100 }] });
    t.editor.duplicatePage(a!);
    const copy = t.store.getPage(t.editor.pageId)!;
    expect(copy).toMatchObject({ hidden: true, guides: [{ axis: 'x', position: 100 }] });
    t.editor.undo();
    expect(t.store.getPageIds()).toHaveLength(2);
  });
});
