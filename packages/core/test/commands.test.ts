import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CommandError, createDefaultCommandRegistry } from '../src';
import { createTestDoc } from './helpers';

describe('commands', () => {
  it('validates payloads with readable errors', () => {
    const t = createTestDoc();
    expect(() => t.run('node.translate', { ids: [], dx: 1, dy: 1 })).toThrow(CommandError);
    expect(() => t.run('node.translate', { ids: ['x'], dx: 'far', dy: 1 })).toThrow(/dx/);
    expect(() => t.run('does.not.exist', {})).toThrow(/Unknown command/);
    expect(() =>
      t.run('node.create', { parentId: t.pageId, nodes: [{ type: 'shape', opacity: 9 }] }),
    ).toThrow(CommandError);
  });

  it('runs each command atomically', () => {
    const t = createTestDoc();
    const before = t.store.getRecords();
    expect(() => t.run('node.group', { ids: ['node_missing', 'node_missing2'] })).toThrow();
    expect(t.store.getRecords()).toEqual(before);
  });

  it('exposes every command schema as JSON Schema (AI tool definitions)', () => {
    const registry = createDefaultCommandRegistry();
    expect(registry.list().length).toBeGreaterThanOrEqual(25);
    for (const command of registry.list()) {
      const schema = z.toJSONSchema(command.schema, { unrepresentable: 'any', io: 'input' });
      expect(schema, command.id).toHaveProperty('type');
    }
  });

  it('labels history entries from payloads', () => {
    const registry = createDefaultCommandRegistry();
    expect(registry.label('node.reorder', { ids: ['a'], direction: 'front' })).toBe('Bring to front');
    expect(registry.label('node.create', { parentId: 'p', nodes: [{ type: 'text' }] })).toBe('Add text');
  });

  it('pastes untrusted clipboard snapshots safely', () => {
    const t = createTestDoc();
    expect(() =>
      t.run('clipboard.paste', {
        parentId: t.pageId,
        snapshot: {
          rootIds: ['n1'],
          nodes: [{ typeName: 'node', type: 'shape', id: 'n1', parentId: 'x', index: 'a0', opacity: 7 }],
          assets: [],
        },
      }),
    ).toThrow();
    const { result } = t.run('clipboard.paste', {
      parentId: t.pageId,
      offset: { x: 10, y: 0 },
      snapshot: {
        rootIds: ['n1'],
        nodes: [{ typeName: 'node', type: 'shape', id: 'n1', parentId: 'x', index: 'a0' }],
        assets: [],
      },
    });
    const pasted = t.store.getNode(result.select![0]!)!;
    expect(pasted.id).not.toBe('n1');
    expect(pasted).toMatchObject({ parentId: t.pageId, x: 10 });
  });
});
