#!/usr/bin/env node
/**
 * Packs a plugin folder into an installable .ocplugin file (a ZIP).
 *
 *   pnpm plugin:pack plugins/examples/image-effects [out-dir]
 *
 * The folder must contain opencanvas-plugin.json; the full checks run when
 * the plugin is installed (Settings → Plugins), and the same checks are
 * documented in docs/plugins.md.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { zipSync } = require('fflate');

const [dirArg, outArg = 'dist/plugins'] = process.argv.slice(2);
if (!dirArg) {
  console.error('Usage: pnpm plugin:pack <plugin-folder> [out-dir]');
  process.exit(1);
}
const dir = resolve(dirArg);
const manifestPath = join(dir, 'opencanvas-plugin.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${manifestPath}: ${error.message}`);
  process.exit(1);
}
for (const field of ['id', 'name', 'version', 'description', 'author']) {
  if (typeof manifest[field] !== 'string' || !manifest[field]) {
    console.error(`opencanvas-plugin.json: "${field}" is required`);
    process.exit(1);
  }
}

const IGNORE = new Set(['.DS_Store', 'Thumbs.db', 'node_modules', '.git', 'README.md']);
const files = {};
const walk = (folder) => {
  for (const name of readdirSync(folder)) {
    if (IGNORE.has(name) || name.endsWith('.ocplugin')) continue;
    const full = join(folder, name);
    if (statSync(full).isDirectory()) walk(full);
    else files[relative(dir, full).split(sep).join('/')] = new Uint8Array(readFileSync(full));
  }
};
walk(dir);
for (const ref of [manifest.main, manifest.icon].filter(Boolean)) {
  if (!files[ref]) {
    console.error(`opencanvas-plugin.json refers to ${ref}, which is missing`);
    process.exit(1);
  }
}

const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const target = join(out, `${manifest.id}-${manifest.version}.ocplugin`);
writeFileSync(target, zipSync(files, { level: 9 }));
console.log(
  `${relative(process.cwd(), target)}  (${Object.keys(files).length} files, ${Math.round(statSync(target).size / 1024)} KB)`,
);
