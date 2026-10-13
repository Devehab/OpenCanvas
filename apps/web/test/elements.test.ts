import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createDefaultCommandRegistry,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  DocumentStore,
  executeCommand,
  getFrameAtPoint,
  getFrameClipPath,
  getPageCorners,
  getShapePath,
  LIMITS,
  MockTextMeasurer,
  type NodeRecord,
  normalizeGroupsFinalizer,
  parseSvgPath,
  pathBounds,
  pointInPath,
} from '@opencanvas/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOG } from '../src/lib/element-catalog';
import {
  ELEMENT_GROUPS,
  elementMatches,
  isFrameElement,
  loadElementCatalog,
  searchElements,
} from '../src/lib/element-library';
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

const ALL_ELEMENTS = CATALOG.all;
const FRAME_ELEMENTS = ALL_ELEMENTS.filter(isFrameElement);

/** Every node of an element's props tree. */
const propsTree = (p: Record<string, unknown>): Record<string, unknown>[] => [
  p,
  ...((p.children as Record<string, unknown>[] | undefined) ?? []).flatMap(propsTree),
];

describe('element library', () => {
  it('has unique ids and hundreds of elements in every group', () => {
    const ids = ALL_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_ELEMENTS.length).toBeGreaterThan(450);
    const count = (group: keyof typeof CATALOG.sections) =>
      CATALOG.sections[group].reduce((n, s) => n + s.items.length, 0);
    expect(count('shapes')).toBeGreaterThan(200);
    expect(count('frames')).toBeGreaterThan(150);
    for (const group of ELEMENT_GROUPS)
      expect(count(group.id), group.id).toBeGreaterThan(group.featured.length);
  });

  it('the README and the landing page give the real counts', () => {
    const count = (...groups: (keyof typeof CATALOG.sections)[]) =>
      groups.reduce((n, g) => n + CATALOG.sections[g].reduce((m, s) => m + s.items.length, 0), 0);
    const shapes = count('shapes');
    const lines = count('lines');
    const frames = count('frames', 'photo-frames', 'grids', 'mockups');
    const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
    const site = readFileSync(new URL('../../../site/index.html', import.meta.url), 'utf8');
    for (const text of [readme, site]) {
      expect(text).toContain(`${shapes} `);
      expect(text).toContain(`${lines} `);
      expect(text).toContain(`${frames} `);
    }
    expect(readme).toContain(`${shapes} shapes`);
    expect(readme).toContain(`${frames} photo frames`);
    expect(site).toContain(`${shapes} shapes`);
    expect(site).toContain(`${frames} frames`);
    // The landing page's round figure.
    const total = shapes + lines + frames;
    const shown = Number(
      /<strong>(\d+)\+<\/strong>\s*<span data-l="en">shapes, lines and photo frames/.exec(site)?.[1],
    );
    expect(total).toBeGreaterThanOrEqual(shown);
    expect(total - shown).toBeLessThan(50);
  });

  it('shows on its first page only elements of the catalog, in their own group', () => {
    for (const group of ELEMENT_GROUPS) {
      const items = CATALOG.sections[group.id].flatMap((s) => s.items);
      for (const element of group.featured) expect(items, element.id).toContain(element);
    }
  });

  it('loads the catalog lazily: the first page does not bundle it', async () => {
    const source = readFileSync(new URL('../src/lib/element-library.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => i?.startsWith('./element-catalog'))).toEqual(['./element-catalog/builders']);
    expect(source).toContain("import('./element-catalog')");
    expect(await loadElementCatalog()).toBe(CATALOG);
  });

  it('every element has a name in both languages and valid outlines', () => {
    for (const element of ALL_ELEMENTS) {
      expect(element.label.en.trim(), element.id).not.toBe('');
      expect(element.label.ar.trim(), element.id).not.toBe('');
      expect(element.label.ar, element.id).toMatch(/[\u0600-\u06ff]/);
      for (const node of propsTree(element.props as unknown as Record<string, unknown>)) {
        if (node.shape !== 'custom') continue;
        const path = String(node.path ?? '');
        expect(path.length, element.id).toBeGreaterThan(0);
        expect(path.length, element.id).toBeLessThanOrEqual(LIMITS.maxCustomPathLength);
        const b = pathBounds(parseSvgPath(path));
        expect(b.width * b.height, element.id).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the holes of outlines with holes', () => {
    const outline = (id: string) => {
      const props = ALL_ELEMENTS.find((e) => e.id === id)!.props as unknown as { path: string };
      return getShapePath('custom', 100, 100, { path: props.path });
    };
    expect(pointInPath(outline('shape:square-outline'), { x: 50, y: 50 })).toBe(false);
    expect(pointInPath(outline('shape:square-outline'), { x: 5, y: 50 })).toBe(true);
    expect(pointInPath(outline('shape:location-pin'), { x: 50, y: 38 })).toBe(false);
    expect(pointInPath(outline('shape:gear'), { x: 50, y: 50 })).toBe(false);
    // Overlapping parts merge instead of cancelling out.
    expect(pointInPath(outline('shape:flower-5'), { x: 50, y: 50 })).toBe(true);
    expect(pointInPath(outline('shape:thought-bubble'), { x: 50, y: 45 })).toBe(true);
  });

  it.each(ALL_ELEMENTS.map((e) => [e.id, e] as const))('%s is a valid element', (_, element) => {
    const { store, pageId, run } = doc();
    const { result } = run('node.create', { parentId: pageId, nodes: [element.props] });
    const node = store.getNode(result.select![0]!)!;
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
  });

  it.each(FRAME_ELEMENTS.map((e) => [e.id, e] as const))(
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
        if (frame.type !== 'frame') continue;
        // Outlines with a hollow middle (a ring, the letter O) take drops elsewhere.
        if (!pointInPath(getFrameClipPath(frame), { x: frame.width / 2, y: frame.height / 2 })) continue;
        const corners = getPageCorners(store, frame);
        const center = {
          x: corners.reduce((s, p) => s + p.x, 0) / 4,
          y: corners.reduce((s, p) => s + p.y, 0) / 4,
        };
        expect(getFrameAtPoint(store, pageId, center)?.id).toBe(frame.id);
      }
    },
  );

  it('searches in English and Arabic, best matches first', () => {
    const heart = ALL_ELEMENTS.find((e) => e.id === 'shape:heart')!;
    expect(elementMatches(heart, 'heart')).toBe(true);
    expect(elementMatches(heart, 'قلب')).toBe(true);
    expect(elementMatches(heart, 'star')).toBe(false);
    const polaroid = ALL_ELEMENTS.find((e) => e.id === 'frame:polaroid')!;
    expect(elementMatches(polaroid, 'صوره فوريه')).toBe(true); // forgiving spelling
    expect(searchElements(ALL_ELEMENTS, 'heart')[0]!.id).toBe('shape:heart');
    // A single letter finds its letter frame first, not every name with that letter.
    expect(searchElements(ALL_ELEMENTS, 'A')[0]!.id).toBe('frame:letter-a');
    expect(searchElements(ALL_ELEMENTS, '7')[0]!.id).toBe('frame:number-7');
    expect(searchElements(ALL_ELEMENTS, 'حرف ب')[0]!.label.ar).toBe('حرف ب');
    expect(searchElements(ALL_ELEMENTS, 'فانوس').map((e) => e.id)).toContain('frame:lantern');
    expect(searchElements(ALL_ELEMENTS, 'phone').filter(isFrameElement).length).toBeGreaterThan(4);
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
