import { describe, expect, it } from 'vitest';
import {
  canonicalStringify,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  loadDocument,
  migrateSnapshot,
  parseDocument,
  serializeDocument,
  stringifyDocument,
  ValidationError,
} from '../src';
import { createTestDoc } from './helpers';

function sampleDoc() {
  const t = createTestDoc();
  const a = t.add({ type: 'shape', shape: 'star', x: 10, y: 20, rotation: 12.5 });
  const b = t.add({
    type: 'text',
    content: {
      paragraphs: [
        { runs: [{ text: 'مرحبا Hello', style: { color: '#ff0000' } }], list: 'bullet', indent: 1 },
      ],
    },
  });
  t.run('node.group', { ids: [a.id, b.id] });
  t.run('page.create', {});
  return t;
}

describe('serialization', () => {
  it('round-trips byte-for-byte', () => {
    const t = sampleDoc();
    const json = stringifyDocument(t.store);
    const { store } = loadDocument(json);
    expect(stringifyDocument(store)).toBe(json);
    expect(store.getRecords()).toEqual(t.store.getRecords());
  });

  it('is independent of insertion and key order', () => {
    const t = sampleDoc();
    const snapshot = serializeDocument(t.store);
    const shuffled = {
      records: [...snapshot.records].reverse().map((r) => Object.fromEntries(Object.entries(r).reverse())),
      schemaVersion: snapshot.schemaVersion,
      format: snapshot.format,
    };
    const { snapshot: parsed } = parseDocument(shuffled);
    expect(canonicalStringify(parsed)).toBe(stringifyDocument(t.store));
  });

  it('creates blank documents from formats', () => {
    const snap = createDocumentSnapshot({
      width: 1080,
      height: 1920,
      pages: 3,
      title: 'Story',
      createId: createSequentialIdGenerator(),
    });
    const pages = snap.records.filter((r) => r.typeName === 'page');
    expect(pages).toHaveLength(3);
    expect(snap.records[0]).toMatchObject({ typeName: 'document', title: 'Story' });
  });

  it('repairs broken structure and reports issues', () => {
    const { snapshot, issues } = parseDocument({
      format: 'opencanvas.document',
      schemaVersion: 1,
      records: [
        { typeName: 'node', type: 'shape', id: 'orphan', parentId: 'missing', index: 'a0' },
        { typeName: 'node', type: 'group', id: 'g1', parentId: 'g2', index: 'a0' },
        { typeName: 'node', type: 'group', id: 'g2', parentId: 'g1', index: 'a0' },
        { typeName: 'node', type: 'image', id: 'img', parentId: 'page_x', index: 'a1', assetId: 'nope' },
        { typeName: 'page', id: 'page_x', index: 'a0' },
      ],
    });
    const ids = snapshot.records.map((r) => r.id);
    expect(ids).toContain('document');
    expect(ids).toContain('img');
    expect(ids).not.toContain('orphan');
    expect(ids).not.toContain('g1');
    expect(issues.some((i) => i.message.includes('missing asset'))).toBe(true);
  });

  it('adds a page when none exist', () => {
    const { snapshot } = parseDocument({ format: 'opencanvas.document', schemaVersion: 1, records: [] });
    expect(snapshot.records.filter((r) => r.typeName === 'page')).toHaveLength(1);
  });

  it('rejects invalid records with paths', () => {
    expect(() =>
      parseDocument({
        format: 'opencanvas.document',
        schemaVersion: 1,
        records: [{ typeName: 'page', id: 'p', index: 'a0', width: 'wide' }],
      }),
    ).toThrow(ValidationError);
  });

  it('ignores prototype pollution attempts', () => {
    const json =
      '{"format":"opencanvas.document","schemaVersion":1,"records":[{"typeName":"page","id":"p1","index":"a0","__proto__":{"polluted":true}}]}';
    parseDocument(json);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('migrates old snapshots and refuses newer ones', () => {
    const migrated = migrateSnapshot(
      { format: 'opencanvas.document', schemaVersion: 1, records: [{ a: 1 }] },
      { 1: (s) => ({ ...s, records: s.records.map((r) => ({ ...(r as object), b: 2 })) }) },
      2,
    );
    expect(migrated).toEqual({ format: 'opencanvas.document', schemaVersion: 2, records: [{ a: 1, b: 2 }] });
    expect(() => migrateSnapshot({ format: 'x', schemaVersion: 99, records: [] })).toThrow(/newer version/);
  });
});
