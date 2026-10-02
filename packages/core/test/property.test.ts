/**
 * Property-based tests: random sequences of real editing commands must keep
 * the document structurally valid, be fully undoable/redoable, and serialize
 * deterministically.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createDefaultCommandRegistry,
  executeCommand,
  History,
  loadDocument,
  parseRecord,
  stringifyDocument,
} from '../src';
import { createTestDoc, measurer } from './helpers';

type Op =
  | {
      kind: 'create';
      shape: number;
      x: number;
      y: number;
      w: number;
      h: number;
      text: boolean;
      parent: number;
    }
  | { kind: 'translate'; pick: number[]; dx: number; dy: number }
  | { kind: 'rotate'; pick: number[]; angle: number }
  | { kind: 'flip'; pick: number[]; horizontal: boolean }
  | { kind: 'group'; pick: number[] }
  | { kind: 'ungroup'; pick: number[] }
  | { kind: 'reorder'; pick: number[]; dir: number }
  | { kind: 'duplicate'; pick: number[] }
  | { kind: 'delete'; pick: number[] }
  | { kind: 'align'; pick: number[]; how: number }
  | { kind: 'resize'; pick: number; w: number }
  | { kind: 'addPage' }
  | { kind: 'undo' }
  | { kind: 'redo' };

const pick = fc.array(fc.nat(50), { minLength: 1, maxLength: 4 });
const coord = fc.integer({ min: -200, max: 1200 });
const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('create' as const),
      shape: fc.nat(17),
      x: coord,
      y: coord,
      w: fc.integer({ min: 1, max: 400 }),
      h: fc.integer({ min: 1, max: 400 }),
      text: fc.boolean(),
      parent: fc.nat(10),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({ kind: fc.constant('translate' as const), pick, dx: coord, dy: coord }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('rotate' as const),
      pick,
      angle: fc.integer({ min: -360, max: 360 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('flip' as const), pick, horizontal: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('group' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('ungroup' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('reorder' as const), pick, dir: fc.nat(3) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('duplicate' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('delete' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('align' as const), pick, how: fc.nat(5) }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('resize' as const),
      pick: fc.nat(50),
      w: fc.integer({ min: 1, max: 900 }),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'addPage' as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'redo' as const }) },
);

const SHAPES = [
  'rect',
  'ellipse',
  'triangle',
  'right-triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'polygon',
  'star',
  'arrow-right',
  'arrow-left',
  'chevron',
  'cross',
  'heart',
  'speech-bubble',
  'parallelogram',
  'trapezoid',
];

function checkInvariants(store: ReturnType<typeof createTestDoc>['store']) {
  const ids = new Set<string>();
  for (const r of store.getRecords()) {
    expect(ids.has(r.id)).toBe(false);
    ids.add(r.id);
    parseRecord(r); // every record is valid
    if (r.typeName === 'node') {
      const parent = store.get(r.parentId);
      expect(parent, `parent of ${r.id}`).toBeDefined();
      expect(
        parent!.typeName === 'page' ||
          (parent!.typeName === 'node' && (parent!.type === 'group' || parent!.type === 'frame')),
      ).toBe(true);
      expect(store.getPageIdOf(r.id)).toBeDefined();
      if (r.type === 'group') {
        // Groups are never empty and hug their children.
        expect(store.getChildIds(r.id).length).toBeGreaterThan(0);
      }
    }
  }
  expect(store.getPageIds().length).toBeGreaterThan(0);
}

describe('random editing sessions (property)', () => {
  it('keep invariants, undo to the exact start and redo to the exact end', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const t = createTestDoc({ validate: false });
        const registry = createDefaultCommandRegistry();
        const history = new History(t.store);
        const initial = stringifyDocument(t.store);
        const exec = (id: string, payload: unknown) => {
          try {
            history.run(
              () => executeCommand(t.store, registry, id, payload, { createId: t.createId, measurer }),
              { label: id },
            );
          } catch {
            // Commands may legitimately refuse (e.g. grouping one node); they must leave no trace.
          }
        };
        const nodeIds = () =>
          t.store
            .getNodes()
            .map((n) => n.id)
            .sort();
        const choose = (indices: number[]) => {
          const all = nodeIds();
          if (all.length === 0) return [];
          return [...new Set(indices.map((i) => all[i % all.length]!))];
        };
        for (const op of ops) {
          const page = t.store.getPageIds()[0]!;
          switch (op.kind) {
            case 'create': {
              const containers = t.store.getNodes().filter((n) => n.type === 'frame' || n.type === 'group');
              const parent = op.parent < containers.length ? containers[op.parent]!.id : page;
              exec('node.create', {
                parentId: parent,
                nodes: [
                  op.text
                    ? {
                        type: 'text',
                        x: op.x,
                        y: op.y,
                        content: { paragraphs: [{ runs: [{ text: 'نص text', style: {} }] }] },
                      }
                    : {
                        type: op.shape % 5 === 0 ? 'frame' : 'shape',
                        shape: SHAPES[op.shape],
                        x: op.x,
                        y: op.y,
                        width: op.w,
                        height: op.h,
                      },
                ],
              });
              break;
            }
            case 'translate':
              exec('node.translate', { ids: choose(op.pick), dx: op.dx, dy: op.dy });
              break;
            case 'rotate':
              exec('node.rotate-by', { ids: choose(op.pick), angle: op.angle });
              break;
            case 'flip':
              exec('node.flip', { ids: choose(op.pick), axis: op.horizontal ? 'horizontal' : 'vertical' });
              break;
            case 'group':
              exec('node.group', { ids: choose(op.pick) });
              break;
            case 'ungroup':
              exec('node.ungroup', { ids: choose(op.pick) });
              break;
            case 'reorder':
              exec('node.reorder', {
                ids: choose(op.pick),
                direction: ['front', 'back', 'forward', 'backward'][op.dir],
              });
              break;
            case 'duplicate':
              exec('node.duplicate', { ids: choose(op.pick) });
              break;
            case 'delete':
              exec('node.delete', { ids: choose(op.pick) });
              break;
            case 'align':
              exec('node.align', {
                ids: choose(op.pick),
                alignment: ['left', 'center', 'right', 'top', 'middle', 'bottom'][op.how],
              });
              break;
            case 'resize': {
              const id = choose([op.pick])[0];
              if (id) exec('node.set-size', { id, width: op.w, keepAspect: true });
              break;
            }
            case 'addPage':
              exec('page.create', {});
              break;
            case 'undo':
              history.undo();
              break;
            case 'redo':
              history.redo();
              break;
          }
          checkInvariants(t.store);
        }
        const final = stringifyDocument(t.store);
        // Serialization round-trips exactly.
        expect(stringifyDocument(loadDocument(final).store)).toBe(final);
        // Undo everything → exact initial document.
        let undone = 0;
        while (history.canUndo) {
          history.undo();
          undone++;
        }
        expect(stringifyDocument(t.store)).toBe(initial);
        // Redo the same number of steps → exact final document.
        for (let i = 0; i < undone; i++) history.redo();
        expect(stringifyDocument(t.store)).toBe(final);
      }),
      { numRuns: Number(process.env.PROPERTY_RUNS ?? 150) },
    );
  });
});
