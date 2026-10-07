import { describe, expect, it } from 'vitest';
import { PAGE_GAP_PX, slotScreenRect } from '../src';
import { createTestEditor } from './helpers';

function scrollSetup() {
  const t = createTestEditor({ width: 400, height: 300, pages: 3 });
  t.editor.setPageView('scroll');
  // 400 × 300 pages at 100%: they fit across the 1000 × 800 view (centered at
  // x = 300), and the stack is taller than the view, so it scrolls.
  t.editor.setCamera({ x: 300, y: 50, zoom: 1 });
  return t;
}

describe('scroll view', () => {
  it('stacks pages with a constant on-screen gap', () => {
    const t = scrollSetup();
    const slots = t.editor.getPageSlots();
    expect(slots).toHaveLength(3);
    const camera = t.editor.state.get().camera;
    const [a, b, c] = slots.map((s) => slotScreenRect(camera, s));
    expect(a).toEqual({ x: 300, y: 50, width: 400, height: 300 });
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
      deltaY: 500,
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
    expect(node).toMatchObject({ type: 'shape', x: 10, y: 10, width: 50, height: 50 });
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

describe('copy and paste a page', () => {
  it('pastes a new page with the same size, background and content, as one undo step', () => {
    const t = createTestEditor({ width: 400, height: 300, pages: 2 });
    const [first, second] = t.store.getPageIds();
    t.editor.execute('page.update', {
      id: first!,
      patch: { name: 'Cover', background: { type: 'solid', color: '#ff0000' } },
    });
    t.add({ type: 'shape', shape: 'rect', x: 10, y: 20, width: 50, height: 40 });
    t.add({ type: 'text', x: 100, y: 100, width: 200, height: 40, text: 'Hello' } as never);
    const data = t.editor.copyPage(first!)!;
    expect(data.page).toMatchObject({ width: 400, height: 300, name: 'Cover' });

    t.editor.setCurrentPage(second!);
    t.editor.paste(data); // a page on the clipboard pastes as a new page after the current one
    const ids = t.store.getPageIds();
    expect(ids).toHaveLength(3);
    const pasted = ids[2]!;
    expect(t.editor.pageId).toBe(pasted);
    const page = t.store.getPage(pasted)!;
    expect(page.background).toEqual({ type: 'solid', color: '#ff0000' });
    expect(page.name).toBe('Cover');
    const children = t.store.getChildren(pasted);
    expect(children.map((n) => n.type)).toEqual(t.store.getChildren(first!).map((n) => n.type));
    // New ids: the original page is untouched.
    expect(children.map((n) => n.id)).not.toEqual(t.store.getChildIds(first!));

    t.editor.undo();
    expect(t.store.getPageIds()).toEqual([first, second]);
  });
});

describe('the pages never scroll out of sight (like Canva)', () => {
  const wheel = (t: ReturnType<typeof createTestEditor>, deltaX: number, deltaY: number) =>
    t.editor.wheel({
      point: { x: 500, y: 400 },
      deltaX,
      deltaY,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });
  const pageRect = (t: ReturnType<typeof createTestEditor>) =>
    slotScreenRect(t.editor.state.get().camera, t.editor.getPageSlots()[0]!);

  it('a page that fits the screen stays centered: no sideways scrolling', () => {
    const t = createTestEditor({ width: 400, height: 300 });
    t.editor.zoomToFit();
    const fitted = pageRect(t);
    for (let i = 0; i < 50; i++) wheel(t, 200, 0);
    wheel(t, 0, 500);
    expect(pageRect(t)).toEqual(fitted);
  });

  it('zoomed in, it moves only until its edges show, with a margin', () => {
    const t = createTestEditor({ width: 2000, height: 2000 });
    t.editor.setCamera({ x: 0, y: 0, zoom: 1 });
    for (let i = 0; i < 50; i++) wheel(t, 500, 500); // far right and down
    let r = pageRect(t);
    expect(r.x + r.width).toBe(1000 - 40);
    expect(r.y + r.height).toBe(800 - 72); // thumbnails view: room for the tool bar
    for (let i = 0; i < 50; i++) wheel(t, -500, -500); // far left and up
    r = pageRect(t);
    expect(r.x).toBe(40);
    expect(r.y).toBe(72);
  });

  it('scroll view: from the first page header to the last page, and no further', () => {
    const t = scrollSetup();
    for (let i = 0; i < 50; i++) wheel(t, 300, 300);
    const camera = t.editor.state.get().camera;
    const slots = t.editor.getPageSlots();
    const last = slotScreenRect(camera, slots[slots.length - 1]!);
    expect(last.y + last.height).toBeCloseTo(800 - 128);
    expect(last.x).toBe(300); // still centered across
    for (let i = 0; i < 50; i++) wheel(t, -300, -300);
    const first = slotScreenRect(t.editor.state.get().camera, t.editor.getPageSlots()[0]!);
    expect(first.y).toBeCloseTo(PAGE_GAP_PX);
  });

  it('zooming out until everything fits centers it', () => {
    const t = scrollSetup();
    t.editor.zoomTo(0.2, { x: 0, y: 0 });
    const camera = t.editor.state.get().camera;
    const rects = t.editor.getPageSlots().map((s) => slotScreenRect(camera, s));
    const top = rects[0]!.y;
    const bottom = rects[rects.length - 1]!.y + rects[rects.length - 1]!.height;
    expect(top - PAGE_GAP_PX).toBeCloseTo(800 - 128 - bottom);
    expect(rects[0]!.x).toBeCloseTo((1000 - rects[0]!.width) / 2);
  });
});
