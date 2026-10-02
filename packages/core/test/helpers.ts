import {
  type AnyNodeProps,
  createDefaultCommandRegistry,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  createTextAutosizeFinalizer,
  DocumentStore,
  executeCommand,
  getPageCorners,
  type Id,
  type IdGenerator,
  MockTextMeasurer,
  type NodeRecord,
  normalizeGroupsFinalizer,
  type Vec,
} from '../src';

export interface TestDoc {
  store: DocumentStore;
  pageId: Id;
  createId: IdGenerator;
  run: (command: string, payload: unknown) => ReturnType<typeof executeCommand>;
  add: (props: AnyNodeProps, parentId?: Id) => NodeRecord;
}

export const measurer = new MockTextMeasurer();

export function createTestDoc(
  options: { width?: number; height?: number; pages?: number; validate?: boolean } = {},
): TestDoc {
  const createId = createSequentialIdGenerator();
  const snapshot = createDocumentSnapshot({
    width: options.width ?? 1000,
    height: options.height ?? 800,
    pages: options.pages ?? 1,
    createId,
  });
  const store = new DocumentStore(snapshot.records, { validate: options.validate ?? true });
  store.addFinalizer(createTextAutosizeFinalizer(measurer));
  store.addFinalizer(normalizeGroupsFinalizer);
  const registry = createDefaultCommandRegistry();
  const pageId = store.getPageIds()[0]!;
  const run = (command: string, payload: unknown) =>
    executeCommand(store, registry, command, payload, { createId, measurer });
  const add = (props: AnyNodeProps, parentId: Id = pageId) => {
    const { result } = run('node.create', { parentId, nodes: [props] });
    return store.getNode(result.select![0]!)!;
  };
  return { store, pageId, createId, run, add };
}

export function round(n: number, digits = 6): number {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export function roundPoints(points: readonly Vec[], digits = 6): Vec[] {
  return points.map((p) => ({ x: round(p.x, digits), y: round(p.y, digits) }));
}

/** Page-space corners of a node, rounded (for "looks the same" assertions). */
export function pageCorners(store: DocumentStore, id: Id, digits = 6): Vec[] {
  return roundPoints(getPageCorners(store, store.getNode(id)!), digits);
}

/** Sorted multiset of rounded corners — order-independent comparison (flips reorder corners). */
export function cornerSet(store: DocumentStore, id: Id, digits = 4): string[] {
  return pageCorners(store, id, digits)
    .map((p) => `${p.x},${p.y}`)
    .sort();
}
