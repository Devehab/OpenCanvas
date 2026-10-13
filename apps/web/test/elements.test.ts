import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_ELEMENTS, elementMatches, FRAME_SECTIONS } from '../src/lib/element-library';
import {
  flagSource,
  ICON_LIBRARIES,
  ICON_SETS,
  ICON_TOTAL,
  iconProps,
  iconSet,
  isImageIcon,
  type LibraryIcon,
  LOADABLE_SETS,
  loadIconLibrary,
  POPULAR_ICONS,
  searchIcons,
} from '../src/lib/icon-library';
import { englishFor, normalizeArabic } from '../src/lib/icon-library/arabic';

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

let icons: LibraryIcon[] = [];
beforeAll(async () => {
  icons = await loadIconLibrary();
});
const byId = (id: string) => icons.find((i) => i.id === id)!;

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
  it('loads every generated set, with the counts of the manifest', () => {
    expect(LOADABLE_SETS.sort()).toEqual(ICON_SETS.map((s) => s.id).sort());
    expect(icons.length).toBe(ICON_TOTAL);
    expect(ICON_TOTAL).toBeGreaterThan(25_000);
    for (const set of ICON_SETS) expect(icons.filter((i) => i.set === set.id).length, set.id).toBe(set.count);
    expect(ICON_LIBRARIES.map((l) => l.id)).toEqual([
      'lucide',
      'tabler',
      'bootstrap',
      'heroicons',
      'hugeicons',
      'material',
      'radix',
      'remix',
      'flags',
    ]);
    expect(new Set(icons.map((i) => i.id)).size).toBe(icons.length);
  });

  it("every icon is a valid path inside its set's view box", () => {
    for (const icon of icons) {
      if (isImageIcon(icon)) continue;
      const size = iconSet(icon)!.viewBox;
      // A few source drawings reach a little past their box (Bootstrap's crop: 1.5 of 16).
      const slack = size / 10;
      expect(icon.path.length, icon.id).toBeLessThanOrEqual(LIMITS.maxPathDataLength);
      const commands = parseSvgPath(icon.path);
      expect(commands.length, icon.id).toBeGreaterThan(0);
      const b = pathBounds(commands);
      expect(b.x, icon.id).toBeGreaterThanOrEqual(-slack);
      expect(b.y, icon.id).toBeGreaterThanOrEqual(-slack);
      expect(b.x + b.width, icon.id).toBeLessThanOrEqual(size + slack);
      expect(b.y + b.height, icon.id).toBeLessThanOrEqual(size + slack);
    }
  });

  it('every flag has its picture', () => {
    const flags = icons.filter(isImageIcon);
    expect(flags.length).toBeGreaterThan(250);
    for (const flag of flags) {
      expect(flag.category).toBe('flags');
      expect(existsSync(join(__dirname, '../public', flagSource(flag))), flag.id).toBe(true);
    }
  });

  it('inserts icons the way each set draws them', () => {
    const { store, pageId, run } = doc();
    const ids = ['lucide/heart', 'tabler/heart', 'hugeicons/home-01', 'bootstrap/house-fill', 'radix/home'];
    const evenodd = icons.find((i) => i.set === 'bootstrap' && i.evenodd)!;
    const { result } = run('node.create', {
      parentId: pageId,
      nodes: [...ids.map((id) => iconProps(byId(id))), iconProps(evenodd)],
    });
    const [lucide, tabler, huge, bootstrap, radix, odd] = result.select!.map((id) => store.getNode(id)!);
    expect(lucide).toMatchObject({ type: 'path', fill: null, stroke: { width: 2 }, viewBox: { width: 24 } });
    expect(tabler).toMatchObject({ type: 'path', stroke: null, fill: { type: 'solid' } });
    expect(huge).toMatchObject({ fill: null, stroke: { width: 1.5 }, viewBox: { width: 24 } });
    expect(bootstrap).toMatchObject({ stroke: null, fill: { type: 'solid' }, viewBox: { width: 16 } });
    expect(radix).toMatchObject({ viewBox: { width: 15 } });
    expect(odd).toMatchObject({ fillRule: 'evenodd' });
  });

  it('lists only existing popular icons', () => {
    const ids = new Set(icons.map((i) => i.id));
    expect(POPULAR_ICONS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('finds icons by English and Arabic words', () => {
    const names = (q: string, options?: Parameters<typeof searchIcons>[2]) =>
      searchIcons(icons, q, options).map((i) => i.id);
    expect(names('heart')[0]).toMatch(/\/heart$/);
    expect(names('قلب')).toContain('lucide/heart');
    expect(names('القلب')).toContain('lucide/heart');
    expect(names('سيارة')).toContain('lucide/car');
    expect(names('مسجد').length).toBeGreaterThan(0);
    expect(names('arrow right')).toContain('lucide/arrow-right');
    expect(searchIcons(icons, '', { category: 'brands' }).every((i) => i.category === 'brands')).toBe(true);
    expect(searchIcons(icons, 'heart', { style: 'filled' }).every((i) => i.style === 'filled')).toBe(true);
    // One library at a time.
    const material = names('home', { library: 'material' });
    expect(material.length).toBeGreaterThan(3);
    expect(material.every((id) => id.startsWith('material'))).toBe(true);
    // Flags by country, in English and Arabic.
    expect(names('egypt')).toContain('flags/egypt');
    expect(names('مصر')).toContain('flags/egypt');
    expect(names('علم مصر')).toEqual(['flags/egypt']);
    expect(names('فلسطين')).toContain('flags/state-of-palestine');
    expect(names('الأردن')).toContain('flags/jordan');
    expect(names('السعودية')).toContain('flags/saudi-arabia');
  });

  it('normalizes Arabic spelling variants', () => {
    expect(normalizeArabic('إضافةٌ')).toBe('اضافه');
    expect(englishFor('اضافه')).toContain('add');
  });
});
