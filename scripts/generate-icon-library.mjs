#!/usr/bin/env node
/**
 * Generates the editor's icon library from open-source icon sets, all free for
 * commercial use:
 *
 *   Lucide          ISC          lucide-static                outline (stroked)
 *   Tabler Icons    MIT          @tabler/icons                outline (stroked) and filled
 *   Bootstrap Icons MIT          bootstrap-icons              outline and filled
 *   Heroicons       MIT          heroicons                    outline (stroked) and solid
 *   Hugeicons       MIT          @hugeicons/core-free-icons   outline (stroked; the free set)
 *   Material Icons  Apache-2.0   @material-design-icons/svg   filled, outlined, round, sharp
 *   Radix Icons     MIT          @radix-ui/react-icons        outline
 *   Remix Icon      Apache-2.0   remixicon 4.6.0              outline and filled
 *   Flag Icons      MIT          flag-icons                   country flags (full colour)
 *
 * Remix Icon is pinned to 4.6.0, the last version under the Apache License
 * 2.0: from 4.7 it uses the "Remix Icon License", which forbids using the
 * icons in logos and in competing icon libraries, both of which a design
 * editor's users may do.
 *
 * Every icon except the flags becomes one SVG path (stroked or filled) in its
 * set's view box, so it is inserted as an editable vector `path` element.
 * Each one is then drawn in Chromium next to its original SVG: filled icons
 * take the fill rule that matches, and icons that still look different, or
 * cannot be one path at all (a few mix strokes and fills, or use
 * transparency or transforms), are left out and listed. Flags keep their
 * colours: they are SVG files, inserted as images.
 *
 * Output (loaded lazily, one set at a time, by the Elements panel):
 *   apps/web/src/lib/icon-library/sets/<set>.json   the icons of each set
 *   apps/web/src/lib/icon-library/manifest.json     the sets, their licenses and counts
 *   apps/web/src/lib/icon-library/LICENSES.md       every license text
 *   apps/web/public/icon-library/flags/<code>.svg   the flags
 *
 *   node scripts/generate-icon-library.mjs              (needs the repository's Playwright)
 *   node scripts/generate-icon-library.mjs --no-verify  (skips the visual check)
 *
 * The packages are fetched with `npm pack` into a temporary directory, so they
 * are not dependencies of the app.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSIONS = {
  lucide: '1.49.0',
  tabler: '3.49.0',
  bootstrap: '1.13.2',
  heroicons: '2.2.0',
  hugeicons: '4.3.5',
  material: '0.14.15',
  radix: '1.3.2',
  // Not later: see above.
  remix: '4.6.0',
  flags: '7.5.0',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/web/src/lib/icon-library');
const flagsDir = join(root, 'apps/web/public/icon-library/flags');

function fetchPackage(spec, dir) {
  const file = execFileSync('npm', ['pack', spec, '--silent'], { cwd: dir, encoding: 'utf8' })
    .trim()
    .split('\n')
    .at(-1);
  const target = join(dir, spec.replace(/[@/]/g, '_'));
  mkdirSync(target);
  execFileSync('tar', ['-xzf', join(dir, file), '-C', target]);
  return join(target, 'package');
}

const walk = (dir) =>
  readdirSync(dir)
    .sort()
    .flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

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

/** Attributes, camelCase or kebab-case, read the same way. */
const attr = (a, name) => a[name] ?? a[name.replace(/-(\w)/g, (_, c) => c.toUpperCase())];
const painted = (value) => value !== undefined && value !== 'none' && value !== 'transparent';

/**
 * Turns an icon's elements into one path, or explains why it cannot be one.
 * `mode` is how the set draws: 'stroke' (outline icons, `strokeWidth` wide)
 * or 'fill'.
 */
function toPath(nodes, mode, strokeWidth = 2) {
  const parts = [];
  let evenodd = false;
  let nonzero = false;
  for (const [tag, a] of nodes) {
    if (tag === 'g' || tag === 'defs' || tag === 'title') continue;
    if (attr(a, 'transform')) return { skip: 'transform' };
    if (
      ['opacity', 'fill-opacity', 'stroke-opacity'].some(
        (k) => attr(a, k) !== undefined && Number(attr(a, k)) < 1,
      )
    )
      return { skip: 'transparency' };
    const fill = attr(a, 'fill');
    const stroke = attr(a, 'stroke');
    if (mode === 'stroke') {
      if (stroke === 'none' && !painted(fill)) continue; // invisible helpers
      // A filled and stroked dot no wider than the stroke looks the same stroked only.
      const radius = Math.max(num(a.r), num(a.rx), num(a.ry));
      const dot =
        (tag === 'circle' || tag === 'ellipse') && stroke !== 'none' && radius <= strokeWidth / 2 + 0.01;
      if (painted(fill) && !dot) return { skip: 'stroke and fill' };
    } else {
      if (fill === 'none' && !painted(stroke)) continue; // invisible helpers (bounding boxes)
      if (painted(stroke)) return { skip: 'stroke and fill' };
    }
    const d = absoluteStart(elementToPath(tag, a)).trim();
    // An element drawn twice looks the same, but joined into one even-odd
    // path the two copies would cancel out.
    if (!d || parts.includes(d)) continue;
    if (attr(a, 'fill-rule') === 'evenodd') evenodd = true;
    else nonzero = true;
    parts.push(d);
  }
  if (!parts.length) return { skip: 'empty' };
  // Elements are joined into one path. With mixed rules, even-odd wins: the
  // non-zero elements of these sets are single shapes, where both agree.
  return { path: parts.join(''), evenodd: mode === 'fill' && evenodd, mixedRules: evenodd && nonzero };
}

/** The elements of a (simple, flat) SVG file. */
function svgNodes(svg) {
  const body = svg.replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, '');
  const nodes = [];
  for (const m of body.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon|g)\b([^>]*?)\/?>/g)) {
    const a = {};
    for (const p of m[2].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) a[p[1]] = p[2];
    nodes.push([m[1], a]);
  }
  // A transform on a group applies to every element in it.
  if (/<g\b[^>]*\stransform=/.test(body)) nodes.push(['g', { transform: 'group' }]);
  return nodes;
}

/** An icon's original drawing as SVG markup, for --verify. */
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const nodesToSvg = (nodes, size, mode, strokeWidth = 2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" fill="${mode === 'fill' ? 'currentColor' : 'none'}" stroke="${mode === 'stroke' ? 'currentColor' : 'none'}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${nodes
    .map(
      ([tag, a]) =>
        `<${tag} ${Object.entries(a)
          .filter(([k]) => k !== 'key')
          .map(([k, v]) => `${kebab(k)}="${v}"`)
          .join(' ')}/>`,
    )
    .join('')}</svg>`;

const viewBoxOf = (svg) =>
  (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24')
    .trim()
    .split(/[\s,]+/)
    .map(Number);

const words = (list) =>
  [
    ...new Set(
      list
        .flatMap((w) =>
          String(w)
            .toLowerCase()
            .split(/[\s_-]+/),
        )
        .filter(Boolean),
    ),
  ].join(' ');

// ---------- Categories ----------

/** Library categories shown in the editor; source categories map onto them in order. */
const CATEGORY_MAP = {
  arrows: ['arrows', 'cursors', 'Arrows'],
  shapes: ['shapes', 'Shapes', 'Badges'],
  people: ['people', 'account', 'emoji', 'accessibility', 'Mood', 'Gestures', 'Gender', 'User & Faces'],
  communication: ['communication', 'mail', 'notifications', 'social', 'connectivity', 'Communication'],
  business: ['finance', 'shopping', 'E-commerce', 'Currencies', 'Business', 'Finance'],
  charts: ['charts', 'Charts', 'Database'],
  media: ['multimedia', 'photography', 'Media', 'Photography'],
  nature: ['nature', 'weather', 'seasons', 'sustainability', 'animals', 'Nature', 'Weather', 'Animals'],
  food: ['food-beverage', 'Food'],
  travel: ['travel', 'transportation', 'navigation', 'buildings', 'home', 'Map', 'Vehicles', 'Buildings'],
  health: ['medical', 'science', 'Health', 'Health & Medical'],
  sports: ['sports', 'gaming', 'Sport', 'Games'],
  time: ['time'],
  security: ['security'],
  files: ['files', 'Document'],
  design: ['design', 'text', 'layout', 'tools', 'Design', 'Text', 'Letters', 'Numbers', 'Editor'],
  devices: ['devices', 'development', 'Devices', 'Computers', 'Development', 'Version control', 'Device'],
  symbols: ['math', 'Math', 'Symbols', 'Zodiac', 'Laundry'],
  brands: ['brands', 'Brand', 'Logos'],
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

/**
 * Sets without categories borrow them: every word of a Lucide or Tabler icon
 * name votes for its category, and an icon takes the category its name's
 * words point to most clearly.
 */
function categoryGuesser(categorized) {
  const votes = new Map();
  for (const [name, category] of categorized) {
    for (const word of name.split(/[\s_-]+/)) {
      if (!word || /^\d+$/.test(word)) continue;
      const v = votes.get(word) ?? new Map();
      v.set(category, (v.get(category) ?? 0) + 1);
      votes.set(word, v);
    }
  }
  return (name) => {
    const score = new Map();
    for (const word of name.split(/[\s_-]+/)) {
      const v = votes.get(word);
      if (!v) continue;
      const total = [...v.values()].reduce((a, b) => a + b, 0);
      for (const [c, n] of v) score.set(c, (score.get(c) ?? 0) + n / total);
    }
    let best = 'interface';
    let top = 0.6; // weak evidence stays in "interface"
    for (const [c, s] of score)
      if (s > top) {
        best = c;
        top = s;
      }
    return best;
  };
}

// ---------- Arabic names for the flags ----------

/** The editor's Arabic search normalization (apps/web/src/lib/icon-library/arabic.ts). */
const normalizeArabic = (text) =>
  text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();

/** Everyday Arabic names that differ from the standard (ICU) ones. */
const ARABIC_NAMES = {
  ps: 'فلسطين',
  sa: 'السعودية',
  ae: 'الإمارات',
  us: 'أمريكا الولايات المتحدة',
  gb: 'بريطانيا المملكة المتحدة إنجلترا',
  'gb-eng': 'إنجلترا',
  'gb-sct': 'اسكتلندا',
  'gb-wls': 'ويلز',
  'gb-nir': 'أيرلندا الشمالية',
  eu: 'الاتحاد الأوروبي',
  un: 'الأمم المتحدة',
  arab: 'جامعة الدول العربية العرب',
  kr: 'كوريا الجنوبية',
  kp: 'كوريا الشمالية',
  cd: 'الكونغو الديمقراطية',
  cg: 'الكونغو',
};

/** Places named only by their everyday name (ICU calls Palestine "the Palestinian territories"). */
const OWN_NAME_ONLY = new Set(['ps']);

function arabicKeywords(code) {
  const names = [];
  if (ARABIC_NAMES[code]) names.push(ARABIC_NAMES[code]);
  try {
    if (/^[a-z]{2}$/.test(code) && !OWN_NAME_ONLY.has(code))
      names.push(new Intl.DisplayNames(['ar'], { type: 'region' }).of(code.toUpperCase()));
  } catch {
    // not a region code
  }
  const out = new Set();
  for (const word of names.join(' ').split(/\s+/)) {
    const n = normalizeArabic(word);
    if (n.length < 2) continue;
    out.add(n);
    if (n.startsWith('ال') && n.length > 3) out.add(n.slice(2)); // "الأردن" is found as "أردن" too
  }
  return [...out];
}

// ---------- The sets ----------

/** Lucide categories of the previous run, used when GitHub cannot be reached. */
const previousLucideCategories = new Map();
for (const file of [join(outDir, 'sets/lucide.json'), join(outDir, 'lucide.json')]) {
  if (!existsSync(file)) continue;
  for (const [name, , , category] of JSON.parse(readFileSync(file, 'utf8')).icons)
    previousLucideCategories.set(name, category);
  break;
}

const work = mkdtempSync(join(tmpdir(), 'oc-icons-'));
const skipped = new Map(); // set → reason → names
const skip = (set, reason, name) => {
  const s = skipped.get(set) ?? new Map();
  s.set(reason, [...(s.get(reason) ?? []), name]);
  skipped.set(set, s);
};

try {
  const pkg = {
    lucide: fetchPackage(`lucide-static@${VERSIONS.lucide}`, work),
    tabler: fetchPackage(`@tabler/icons@${VERSIONS.tabler}`, work),
    bootstrap: fetchPackage(`bootstrap-icons@${VERSIONS.bootstrap}`, work),
    heroicons: fetchPackage(`heroicons@${VERSIONS.heroicons}`, work),
    hugeicons: fetchPackage(`@hugeicons/core-free-icons@${VERSIONS.hugeicons}`, work),
    material: fetchPackage(`@material-design-icons/svg@${VERSIONS.material}`, work),
    radix: fetchPackage(`@radix-ui/react-icons@${VERSIONS.radix}`, work),
    remix: fetchPackage(`remixicon@${VERSIONS.remix}`, work),
    flags: fetchPackage(`flag-icons@${VERSIONS.flags}`, work),
  };

  /**
   * Each set: [name, path, keywords, category, flags], where flags has "f"
   * for an icon that looks filled and "e" for even-odd filling.
   */
  const sets = [];
  const addSet = (meta, icons) => {
    // Some names are aliases of the same drawing: one icon, found by every name.
    const byName = new Map();
    const byPath = new Map();
    for (const icon of [...icons].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (byName.has(icon[0])) continue;
      const same = icon[1] && byPath.get(icon[1] + icon[4]);
      if (same) {
        same[2] = words([same[2], icon[0], icon[2]]);
        continue;
      }
      byName.set(icon[0], icon);
      if (icon[1]) byPath.set(icon[1] + icon[4], icon);
    }
    sets.push({ ...meta, icons: [...byName.values()] });
  };

  // Lucide: outline icons, with tags and categories.
  const tablerMeta = JSON.parse(readFileSync(join(pkg.tabler, 'icons.json'), 'utf8'));
  const tablerCategory = (name) => (tablerMeta[name]?.category ? [tablerMeta[name].category] : []);
  const lucideNodes = JSON.parse(readFileSync(join(pkg.lucide, 'icon-nodes.json'), 'utf8'));
  const lucideTags = JSON.parse(readFileSync(join(pkg.lucide, 'tags.json'), 'utf8'));
  const lucideCategories = fetchLucideCategories(Object.keys(lucideNodes), work);
  const lucide = Object.entries(lucideNodes).flatMap(([name, nodes]) => {
    const { path, skip: why } = toPath(nodes, 'stroke', 2);
    if (!path) {
      skip('lucide', why, name);
      return [];
    }
    return [
      [
        name,
        path,
        words([name, ...(lucideTags[name] ?? [])]),
        lucideCategories
          ? uiCategory([...lucideCategories[name], ...tablerCategory(name)])
          : (previousLucideCategories.get(name) ?? uiCategory(tablerCategory(name))),
        '',
        nodesToSvg(nodes, 24, 'stroke', 2),
      ],
    ];
  });

  // Tabler: outline and filled icons (the invisible 24×24 bounding path is dropped).
  const tabler = (file, flags) =>
    Object.entries(JSON.parse(readFileSync(join(pkg.tabler, file), 'utf8'))).flatMap(([name, nodes]) => {
      const visible = nodes.filter(([, a]) => a.d !== 'M0 0h24v24H0z');
      const result = toPath(visible, flags === 'f' ? 'fill' : 'stroke', 2);
      if (!result.path) {
        skip(`tabler ${flags ? 'filled' : 'outline'}`, result.skip, name);
        return [];
      }
      return [
        [
          name,
          result.path,
          words([name, ...(tablerMeta[name]?.tags ?? [])]),
          uiCategory(tablerCategory(name)),
          flags + (result.evenodd ? 'e' : ''),
          nodesToSvg(visible, 24, flags === 'f' ? 'fill' : 'stroke', 2),
        ],
      ];
    });
  const tablerOutline = tabler('tabler-nodes-outline.json', '');
  const tablerFilled = tabler('tabler-nodes-filled.json', 'f');

  // Tags and categories other sets can borrow by icon name.
  const knownTags = new Map();
  const categorized = [];
  for (const [name, , keywords, category] of [...lucide, ...tablerOutline, ...tablerFilled]) {
    if (!knownTags.has(name)) knownTags.set(name, keywords);
    if (category !== 'interface') categorized.push([name, category]);
  }
  const guessCategory = categoryGuesser(categorized);
  /** Keywords from the name, the set's own tags and a same-named Lucide or Tabler icon. */
  const keywordsFor = (name, base, tags = []) => words([name, ...tags, knownTags.get(base) ?? '']);

  // Bootstrap Icons: 16×16, filled paths ("-fill" icons look filled).
  const bootstrap = walk(join(pkg.bootstrap, 'icons'))
    .filter((f) => f.endsWith('.svg'))
    .flatMap((file) => {
      const name = basename(file, '.svg');
      const svg = readFileSync(file, 'utf8');
      const result = toPath(svgNodes(svg), 'fill');
      if (!result.path) {
        skip('bootstrap', result.skip, name);
        return [];
      }
      const base = name.replace(/-fill$/, '');
      return [
        [
          name,
          result.path,
          keywordsFor(name, base),
          guessCategory(base),
          (name.endsWith('-fill') ? 'f' : '') + (result.evenodd ? 'e' : ''),
          svg,
        ],
      ];
    });

  // Heroicons: 24×24 outline (stroked) and solid.
  const heroicons = (style, mode, flags) =>
    walk(join(pkg.heroicons, '24', style)).flatMap((file) => {
      const name = basename(file, '.svg');
      const svg = readFileSync(file, 'utf8');
      const result = toPath(svgNodes(svg), mode, 1.5);
      if (!result.path) {
        skip(`heroicons ${style}`, result.skip, name);
        return [];
      }
      return [
        [
          name,
          result.path,
          keywordsFor(name, name),
          guessCategory(name),
          flags + (result.evenodd ? 'e' : ''),
          svg,
        ],
      ];
    });

  // Hugeicons (free): 24×24 outline icons, one module of element arrays per icon.
  const hugeDir = join(pkg.hugeicons, 'dist/esm');
  const hugeicons = readdirSync(hugeDir)
    .filter((f) => /^[A-Z].*Icon\.js$/.test(f))
    .sort()
    .flatMap((file) => {
      const source = readFileSync(join(hugeDir, file), 'utf8');
      const literal = /=\s*(\[[\s\S]*\]);/.exec(source)?.[1];
      // A plain data literal (arrays of strings and objects), evaluated without imports.
      const nodes = new Function(`return ${literal};`)();
      const name = file
        .replace(/Icon\.js$/, '')
        .replace(/([a-z\d])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-zA-Z])(\d)/g, '$1-$2')
        .toLowerCase();
      const widths = new Set(nodes.map(([, a]) => a.strokeWidth).filter(Boolean));
      if (widths.size > 1 || (widths.size === 1 && !widths.has('1.5'))) {
        skip('hugeicons', 'stroke width', name);
        return [];
      }
      const result = toPath(nodes, 'stroke', 1.5);
      if (!result.path) {
        skip('hugeicons', result.skip, name);
        return [];
      }
      const base = name.replace(/-\d+$/, '');
      return [
        [
          name,
          result.path,
          keywordsFor(name, base),
          guessCategory(base),
          '',
          nodesToSvg(nodes, 24, 'stroke', 1.5),
        ],
      ];
    });

  // Material Icons: 24×24, four styles.
  const material = (style, flags) =>
    walk(join(pkg.material, style)).flatMap((file) => {
      const name = basename(file, '.svg').replace(/_/g, '-');
      const svg = readFileSync(file, 'utf8');
      const result = toPath(svgNodes(svg), 'fill');
      if (!result.path) {
        skip(`material ${style}`, result.skip, name);
        return [];
      }
      return [
        [
          name,
          result.path,
          keywordsFor(name, name),
          guessCategory(name),
          flags + (result.evenodd ? 'e' : ''),
          svg,
        ],
      ];
    });

  // Radix Icons: 15×15 React components; their SVG elements are read by
  // running the module with a stand-in for React.
  const radixSource = readFileSync(join(pkg.radix, 'dist/react-icons.esm.js'), 'utf8')
    .replace(/^import .*$/m, '')
    .replace(/export \{([\s\S]*?)\};/, 'return {$1};');
  const radixModule = new Function('forwardRef', 'createElement', radixSource)(
    (render) => render,
    (type, props, ...children) => ({ type, props: props ?? {}, children }),
  );
  const flatten = (el) => [
    [el.type, el.props],
    ...el.children.flatMap((c) => (c && typeof c === 'object' ? flatten(c) : [])),
  ];
  const radix = Object.entries(radixModule).flatMap(([exportName, render]) => {
    const name = exportName
      .replace(/Icon$/, '')
      .replace(/([a-z\d])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
    const nodes = flatten(render({}, null)).filter(([type]) => type !== 'svg');
    const result = toPath(nodes, 'fill');
    if (!result.path) {
      skip('radix', result.skip, name);
      return [];
    }
    return [
      [
        name,
        result.path,
        keywordsFor(name, name),
        guessCategory(name),
        result.evenodd ? 'e' : '',
        nodesToSvg(nodes, 15, 'fill'),
      ],
    ];
  });

  // Remix Icon: 24×24 filled paths in category folders ("-line" and "-fill").
  const remix = walk(join(pkg.remix, 'icons')).flatMap((file) => {
    const name = basename(file, '.svg');
    const folder = basename(dirname(file));
    const svg = readFileSync(file, 'utf8');
    if (viewBoxOf(svg).join(' ') !== '0 0 24 24') {
      skip('remix', 'view box', name);
      return [];
    }
    const result = toPath(svgNodes(svg), 'fill');
    if (!result.path) {
      skip('remix', result.skip, name);
      return [];
    }
    const base = name.replace(/-(line|fill)$/, '');
    const category = uiCategory([folder]);
    return [
      [
        name,
        result.path,
        keywordsFor(name, base),
        category === 'interface' ? guessCategory(base) : category,
        (name.endsWith('-fill') ? 'f' : '') + (result.evenodd ? 'e' : ''),
        svg,
      ],
    ];
  });

  // Flags: the 4:3 SVG files, named by ISO code, in English and Arabic.
  rmSync(flagsDir, { recursive: true, force: true });
  mkdirSync(flagsDir, { recursive: true });
  const countries = JSON.parse(readFileSync(join(pkg.flags, 'country.json'), 'utf8'));
  const english = new Intl.DisplayNames(['en'], { type: 'region' });
  const flagNames = new Set();
  const flags = countries.map((c) => {
    copyFileSync(join(pkg.flags, c.flag_4x3), join(flagsDir, `${c.code}.svg`));
    let icuName = '';
    try {
      if (/^[a-z]{2}$/.test(c.code) && !OWN_NAME_ONLY.has(c.code)) icuName = english.of(c.code.toUpperCase());
    } catch {
      // not a region code
    }
    // Named after the country; the path field holds the file name.
    let name = c.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (flagNames.has(name)) name = `${name}-${c.code}`;
    flagNames.add(name);
    return [
      name,
      `${c.code}.svg`,
      words([c.code, c.name, icuName, c.capital ?? '', c.continent ?? '', 'flag country']) +
        ` ${arabicKeywords(c.code).join(' ')}`,
      'flags',
      'f',
    ];
  });

  const lic = (dir, file = 'LICENSE') => readFileSync(join(dir, file), 'utf8').trim();
  const common = (library, url, license, version) => ({ library, url, license, version });
  addSet(
    {
      id: 'lucide',
      name: 'Lucide',
      ...common('Lucide', 'https://lucide.dev', 'ISC', VERSIONS.lucide),
      mode: 'stroke',
      viewBox: 24,
      strokeWidth: 2,
    },
    lucide,
  );
  addSet(
    {
      id: 'tabler',
      name: 'Tabler Icons (filled)',
      ...common('Tabler Icons', 'https://tabler.io/icons', 'MIT', VERSIONS.tabler),
      mode: 'fill',
      viewBox: 24,
    },
    tablerFilled,
  );
  addSet(
    {
      id: 'tabler-outline',
      name: 'Tabler Icons',
      ...common('Tabler Icons', 'https://tabler.io/icons', 'MIT', VERSIONS.tabler),
      mode: 'stroke',
      viewBox: 24,
      strokeWidth: 2,
    },
    tablerOutline,
  );
  addSet(
    {
      id: 'bootstrap',
      name: 'Bootstrap Icons',
      ...common('Bootstrap Icons', 'https://icons.getbootstrap.com', 'MIT', VERSIONS.bootstrap),
      mode: 'fill',
      viewBox: 16,
    },
    bootstrap,
  );
  addSet(
    {
      id: 'heroicons',
      name: 'Heroicons',
      ...common('Heroicons', 'https://heroicons.com', 'MIT', VERSIONS.heroicons),
      mode: 'stroke',
      viewBox: 24,
      strokeWidth: 1.5,
    },
    heroicons('outline', 'stroke', ''),
  );
  addSet(
    {
      id: 'heroicons-solid',
      name: 'Heroicons (solid)',
      ...common('Heroicons', 'https://heroicons.com', 'MIT', VERSIONS.heroicons),
      mode: 'fill',
      viewBox: 24,
    },
    heroicons('solid', 'fill', 'f'),
  );
  addSet(
    {
      id: 'hugeicons',
      name: 'Hugeicons',
      ...common('Hugeicons', 'https://hugeicons.com', 'MIT', VERSIONS.hugeicons),
      mode: 'stroke',
      viewBox: 24,
      strokeWidth: 1.5,
    },
    hugeicons,
  );
  addSet(
    {
      id: 'material',
      name: 'Material Icons',
      ...common('Material Icons', 'https://fonts.google.com/icons', 'Apache-2.0', VERSIONS.material),
      mode: 'fill',
      viewBox: 24,
    },
    material('filled', 'f'),
  );
  addSet(
    {
      id: 'material-outlined',
      name: 'Material Icons (outlined)',
      ...common('Material Icons', 'https://fonts.google.com/icons', 'Apache-2.0', VERSIONS.material),
      mode: 'fill',
      viewBox: 24,
    },
    material('outlined', ''),
  );
  addSet(
    {
      id: 'material-round',
      name: 'Material Icons (round)',
      ...common('Material Icons', 'https://fonts.google.com/icons', 'Apache-2.0', VERSIONS.material),
      mode: 'fill',
      viewBox: 24,
    },
    material('round', 'f'),
  );
  addSet(
    {
      id: 'material-sharp',
      name: 'Material Icons (sharp)',
      ...common('Material Icons', 'https://fonts.google.com/icons', 'Apache-2.0', VERSIONS.material),
      mode: 'fill',
      viewBox: 24,
    },
    material('sharp', 'f'),
  );
  addSet(
    {
      id: 'radix',
      name: 'Radix Icons',
      ...common('Radix Icons', 'https://www.radix-ui.com/icons', 'MIT', VERSIONS.radix),
      mode: 'fill',
      viewBox: 15,
    },
    radix,
  );
  addSet(
    {
      id: 'remix',
      name: 'Remix Icon',
      ...common('Remix Icon', 'https://remixicon.com', 'Apache-2.0', VERSIONS.remix),
      mode: 'fill',
      viewBox: 24,
    },
    remix,
  );
  addSet(
    {
      id: 'flags',
      name: 'Flag Icons',
      ...common('Flag Icons', 'https://flagicons.lipis.dev', 'MIT', VERSIONS.flags),
      mode: 'image',
      viewBox: 0,
      aspect: 4 / 3,
    },
    flags,
  );

  // ---------- Visual check: every icon must look like its original ----------
  if (!process.argv.includes('--no-verify')) {
    const results = await compareWithOriginals(sets);
    let dropped = 0;
    for (const set of sets) {
      set.icons = set.icons.filter((icon) => {
        const result = results.get(`${set.id}/${icon[0]}`);
        if (!result) return true;
        const [nonzero, evenodd] = result;
        // Filled icons take the rule that matches better (joined elements can overlap).
        const useEvenodd = evenodd !== null && evenodd < nonzero;
        if (set.mode === 'fill') icon[4] = icon[4].replace('e', '') + (useEvenodd ? 'e' : '');
        const best = useEvenodd ? evenodd : nonzero;
        if (best <= (set.mode === 'stroke' ? 0.05 : 0.03)) return true;
        skip(set.id, 'looks different from the original', icon[0]);
        dropped++;
        return false;
      });
    }
    console.log(`checked ${results.size} icons against their originals: ${dropped} left out`);
  }

  // ---------- Output ----------
  rmSync(join(outDir, 'sets'), { recursive: true, force: true });
  rmSync(join(outDir, 'lucide.json'), { force: true });
  rmSync(join(outDir, 'tabler-filled.json'), { force: true });
  mkdirSync(join(outDir, 'sets'), { recursive: true });
  const manifest = [];
  for (const { icons, ...meta } of sets) {
    const data = icons.map((icon) => icon.slice(0, 5));
    writeFileSync(join(outDir, 'sets', `${meta.id}.json`), `${JSON.stringify({ ...meta, icons: data })}\n`);
    manifest.push({ ...meta, count: icons.length });
    console.log(`${meta.id.padEnd(18)} ${String(icons.length).padStart(5)} icons`);
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`total              ${manifest.reduce((n, s) => n + s.count, 0)} icons`);

  for (const [set, reasons] of skipped)
    for (const [reason, names] of reasons)
      console.log(
        `left out of ${set} (${reason}, ${names.length}): ${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`,
      );

  writeFileSync(
    join(outDir, 'LICENSES.md'),
    `# Icon licenses

The icon library is generated by \`scripts/generate-icon-library.mjs\` from the
sets below. All of them allow commercial use, modification and redistribution.

## Lucide ${VERSIONS.lucide} — ISC License

${lic(pkg.lucide)}

## Tabler Icons ${VERSIONS.tabler} — MIT License

${lic(pkg.tabler)}

## Bootstrap Icons ${VERSIONS.bootstrap} — MIT License

${lic(pkg.bootstrap)}

## Heroicons ${VERSIONS.heroicons} — MIT License

${lic(pkg.heroicons)}

## Hugeicons (free icons, @hugeicons/core-free-icons) ${VERSIONS.hugeicons} — MIT License

${lic(pkg.hugeicons, 'LICENSE.md')}

## Radix Icons ${VERSIONS.radix} — MIT License

${lic(pkg.radix)}

## Flag Icons ${VERSIONS.flags} — MIT License

${lic(pkg.flags)}

## Material Icons (@material-design-icons/svg ${VERSIONS.material}) — Apache License 2.0

The icons are Google's Material Icons, converted to SVG by the
@material-design-icons/svg package. Copyright Google LLC.

## Remix Icon ${VERSIONS.remix} — Apache License 2.0

Copyright (c) Remix Design. Version ${VERSIONS.remix} is published under the
Apache License 2.0 (later versions use a different license and are not used).

## Apache License 2.0 (Material Icons, Remix Icon)

${lic(pkg.material)}
`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

/**
 * Lucide's categories live in its repository (not in the npm package): one
 * small JSON file per icon, fetched with curl in parallel batches.
 */
function fetchLucideCategories(names, dir) {
  const target = join(dir, 'lucide-meta');
  mkdirSync(target);
  try {
    fetchFiles(names, target);
  } catch {
    console.warn('Lucide categories could not be fetched: the previous ones are kept.');
    return null;
  }
  const out = {};
  for (const name of names) {
    const file = join(target, `${name}.json`);
    try {
      out[name] = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).categories ?? []) : [];
    } catch {
      out[name] = [];
    }
  }
  return out;
}

function fetchFiles(names, target) {
  for (let i = 0; i < names.length; i += 300) {
    const args = ['--parallel', '--parallel-max', '32', '-sS', '--retry', '3'];
    for (const name of names.slice(i, i + 300)) {
      args.push(
        '-o',
        join(target, `${name}.json`),
        `https://raw.githubusercontent.com/lucide-icons/lucide/${VERSIONS.lucide}/icons/${name}.json`,
      );
    }
    execFileSync('curl', args, { stdio: 'inherit' });
  }
}

/**
 * Draws every icon in Chromium from its original SVG and from the generated
 * path, and measures how much of their ink differs: [non-zero, even-odd]
 * (even-odd only for filled icons).
 */
async function compareWithOriginals(sets) {
  const { createRequire } = await import('node:module');
  const require = createRequire(join(root, 'apps/web/package.json'));
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = new Map();
  for (const set of sets) {
    if (set.mode === 'image') continue;
    const jobs = set.icons.map(([name, path, , , , original]) => ({
      id: `${set.id}/${name}`,
      original,
      path,
    }));
    for (let i = 0; i < jobs.length; i += 500) {
      const batch = await page.evaluate(
        async ({ batch, mode, viewBox, strokeWidth }) => {
          const size = 64;
          const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const alpha = () => {
            const data = ctx.getImageData(0, 0, size, size).data;
            return Float32Array.from({ length: size * size }, (_, k) => data[k * 4 + 3] / 255);
          };
          const difference = (a, b) => {
            let diff = 0;
            let total = 0;
            for (let k = 0; k < a.length; k++) {
              diff += Math.abs(a[k] - b[k]);
              total += Math.max(a[k], b[k]);
            }
            return total ? diff / total : 0;
          };
          const draw = (path, rule) => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, size, size);
            ctx.setTransform(size / viewBox, 0, 0, size / viewBox, 0, 0);
            if (mode === 'stroke') {
              Object.assign(ctx, {
                lineWidth: strokeWidth,
                lineCap: 'round',
                lineJoin: 'round',
                strokeStyle: '#000',
              });
              ctx.stroke(path);
            } else {
              ctx.fillStyle = '#000';
              ctx.fill(path, rule);
            }
            return alpha();
          };
          // The originals decode in parallel; the generated paths are drawn directly.
          const images = await Promise.all(
            batch.map(async (job) => {
              const image = new Image(size, size);
              image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.original)}`;
              await image.decode();
              return image;
            }),
          );
          return batch.map((job, n) => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(images[n], 0, 0, size, size);
            const original = alpha();
            const path = new Path2D(job.path);
            const nonzero = difference(original, draw(path, 'nonzero'));
            const evenodd = mode === 'fill' ? difference(original, draw(path, 'evenodd')) : null;
            return [job.id, nonzero, evenodd];
          });
        },
        {
          batch: jobs.slice(i, i + 500),
          mode: set.mode,
          viewBox: set.viewBox,
          strokeWidth: set.strokeWidth ?? 0,
        },
      );
      for (const [id, nonzero, evenodd] of batch) results.set(id, [nonzero, evenodd]);
    }
  }
  await browser.close();
  return results;
}
