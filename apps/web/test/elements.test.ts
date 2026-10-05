import {
  createDefaultCommandRegistry,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  DocumentStore,
  executeCommand,
  getFrameAtPoint,
  getPageCorners,
  LIMITS,
  MockTextMeasurer,
  type NodeRecord,
  normalizeGroupsFinalizer,
  parseSvgPath,
  pathBounds,
} from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { ALL_ELEMENTS, elementMatches, FRAME_SECTIONS } from '../src/lib/element-library';
import { iconProps, type LibraryIcon, POPULAR_ICONS, searchIcons } from '../src/lib/icon-library';
import { englishFor, normalizeArabic } from '../src/lib/icon-library/arabic';
import lucide from '../src/lib/icon-library/lucide.json';
import tabler from '../src/lib/icon-library/tabler-filled.json';

function doc() {
  const createId = createSequentialIdGenerator();
  const store = new DocumentStore(createDocumentSnapshot({ width: 1080, height: 1080, createId }).records, {
    validate: true,
  });
  store.addFinalizer(normalizeGroupsFinalizer);
  const registry = createDefaultCommandRegistry();
  const pageId = store.getPageIds()[0]!;
  const measurer = new MockTextMeasurer();
  const run = (command: string, payload: unknown) =>
    executeCommand(store, registry, command, payload, { createId, measurer });
  return { store, pageId, run };
}

const icons: LibraryIcon[] = [lucide, tabler].flatMap((set) =>
  set.icons.map(([name, path, keywords, category]) => ({
    id: `${set.style === 'filled' ? 'tabler' : 'lucide'}/${name}`,
    name: name!,
    path: path!,
    keywords: ` ${keywords} `,
    category: category as LibraryIcon['category'],
    style: set.style as LibraryIcon['style'],
  })),
);

describe('element library', () => {
  it('has unique ids', () => {
    const ids = ALL_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ALL_ELEMENTS.map((e) => [e.id, e] as const))('%s is a valid element', (_, element) => {
    const { store, pageId, run } = doc();
    const { result } = run('node.create', { parentId: pageId, nodes: [element.props] });
    const node = store.getNode(result.select![0]!)!;
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
  });

  it.each(FRAME_SECTIONS.flatMap((s) => s.items).map((e) => [e.id, e] as const))(
    'a photo dropped on %s lands in a frame',
    (_, element) => {
      const { store, pageId, run } = doc();
      const { result } = run('node.create', { parentId: pageId, nodes: [element.props] });
      const root = store.getNode(result.select![0]!)!;
      // The middle of every photo slot accepts a drop, even under device bezels.
      const all = (id: string): NodeRecord[] => store.getChildren(id).flatMap((c) => [c, ...all(c.id)]);
      const frames = [root, ...all(root.id)].filter((n) => n.type === 'frame');
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) {
        const corners = getPageCorners(store, frame);
        const center = {
          x: corners.reduce((s, p) => s + p.x, 0) / 4,
          y: corners.reduce((s, p) => s + p.y, 0) / 4,
        };
        if (frame.type === 'frame' && (frame.shape === 'ring' || frame.shape === 'crescent')) continue; // hollow middle
        expect(getFrameAtPoint(store, pageId, center)?.id).toBe(frame.id);
      }
    },
  );

  it('searches in English and Arabic', () => {
    const heart = ALL_ELEMENTS.find((e) => e.id === 'shape:heart')!;
    expect(elementMatches(heart, 'heart')).toBe(true);
    expect(elementMatches(heart, 'قلب')).toBe(true);
    expect(elementMatches(heart, 'star')).toBe(false);
    const polaroid = ALL_ELEMENTS.find((e) => e.id === 'frame:polaroid')!;
    expect(elementMatches(polaroid, 'صوره فوريه')).toBe(true); // forgiving spelling
  });
});

describe('icon library', () => {
  it('has thousands of icons with unique ids', () => {
    expect(icons.length).toBeGreaterThan(2500);
    expect(new Set(icons.map((i) => i.id)).size).toBe(icons.length);
  });

  it('every icon is a valid, in-bounds path element', () => {
    for (const icon of icons) {
      expect(icon.path.length, icon.id).toBeLessThanOrEqual(LIMITS.maxPathDataLength);
      const commands = parseSvgPath(icon.path);
      expect(commands.length, icon.id).toBeGreaterThan(0);
      const b = pathBounds(commands);
      expect(b.x, icon.id).toBeGreaterThanOrEqual(-1);
      expect(b.y, icon.id).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, icon.id).toBeLessThanOrEqual(25);
      expect(b.y + b.height, icon.id).toBeLessThanOrEqual(25);
    }
  });

  it('inserts outline icons stroked and filled icons filled', () => {
    const { store, pageId, run } = doc();
    const outline = icons.find((i) => i.id === 'lucide/heart')!;
    const filled = icons.find((i) => i.id === 'tabler/heart')!;
    const { result } = run('node.create', {
      parentId: pageId,
      nodes: [iconProps(outline), iconProps(filled)],
    });
    const [a, b] = result.select!.map((id) => store.getNode(id)!);
    expect(a).toMatchObject({ type: 'path', fill: null, stroke: { width: 2 } });
    expect(b).toMatchObject({ type: 'path', stroke: null, fill: { type: 'solid' } });
  });

  it('lists only existing popular icons', () => {
    const ids = new Set(icons.map((i) => i.id));
    expect(POPULAR_ICONS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('finds icons by English and Arabic words', () => {
    const names = (q: string) => searchIcons(icons, q).map((i) => i.id);
    expect(names('heart')[0]).toMatch(/\/heart$/);
    expect(names('قلب')).toContain('lucide/heart');
    expect(names('القلب')).toContain('lucide/heart');
    expect(names('سيارة')).toContain('lucide/car');
    expect(names('مسجد').length).toBeGreaterThan(0);
    expect(names('arrow right')).toContain('lucide/arrow-right');
    expect(searchIcons(icons, '', { category: 'brands' }).every((i) => i.category === 'brands')).toBe(true);
    expect(searchIcons(icons, 'heart', { style: 'filled' }).every((i) => i.style === 'filled')).toBe(true);
  });

  it('normalizes Arabic spelling variants', () => {
    expect(normalizeArabic('إضافةٌ')).toBe('اضافه');
    expect(englishFor('اضافه')).toContain('add');
  });
});
