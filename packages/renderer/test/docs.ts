import {
  type AnyNodeProps,
  createDefaultCommandRegistry,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  createTextAutosizeFinalizer,
  DocumentStore,
  executeCommand,
  type Fill,
  type Id,
  normalizeGroupsFinalizer,
  type TextMeasurer,
} from '@opencanvas/core';

export function createScene(
  measurer: TextMeasurer,
  width = 600,
  height = 400,
  background: Fill = { type: 'solid', color: '#ffffff' },
) {
  const createId = createSequentialIdGenerator();
  const store = new DocumentStore(createDocumentSnapshot({ width, height, background, createId }).records, {
    validate: true,
  });
  store.addFinalizer(createTextAutosizeFinalizer(measurer));
  store.addFinalizer(normalizeGroupsFinalizer);
  const registry = createDefaultCommandRegistry();
  const pageId = store.getPageIds()[0]!;
  const run = (id: string, payload: unknown) =>
    executeCommand(store, registry, id, payload, { createId, measurer }).result;
  const add = (props: AnyNodeProps, parentId: Id = pageId): Id =>
    run('node.create', { parentId, nodes: [props] }).select![0]!;
  return { store, pageId, run, add, createId };
}

export const para = (
  text: string,
  style: Record<string, unknown> = {},
  list: 'none' | 'bullet' | 'number' = 'none',
) => ({
  runs: [{ text, style }],
  list,
  indent: 0,
});
