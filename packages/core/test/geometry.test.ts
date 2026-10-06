import { describe, expect, it } from 'vitest';
import {
  collectSnapTargets,
  getNodeAtPoint,
  getNodesInBox,
  getShapePath,
  parseSvgPath,
  pathBounds,
  pathToSvg,
  pointInPath,
  SHAPE_KINDS,
  snapMovingBox,
} from '../src';
import { createTestDoc } from './helpers';

describe('svg path parsing', () => {
  it('parses absolute, relative and implicit commands', () => {
    const cmds = parseSvgPath('M10 10 l10 0 0 10 h-10 z');
    expect(cmds).toEqual([['M', 10, 10], ['L', 20, 10], ['L', 20, 20], ['L', 10, 20], ['Z']]);
  });

  it('handles compact numbers and arc flags', () => {
    const cmds = parseSvgPath('M0,0L.5.5a5 5 0 011 1');
    expect(cmds[1]).toEqual(['L', 0.5, 0.5]);
    expect(cmds[2]![0]).toBe('C');
    const last = cmds[cmds.length - 1]!;
    expect(last.slice(-2)).toEqual([1.5, 1.5]);
  });

  it('converts arcs into cubic curves spanning the right area', () => {
    const circle = parseSvgPath('M0 10 A10 10 0 1 1 20 10 A10 10 0 1 1 0 10Z');
    const b = pathBounds(circle);
    expect(b.x).toBeCloseTo(0, 1);
    expect(b.width).toBeCloseTo(20, 1);
    expect(b.height).toBeCloseTo(20, 1);
  });

  it('rejects malformed path data', () => {
    expect(() => parseSvgPath('M 10')).toThrow();
    expect(() => parseSvgPath('X 1 2')).toThrow();
  });

  it('serializes compactly', () => {
    expect(pathToSvg([['M', 0, 0], ['L', 1.23456, -0], ['Z']])).toBe('M0 0L1.235 0Z');
  });
});

describe('shapes', () => {
  it('every shape kind fits its box', () => {
    for (const kind of SHAPE_KINDS) {
      const b = pathBounds(getShapePath(kind, 200, 100, { cornerRadius: 0, sides: 6, innerRatio: 0.4 }));
      expect(b.x, kind).toBeGreaterThanOrEqual(-0.5);
      expect(b.y, kind).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, kind).toBeLessThanOrEqual(200.5);
      expect(b.y + b.height, kind).toBeLessThanOrEqual(100.5);
      expect(b.width, kind).toBeGreaterThan(150);
    }
  });

  it('point-in-path respects holes with evenodd', () => {
    const ring = parseSvgPath('M0 0H100V100H0Z M25 25H75V75H25Z');
    expect(pointInPath(ring, { x: 50, y: 50 }, 'evenodd')).toBe(false);
    expect(pointInPath(ring, { x: 10, y: 10 }, 'evenodd')).toBe(true);
  });
});

describe('hit testing', () => {
  it('tests real shape geometry, not just boxes', () => {
    const t = createTestDoc();
    const ellipse = t.add({ type: 'shape', shape: 'ellipse', x: 0, y: 0, width: 100, height: 100 });
    expect(getNodeAtPoint(t.store, t.pageId, { x: 50, y: 50 })?.id).toBe(ellipse.id);
    expect(getNodeAtPoint(t.store, t.pageId, { x: 3, y: 3 })).toBeNull(); // outside the circle, inside the box
  });

  it('returns the top-most hit and respects rotation', () => {
    const t = createTestDoc();
    t.add({ type: 'shape', x: 0, y: 0, width: 100, height: 100 });
    const top = t.add({ type: 'shape', x: 50, y: 0, width: 100, height: 20, rotation: 90 });
    // Rotated 90° around its center (100, 10): it now spans x 90–110, y −40–60.
    expect(getNodeAtPoint(t.store, t.pageId, { x: 100, y: 50 })?.id).toBe(top.id);
    expect(getNodeAtPoint(t.store, t.pageId, { x: 60, y: 5 })?.id).not.toBe(top.id);
  });

  it('selects groups as a whole unless deep', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 0, y: 0, width: 50, height: 50 });
    const b = t.add({ type: 'shape', x: 100, y: 0, width: 50, height: 50 });
    const groupId = t.run('node.group', { ids: [a.id, b.id] }).result.select![0]!;
    t.run('node.set-rotation', { ids: [groupId], rotation: 180 });
    expect(getNodeAtPoint(t.store, t.pageId, { x: 25, y: 25 })?.id).toBe(groupId);
    // After rotating the group 180°, the first child is where the second one was.
    expect(getNodeAtPoint(t.store, t.pageId, { x: 125, y: 25 }, { deep: true })?.id).toBe(a.id);
    expect(getNodeAtPoint(t.store, t.pageId, { x: 75, y: 25 })).toBeNull(); // gap between children
  });

  it('clips hits to frames', () => {
    const t = createTestDoc();
    const frame = t.add({ type: 'frame', x: 0, y: 0, width: 100, height: 100, clipContent: true });
    const inner = t.add({ type: 'shape', x: 50, y: 50, width: 200, height: 200 }, frame.id);
    expect(getNodeAtPoint(t.store, t.pageId, { x: 75, y: 75 }, { deep: true })?.id).toBe(inner.id);
    expect(getNodeAtPoint(t.store, t.pageId, { x: 200, y: 200 }, { deep: true })).toBeNull();
  });

  it('ignores hidden nodes and finds lines by stroke distance', () => {
    const t = createTestDoc();
    t.add({ type: 'shape', x: 0, y: 0, visible: false });
    expect(getNodeAtPoint(t.store, t.pageId, { x: 10, y: 10 })).toBeNull();
    const line = t.add({ type: 'line', x: 0, y: 200, width: 100, height: 4 });
    expect(getNodeAtPoint(t.store, t.pageId, { x: 50, y: 203 })?.id).toBe(line.id);
    expect(getNodeAtPoint(t.store, t.pageId, { x: 50, y: 230 })).toBeNull();
  });

  it('marquee-selects intersecting or contained nodes', () => {
    const t = createTestDoc();
    const a = t.add({ type: 'shape', x: 0, y: 0, width: 50, height: 50 });
    t.add({ type: 'shape', x: 100, y: 100, width: 50, height: 50 });
    const box = { x: -10, y: -10, width: 120, height: 120 };
    expect(getNodesInBox(t.store, t.pageId, box, 'intersect')).toHaveLength(2);
    expect(getNodesInBox(t.store, t.pageId, box, 'contain').map((n) => n.id)).toEqual([a.id]);
  });
});

describe('snapping', () => {
  it('snaps to page center and other nodes, reporting guides', () => {
    const t = createTestDoc({ width: 1000, height: 800 });
    const other = t.add({ type: 'shape', x: 600, y: 100, width: 100, height: 100 });
    const targets = collectSnapTargets(t.store, t.store.getPage(t.pageId)!, new Set());
    const r = snapMovingBox({ x: 447, y: 103, width: 100, height: 100 }, targets, 5);
    expect(r.dx).toBe(3); // centers at 500
    expect(r.dy).toBe(-3); // top aligns with other.y = 100
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 500)).toBe(true);
    expect(r.guides.some((g) => g.axis === 'y' && g.position === other.y)).toBe(true);
    const none = snapMovingBox({ x: 420, y: 300, width: 10, height: 10 }, targets, 5);
    expect(none).toMatchObject({ dx: 0, dy: 0 });
  });

  it('snaps to ruler guides across the whole page', () => {
    const t = createTestDoc({ width: 1000, height: 800 });
    t.run('page.update', {
      id: t.pageId,
      patch: {
        guides: [
          { axis: 'x', position: 123 },
          { axis: 'y', position: 456 },
        ],
      },
    });
    const targets = collectSnapTargets(t.store, t.store.getPage(t.pageId)!, new Set());
    const r = snapMovingBox({ x: 120, y: 420, width: 50, height: 40 }, targets, 5);
    expect(r).toMatchObject({ dx: 3, dy: -4 });
    expect(r.guides).toContainEqual({ axis: 'x', position: 123, from: 0, to: 800 });
    expect(r.guides).toContainEqual({ axis: 'y', position: 456, from: 0, to: 1000 });
  });
});
