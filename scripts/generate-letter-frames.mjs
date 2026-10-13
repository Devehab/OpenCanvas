#!/usr/bin/env node
/**
 * Generates the outlines of the Elements panel's letter and number frames
 * (A–Z, 0–9 and the Arabic alphabet) from Baloo Bhaijaan 2 ExtraBold, a round,
 * heavy font with Latin and Arabic letters (SIL Open Font License 1.1).
 *
 *   node scripts/generate-letter-frames.mjs
 *
 * Output: apps/web/src/lib/element-catalog/letters.json, read by the lazily
 * loaded element catalog. Each letter is one SVG path (holes and dots
 * included) at a height of about 100 units, and its size. The font's license
 * is in apps/web/src/lib/element-catalog/LICENSES.md.
 *
 * The font comes from the app's own @fontsource dependency; opentype.js (to
 * read it) is fetched with `npm pack` into a temporary directory, so it is not
 * a dependency of the app.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/src/lib/element-catalog/letters.json');
const OPENTYPE = 'opentype.js@1.3.4';
const FONT = { name: 'Baloo Bhaijaan 2 ExtraBold', package: '@fontsource/baloo-bhaijaan-2', weight: 800 };

const GROUPS = {
  latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  // The 28 letters in alphabetical order, then ة, ء and لا.
  arabic: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
};
const EXTRA_ARABIC = ['ة', 'ء'];

function fetchPackage(spec, dir) {
  const file = execFileSync('npm', ['pack', spec, '--silent'], { cwd: dir, encoding: 'utf8' })
    .trim()
    .split('\n')
    .pop();
  const target = join(dir, spec.replace(/[@/]/g, '_'));
  mkdirSync(target);
  execFileSync('tar', ['-xzf', join(dir, file), '-C', target]);
  return join(target, 'package');
}

/** The font's directory, resolved like the app resolves it. */
function fontFiles() {
  const require = createRequire(join(ROOT, 'apps/web/package.json'));
  return join(dirname(require.resolve(`${FONT.package}/package.json`)), 'files');
}

function loadFont(opentype, subset) {
  const dir = fontFiles();
  const name = readdirSync(dir).find((f) => f.endsWith(`-${subset}-${FONT.weight}-normal.woff`));
  if (!name) throw new Error(`No ${subset} ${FONT.weight} WOFF file in ${dir}`);
  const bytes = readFileSync(join(dir, name));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const round = (n) => Math.round(n * 10) / 10;

/** One glyph as compact path data at a size of 100, moved to the origin. */
function outline(font, text) {
  const path = font.getPath(text, 0, 0, 100);
  const box = path.getBoundingBox();
  if (!(box.x2 > box.x1 && box.y2 > box.y1)) throw new Error(`"${text}" has no outline`);
  const X = (x) => round(x - box.x1);
  const Y = (y) => round(y - box.y1);
  let d = '';
  let at = '';
  for (const c of path.commands) {
    const end = c.type === 'Z' ? '' : `${X(c.x)} ${Y(c.y)}`;
    // The font's outlines repeat points: a line to where the pen already is draws nothing.
    if (c.type === 'L' && end === at) continue;
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${end}`;
    else if (c.type === 'Q') d += `Q${X(c.x1)} ${Y(c.y1)} ${end}`;
    else if (c.type === 'C') d += `C${X(c.x1)} ${Y(c.y1)} ${X(c.x2)} ${Y(c.y2)} ${end}`;
    else if (c.type === 'Z') d += 'Z';
    at = end;
  }
  // Compact numbers: "0.5" → ".5", "-0.5" → "-.5", and no space before a minus.
  d = d.replace(/(^|[^\d])0\./g, '$1.').replace(/ -/g, '-');
  return [text, d, round(box.x2 - box.x1), round(box.y2 - box.y1)];
}

const work = mkdtempSync(join(tmpdir(), 'oc-letters-'));
try {
  const require = createRequire(import.meta.url);
  const opentype = require(join(fetchPackage(OPENTYPE, work), 'dist/opentype.js'));
  const latin = loadFont(opentype, 'latin');
  const arabic = loadFont(opentype, 'arabic');
  const out = {
    font: FONT.name,
    license: 'OFL-1.1',
    source: 'https://github.com/EkType/Baloo2',
    latin: [...GROUPS.latin].map((c) => outline(latin, c)),
    digits: [...GROUPS.digits].map((c) => outline(latin, c)),
    // Isolated forms: each letter on its own.
    arabic: [...GROUPS.arabic, ...EXTRA_ARABIC].map((c) => outline(arabic, c)),
  };
  const json = `${JSON.stringify(out).replace(/\],\[/g, '],\n[')}\n`;
  writeFileSync(OUT, json);
  const count = out.latin.length + out.digits.length + out.arabic.length;
  console.log(`${count} letters → ${OUT.replace(`${ROOT}/`, '')} (${(json.length / 1024).toFixed(1)} KB)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
