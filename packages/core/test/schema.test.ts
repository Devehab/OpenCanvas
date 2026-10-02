import { describe, expect, it } from 'vitest';
import { createNodeRecord, isValidId, parseDocument, parseNode, parseRecord, ValidationError } from '../src';

describe('schema & factories', () => {
  it('fills defaults for partial node input', () => {
    const node = createNodeRecord('shape', { id: 'node_1', parentId: 'page_1', index: 'a0' });
    expect(node).toMatchObject({
      typeName: 'node',
      type: 'shape',
      shape: 'rect',
      opacity: 1,
      visible: true,
      locked: false,
      rotation: 0,
      blendMode: 'normal',
      fill: { type: 'solid', color: '#6d5dfc' },
    });
  });

  it('normalizes colors on input', () => {
    const node = parseNode({
      typeName: 'node',
      type: 'shape',
      id: 'node_1',
      parentId: 'page_1',
      index: 'a0',
      fill: { type: 'solid', color: 'RED' },
    });
    expect(node.type === 'shape' && node.fill).toEqual({ type: 'solid', color: '#ff0000' });
  });

  it('rejects invalid values with readable paths', () => {
    expect(() =>
      parseNode({
        typeName: 'node',
        type: 'shape',
        id: 'node_1',
        parentId: 'page_1',
        index: 'a0',
        opacity: 2,
      }),
    ).toThrow(ValidationError);
    try {
      parseNode({
        typeName: 'node',
        type: 'text',
        id: 'node_1',
        parentId: 'page_1',
        index: 'a0',
        style: { fontSize: -4 },
      });
    } catch (error) {
      expect((error as ValidationError).issues[0]!.path).toContain('style.fontSize');
    }
  });

  it('rejects non-finite numbers', () => {
    expect(() =>
      parseNode({
        typeName: 'node',
        type: 'shape',
        id: 'node_1',
        parentId: 'page_1',
        index: 'a0',
        x: Number.NaN,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      parseNode({
        typeName: 'node',
        type: 'shape',
        id: 'node_1',
        parentId: 'page_1',
        index: 'a0',
        width: Infinity,
      }),
    ).toThrow(ValidationError);
  });

  it('rejects unknown node types and record kinds', () => {
    expect(() =>
      parseRecord({ typeName: 'node', type: 'script', id: 'node_1', parentId: 'p', index: 'a0' }),
    ).toThrow();
    expect(() => parseRecord({ typeName: 'evil', id: 'x' })).toThrow();
  });

  it('never accepts prototype-polluting ids', () => {
    expect(isValidId('__proto__')).toBe(false);
    expect(isValidId('constructor')).toBe(false);
    expect(isValidId('node_ok-1')).toBe(true);
    expect(() => parseRecord({ typeName: 'page', id: '__proto__', index: 'a0' })).toThrow();
  });

  it('strips unknown properties', () => {
    const node = parseNode({
      typeName: 'node',
      type: 'group',
      id: 'node_1',
      parentId: 'page_1',
      index: 'a0',
      onclick: 'alert(1)',
    }) as unknown as Record<string, unknown>;
    expect(node.onclick).toBeUndefined();
  });

  it('enforces crop bounds', () => {
    expect(() =>
      parseNode({
        typeName: 'node',
        type: 'image',
        id: 'node_1',
        parentId: 'page_1',
        index: 'a0',
        assetId: 'asset_1',
        crop: { x: 0.5, y: 0, width: 0.8, height: 1 },
      }),
    ).toThrow(ValidationError);
  });

  it('rejects documents with a foreign format', () => {
    expect(() => parseDocument({ format: 'other', schemaVersion: 1, records: [] })).toThrow(ValidationError);
    expect(() => parseDocument('{not json')).toThrow(ValidationError);
  });
});
