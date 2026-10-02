import { describe, expect, it, vi } from 'vitest';
import { createNodeRecord, DocumentStore, invertDiff, type NodeRecord, squashDiffs } from '../src';
import { createTestDoc } from './helpers';

describe('DocumentStore', () => {
  it('commits transactions atomically with a single diff', () => {
    const { store, pageId } = createTestDoc();
    const listener = vi.fn();
    store.listen(listener);
    const { diff } = store.transact((tx) => {
      tx.put(createNodeRecord('shape', { id: 'node_a', parentId: pageId, index: 'a0' }));
      tx.put(createNodeRecord('shape', { id: 'node_b', parentId: pageId, index: 'a1' }));
    });
    expect(Object.keys(diff.added).sort()).toEqual(['node_a', 'node_b']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getChildIds(pageId)).toEqual(['node_a', 'node_b']);
  });

  it('rolls back everything when a transaction throws', () => {
    const { store, pageId } = createTestDoc();
    const before = store.getRecords();
    expect(() =>
      store.transact((tx) => {
        tx.put(createNodeRecord('shape', { id: 'node_a', parentId: pageId, index: 'a0' }));
        tx.update(pageId, { name: 'changed' });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.getRecords()).toEqual(before);
    expect(store.getChildIds(pageId)).toEqual([]);
  });

  it('joins nested transactions', () => {
    const { store, pageId } = createTestDoc();
    const listener = vi.fn();
    store.listen(listener);
    store.transact((tx) => {
      tx.put(createNodeRecord('shape', { id: 'node_a', parentId: pageId, index: 'a0' }));
      store.transact((inner) => inner.update<NodeRecord>('node_a', { x: 5 }));
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getNode('node_a')!.x).toBe(5);
  });

  it('keeps children sorted by fractional index and updates on reorder/reparent', () => {
    const { store, pageId } = createTestDoc();
    store.transact((tx) => {
      tx.put(createNodeRecord('shape', { id: 'node_a', parentId: pageId, index: 'a1' }));
      tx.put(createNodeRecord('shape', { id: 'node_b', parentId: pageId, index: 'a0' }));
      // Frames are containers that may be empty (empty groups are removed automatically).
      tx.put(createNodeRecord('frame', { id: 'node_g', parentId: pageId, index: 'a2' }));
    });
    expect(store.getChildIds(pageId)).toEqual(['node_b', 'node_a', 'node_g']);
    store.transact((tx) => tx.update<NodeRecord>('node_b', { index: 'a3' }));
    expect(store.getChildIds(pageId)).toEqual(['node_a', 'node_g', 'node_b']);
    store.transact((tx) => tx.update<NodeRecord>('node_a', { parentId: 'node_g' }));
    expect(store.getChildIds(pageId)).toEqual(['node_g', 'node_b']);
    expect(store.getChildIds('node_g')).toEqual(['node_a']);
    expect(store.getAncestors('node_a').map((a) => a.id)).toEqual(['node_g']);
    expect(store.getPageIdOf('node_a')).toBe(pageId);
  });

  it('freezes records to prevent accidental mutation', () => {
    const { store, pageId } = createTestDoc();
    const page = store.getPage(pageId)!;
    expect(() => {
      (page as { name: string }).name = 'mutated';
    }).toThrow();
  });

  it('rejects writes outside transactions and identity changes', () => {
    const { store, pageId } = createTestDoc();
    expect(() => store._write('x', undefined)).toThrow();
    expect(() => store.transact((tx) => tx.update(pageId, { id: 'other' } as never))).toThrow();
    expect(() =>
      store.transact((tx) =>
        tx.put(createNodeRecord('shape', { id: 'node_s', parentId: 'node_s', index: 'a0' })),
      ),
    ).toThrow();
  });

  it('validates records when configured to', () => {
    const { store, pageId } = createTestDoc({ validate: true });
    expect(() => store.transact((tx) => tx.update(pageId, { width: -1 } as never))).toThrow();
  });

  it('applies diffs field-by-field so unrelated changes survive', () => {
    const { store, pageId } = createTestDoc();
    store.transact((tx) => {
      tx.put(createNodeRecord('shape', { id: 'node_a', parentId: pageId, index: 'a0' }));
    });
    const { diff } = store.transact((tx) => tx.update<NodeRecord>('node_a', { x: 100 }));
    // Someone else changes another field.
    store.transact((tx) => tx.update<NodeRecord>('node_a', { opacity: 0.5 }), { source: 'remote' });
    store.applyDiff(invertDiff(diff), { source: 'history' });
    expect(store.getNode('node_a')).toMatchObject({ x: 0, opacity: 0.5 });
  });

  it('squashes sequential diffs and cancels no-ops', () => {
    const { store, pageId } = createTestDoc();
    const d1 = store.transact((tx) =>
      tx.put(createNodeRecord('shape', { id: 'node_a', parentId: pageId, index: 'a0' })),
    ).diff;
    const d2 = store.transact((tx) => tx.update<NodeRecord>('node_a', { x: 3 })).diff;
    const d3 = store.transact((tx) => tx.remove('node_a')).diff;
    const squashed = squashDiffs([d1, d2, d3]);
    expect(squashed).toEqual({ added: {}, updated: {}, removed: {} });
    const d4 = store.transact((tx) => tx.update(pageId, { name: 'x' })).diff;
    const d5 = store.transact((tx) => tx.update(pageId, { name: '' })).diff;
    expect(squashDiffs([d4, d5]).updated).toEqual({});
  });

  it('does not emit for no-op transactions', () => {
    const { store, pageId } = createTestDoc();
    const listener = vi.fn();
    store.listen(listener);
    store.transact((tx) => tx.update(pageId, {}));
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies all listeners even if one throws', () => {
    const errors: unknown[] = [];
    const store = new DocumentStore([], { onListenerError: (e) => errors.push(e) });
    const second = vi.fn();
    store.listen(() => {
      throw new Error('listener failure');
    });
    store.listen(second);
    store.transact((tx) =>
      tx.put({ typeName: 'document', id: 'document', title: 't', formatId: null, meta: {} }),
    );
    expect(second).toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });
});
