import {
  type AnyNodeProps,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  DocumentStore,
  type Id,
  MockTextMeasurer,
} from '@opencanvas/core';
import { Editor, type KeyInput, type PointerInput } from '../src';

export function createTestEditor(options: { width?: number; height?: number; pages?: number } = {}) {
  const createId = createSequentialIdGenerator();
  const store = new DocumentStore(
    createDocumentSnapshot({
      width: options.width ?? 1000,
      height: options.height ?? 800,
      pages: options.pages ?? 1,
      createId,
    }).records,
    { validate: true },
  );
  let now = 1000;
  const editor = new Editor({ store, measurer: new MockTextMeasurer(), createId, now: () => now });
  editor.setViewport(1000, 800);
  editor.setCamera({ x: 0, y: 0, zoom: 1 }); // screen == page
  const add = (props: AnyNodeProps): Id => {
    const ids = editor.insertNodes([props], { center: false });
    return ids[0]!;
  };
  const pointer = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput => ({
    point: { x, y },
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });
  const drag = (
    from: [number, number],
    to: [number, number],
    mods: Partial<PointerInput> = {},
    steps = 4,
  ) => {
    editor.pointerDown(pointer(from[0], from[1], mods));
    for (let i = 1; i <= steps; i++) {
      editor.pointerMove(
        pointer(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, mods),
      );
    }
    editor.pointerUp(pointer(to[0], to[1], mods));
  };
  const click = (x: number, y: number, mods: Partial<PointerInput> = {}) => {
    editor.pointerDown(pointer(x, y, mods));
    editor.pointerUp(pointer(x, y, mods));
  };
  const key = (k: string, mods: Partial<KeyInput> = {}) =>
    editor.keyDown({
      key: k,
      code: k,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...mods,
    });
  const tick = (ms: number) => {
    now += ms;
  };
  return { editor, store, add, pointer, drag, click, key, tick, pageId: store.getPageIds()[0]! };
}
