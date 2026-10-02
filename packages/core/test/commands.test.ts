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

describe('command tool definitions', () => {
  it('describes every command with a JSON Schema payload for AI agents', () => {
    const registry = createDefaultCommandRegistry();
    const tools = registry.toolDefinitions();
    expect(tools).toHaveLength(registry.list().length);
    const names = new Set<string>();
    for (const tool of tools) {
      // Tool APIs typically accept ^[a-zA-Z0-9_-]{1,64}$.
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      expect(registry.has(tool.command)).toBe(true);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe('object');
      // Plain JSON (no functions, no cycles).
      expect(JSON.parse(JSON.stringify(tool.inputSchema))).toEqual(tool.inputSchema);
    }
    const translate = tools.find((t) => t.command === 'node.translate')!;
    expect(translate.name).toBe('node_translate');
    expect(translate.inputSchema).toMatchObject({
      properties: { ids: { type: 'array' }, dx: { type: 'number' }, dy: { type: 'number' } },
    });
  });
});
