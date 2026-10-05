#!/usr/bin/env node
/**
 * Generates the editor's icon library from open-source icon sets:
 *
 *   Lucide (ISC)         lucide-static   outline icons, stroked
 *   Tabler Icons (MIT)   @tabler/icons   filled icons
 *
 * Every icon becomes one SVG path in a 24×24 view box, so it is inserted as an
 * editable vector `path` element. Output: apps/web/src/lib/icon-library/*.json
 * (loaded lazily by the Elements panel).
 *
 *   node scripts/generate-icon-library.mjs
 *
 * The packages are fetched with `npm pack` into a temporary directory, so they
 * are not dependencies of the app.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LUCIDE_VERSION = '1.49.0';
const TABLER_VERSION = '3.49.0';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/web/src/lib/icon-library');

function fetchPackage(spec, dir) {
  const file = execFileSync('npm', ['pack', spec, '--silent'], { cwd: dir, encoding: 'utf8' }).trim();
  const target = join(dir, spec.replace(/[@/]/g, '_'));
  mkdirSync(target);
  execFileSync('tar', ['-xzf', join(dir, file), '-C', target]);
  return join(target, 'package');
}

const num = (v) => Number(v ?? 0);
const fmt = (v) => String(Math.round(v * 1000) / 1000);

/** Converts one SVG element to path data. */
function elementToPath(tag, a) {
  switch (tag) {
    case 'path':
      return String(a.d ?? '');
    case 'circle': {
      const [cx, cy, r] = [num(a.cx), num(a.cy), num(a.r)];
      return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`;
    }
    case 'ellipse': {
      const [cx, cy, rx, ry] = [num(a.cx), num(a.cy), num(a.rx), num(a.ry)];
      return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`;
    }
    case 'rect': {
      const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
      const r = Math.min(num(a.rx ?? a.ry), w / 2, h / 2);
      if (!r) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`;
      const ry = Math.min(num(a.ry ?? a.rx), h / 2);
      return (
        `M${fmt(x + r)} ${fmt(y)}h${fmt(w - 2 * r)}a${fmt(r)} ${fmt(ry)} 0 0 1 ${fmt(r)} ${fmt(ry)}` +
        `v${fmt(h - 2 * ry)}a${fmt(r)} ${fmt(ry)} 0 0 1 ${fmt(-r)} ${fmt(ry)}h${fmt(-(w - 2 * r))}` +
        `a${fmt(r)} ${fmt(ry)} 0 0 1 ${fmt(-r)} ${fmt(-ry)}v${fmt(-(h - 2 * ry))}a${fmt(r)} ${fmt(ry)} 0 0 1 ${fmt(r)} ${fmt(-ry)}Z`
      );
    }
    case 'line':
      return `M${fmt(num(a.x1))} ${fmt(num(a.y1))}L${fmt(num(a.x2))} ${fmt(num(a.y2))}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      let d = '';
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${fmt(pts[i])} ${fmt(pts[i + 1])}`;
      return tag === 'polygon' ? `${d}Z` : d;
    }
    default:
      throw new Error(`Unsupported SVG element <${tag}>`);
  }
}

/**
 * Lucide's categories live in its repository (not in the npm package): one
 * small JSON file per icon, fetched with curl in parallel batches.
 */
function fetchLucideCategories(names, dir) {
  const target = join(dir, 'lucide-meta');
  mkdirSync(target);
  for (let i = 0; i < names.length; i += 300) {
    const args = ['--parallel', '--parallel-max', '32', '-sS', '--retry', '3'];
    for (const name of names.slice(i, i + 300)) {
      args.push(
        '-o',
        join(target, `${name}.json`),
        `https://raw.githubusercontent.com/lucide-icons/lucide/${LUCIDE_VERSION}/icons/${name}.json`,
      );
    }
    execFileSync('curl', args, { stdio: 'inherit' });
  }
  const out = {};
  for (const name of names) {
    try {
      out[name] = JSON.parse(readFileSync(join(target, `${name}.json`), 'utf8')).categories ?? [];
    } catch {
      out[name] = [];
    }
  }
  return out;
}

/** Library categories shown in the editor; source categories map onto them in order. */
const CATEGORY_MAP = {
  arrows: ['arrows', 'cursors', 'Arrows'],
  shapes: ['shapes', 'Shapes', 'Badges'],
  people: ['people', 'account', 'emoji', 'accessibility', 'Mood', 'Gestures', 'Gender'],
  communication: ['communication', 'mail', 'notifications', 'social', 'connectivity', 'Communication'],
  business: ['finance', 'shopping', 'E-commerce', 'Currencies'],
  charts: ['charts', 'Charts', 'Database'],
  media: ['multimedia', 'photography', 'Media', 'Photography'],
  nature: ['nature', 'weather', 'seasons', 'sustainability', 'animals', 'Nature', 'Weather', 'Animals'],
  food: ['food-beverage', 'Food'],
  travel: ['travel', 'transportation', 'navigation', 'buildings', 'home', 'Map', 'Vehicles', 'Buildings'],
  health: ['medical', 'science', 'Health'],
  sports: ['sports', 'gaming', 'Sport', 'Games'],
  time: ['time'],
  security: ['security'],
  files: ['files', 'Document'],
  design: ['design', 'text', 'layout', 'tools', 'Design', 'Text', 'Letters', 'Numbers'],
  devices: ['devices', 'development', 'Devices', 'Computers', 'Development', 'Version control'],
  symbols: ['math', 'Math', 'Symbols', 'Zodiac', 'Laundry'],
  brands: ['brands', 'Brand'],
};
const CATEGORY_OF_SOURCE = new Map();
for (const [ui, sources] of Object.entries(CATEGORY_MAP))
  for (const source of sources) CATEGORY_OF_SOURCE.set(source, ui);

function uiCategory(sourceCategories) {
  for (const c of sourceCategories) {
    const ui = CATEGORY_OF_SOURCE.get(c);
    if (ui) return ui;
  }
  return 'interface';
}

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const LEADING_RELATIVE_MOVE = new RegExp(String.raw`^\s*m\s*(${NUMBER})[\s,]*(${NUMBER})[\s,]*`);

/**
 * Makes an element's path independent of the elements before it: a path that
 * starts with a relative "m" would otherwise move relative to the previous
 * element once they are joined. Implicit pairs after "m" are relative lines.
 */
function absoluteStart(d) {
  return d.replace(LEADING_RELATIVE_MOVE, (match, x, y, _offset, whole) => {
    const rest = whole.slice(match.length);
    return /^[-+.\d]/.test(rest) ? `M${x} ${y}l` : `M${x} ${y}`;
  });
}

const words = (list) =>
  [
    ...new Set(
      list
        .flatMap((w) =>
          String(w)
            .toLowerCase()
            .split(/[\s-]+/),
        )
        .filter(Boolean),
    ),
  ].join(' ');

const work = mkdtempSync(join(tmpdir(), 'oc-icons-'));
try {
  const lucideDir = fetchPackage(`lucide-static@${LUCIDE_VERSION}`, work);
  const tablerDir = fetchPackage(`@tabler/icons@${TABLER_VERSION}`, work);

  const tablerMeta = JSON.parse(readFileSync(join(tablerDir, 'icons.json'), 'utf8'));
  const tablerCategory = (name) => (tablerMeta[name]?.category ? [tablerMeta[name].category] : []);

  // Lucide: outline icons.
  const lucideNodes = JSON.parse(readFileSync(join(lucideDir, 'icon-nodes.json'), 'utf8'));
  const lucideTags = JSON.parse(readFileSync(join(lucideDir, 'tags.json'), 'utf8'));
  const lucideCategories = fetchLucideCategories(Object.keys(lucideNodes), work);
  const lucide = Object.entries(lucideNodes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, nodes]) => [
      name,
      nodes.map(([tag, attrs]) => absoluteStart(elementToPath(tag, attrs))).join(''),
      words([name, ...(lucideTags[name] ?? [])]),
      uiCategory([...lucideCategories[name], ...tablerCategory(name)]),
    ]);

  // Tabler: filled icons (the invisible 24×24 bounding path is dropped).
  const tablerFilled = JSON.parse(readFileSync(join(tablerDir, 'tabler-nodes-filled.json'), 'utf8'));
  const tabler = Object.entries(tablerFilled)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, nodes]) => [
      name,
      nodes
        .filter(([, attrs]) => attrs.fill !== 'none' && attrs.d !== 'M0 0h24v24H0z')
        .map(([tag, attrs]) => absoluteStart(elementToPath(tag, attrs)))
        .join(''),
      words([name, ...(tablerMeta[name]?.tags ?? [])]),
      uiCategory(tablerCategory(name)),
    ])
    .filter(([, d]) => d);

  mkdirSync(outDir, { recursive: true });
  const write = (file, set) => {
    writeFileSync(join(outDir, file), `${JSON.stringify(set)}\n`);
    console.log(`${file}: ${set.icons.length} icons`);
  };
  write('lucide.json', {
    name: 'Lucide',
    version: LUCIDE_VERSION,
    license: 'ISC',
    url: 'https://lucide.dev',
    style: 'outline',
    icons: lucide,
  });
  write('tabler-filled.json', {
    name: 'Tabler Icons',
    version: TABLER_VERSION,
    license: 'MIT',
    url: 'https://tabler.io/icons',
    style: 'filled',
    icons: tabler,
  });
  writeFileSync(
    join(outDir, 'LICENSES.md'),
    `# Icon licenses

The icon library is generated by \`scripts/generate-icon-library.mjs\`.

## Lucide ${LUCIDE_VERSION} — ISC License

${readFileSync(join(lucideDir, 'LICENSE'), 'utf8').trim()}

## Tabler Icons ${TABLER_VERSION} — MIT License

${readFileSync(join(tablerDir, 'LICENSE'), 'utf8').trim()}
`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
