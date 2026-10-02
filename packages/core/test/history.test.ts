import { describe, expect, it } from 'vitest';
import { createDefaultCommandRegistry, executeCommand, History, type NodeRecord } from '../src';
import { createTestDoc, measurer } from './helpers';

function setup() {
  const doc = createTestDoc();
  let selection: string[] = [];
  let now = 0;
  const history = new History<string[]>(doc.store, {
    captureState: () => [...selection],
    restoreState: (s) => {
      selection = [...s];
    },
    now: () => now,
    coalesceWindowMs: 500,
  });
  const registry = createDefaultCommandRegistry();
  const exec = (id: string, payload: unknown, coalesceKey?: string) =>
    history.run(
      () => {
        const { result } = executeCommand(doc.store, registry, id, payload, {
          createId: doc.createId,
          measurer,
        });
        if (result.select) selection = result.select;
        return result;
      },
      { label: registry.label(id, payload), coalesceKey },
    );
  return {
    ...doc,
    history,
    exec,
    getSelection: () => selection,
    setSelection: (s: string[]) => {
      selection = s;
      history.markStateChanged();
    },
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe('History', () => {
  it('undoes and redoes commands, restoring selection', () => {
    const t = setup();
    const initial = t.store.getRecords();
    const { select } = t.exec('node.create', {
      parentId: t.pageId,
      nodes: [{ type: 'shape', x: 10, y: 10 }],
    });
    const id = select![0]!;
    expect(t.getSelection()).toEqual([id]);
    t.exec('node.translate', { ids: [id], dx: 5, dy: 0 });
    expect(t.store.getNode(id)!.x).toBe(15);
    expect(t.history.undoLabel).toBe('Move');

    t.history.undo();
    expect(t.store.getNode(id)!.x).toBe(10);
    t.history.undo();
    expect(t.store.getNode(id)).toBeUndefined();
    expect(t.getSelection()).toEqual([]);
    expect(t.store.getRecords()).toEqual(initial);

    t.history.redo();
    expect(t.getSelection()).toEqual([id]);
    t.history.redo();
    expect(t.store.getNode(id)!.x).toBe(15);
    expect(t.history.canRedo).toBe(false);
  });

  it('clears the redo stack on a new change', () => {
    const t = setup();
    const { select } = t.exec('node.create', { parentId: t.pageId, nodes: [{ type: 'shape' }] });
    t.history.undo();
    expect(t.history.canRedo).toBe(true);
    t.exec('node.create', { parentId: t.pageId, nodes: [{ type: 'shape' }] });
    expect(t.history.canRedo).toBe(false);
    expect(t.store.getNode(select![0]!)).toBeUndefined();
  });

  it('records a whole gesture as one entry', () => {
    const t = setup();
    const { select } = t.exec('node.create', { parentId: t.pageId, nodes: [{ type: 'shape' }] });
    const id = select![0]!;
    t.history.beginBatch('Move');
    for (let i = 0; i < 30; i++) t.exec('node.translate', { ids: [id], dx: 1, dy: 2 });
    t.history.endBatch();
    expect(t.history.getUndoStack()).toHaveLength(2);
    expect(t.store.getNode(id)).toMatchObject({ x: 30, y: 60 });
    t.history.undo();
    expect(t.store.getNode(id)).toMatchObject({ x: 0, y: 0 });
  });

  it('cancels a gesture back to its start', () => {
    const t = setup();
    const { select } = t.exec('node.create', { parentId: t.pageId, nodes: [{ type: 'shape' }] });
    const id = select![0]!;
    t.history.beginBatch('Move');
    t.exec('node.translate', { ids: [id], dx: 50, dy: 50 });
    t.history.cancelBatch();
    expect(t.store.getNode(id)).toMatchObject({ x: 0, y: 0 });
    expect(t.history.getUndoStack()).toHaveLength(1);
  });

  it('coalesces repeated edits with the same key inside the window', () => {
    const t = setup();
    const { select } = t.exec('node.create', { parentId: t.pageId, nodes: [{ type: 'shape' }] });
    const id = select![0]!;
    for (let i = 0; i < 5; i++) {
      t.tick(100);
      t.exec('node.translate', { ids: [id], dx: 1, dy: 0 }, `nudge:${id}`);
    }
    expect(t.history.getUndoStack()).toHaveLength(2);
    t.tick(2000);
    t.exec('node.translate', { ids: [id], dx: 1, dy: 0 }, `nudge:${id}`);
    expect(t.history.getUndoStack()).toHaveLength(3);
    t.history.undo();
    t.history.undo();
    expect(t.store.getNode(id)!.x).toBe(0);
  });

  it('records user changes that bypass commands (safety net)', () => {
    const t = setup();
    t.store.transact((tx) => tx.update(t.pageId, { name: 'Cover' }), { label: 'Rename page' });
    expect(t.history.undoLabel).toBe('Rename page');
    t.history.undo();
    expect(t.store.getPage(t.pageId)!.name).toBe('');
  });

  it('ignores system and remote changes', () => {
    const t = setup();
    t.store.transact((tx) => tx.update(t.pageId, { name: 'x' }), { source: 'system' });
    t.store.transact((tx) => tx.update(t.pageId, { notes: 'y' }), { source: 'remote' });
    expect(t.history.canUndo).toBe(false);
  });

  it('caps the number of entries', () => {
    const doc = createTestDoc();
    const history = new History(doc.store, { limit: 3 });
    for (let i = 0; i < 10; i++) doc.store.transact((tx) => tx.update(doc.pageId, { name: `p${i}` }));
    expect(history.getUndoStack()).toHaveLength(3);
  });

  it('restores selection captured before the change when undoing', () => {
    const t = setup();
    const { select } = t.exec('node.create', {
      parentId: t.pageId,
      nodes: [{ type: 'shape' }, { type: 'shape' }],
    });
    t.setSelection([select![0]!]);
    t.exec('node.delete', { ids: [select![0]!] });
    expect(t.getSelection()).toEqual([]);
    t.history.undo();
    expect(t.getSelection()).toEqual([select![0]]);
    expect((t.store.getNode(select![0]!) as NodeRecord).id).toBe(select![0]);
  });
});
