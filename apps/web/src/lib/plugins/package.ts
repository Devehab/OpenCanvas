/**
 * Reading a plugin package (.ocplugin, a ZIP file). Everything is checked
 * before installation: size and file-count limits, safe paths, allowed file
 * types, a valid manifest, and that every file the manifest names exists.
 */
import { unzipSync } from 'fflate';
import { sniffFontFormat } from '../font-files';
import { MANIFEST_FILE, PluginError, type PluginManifest, parseManifest } from './manifest';

export const PLUGIN_EXTENSION = '.ocplugin';
export const PLUGIN_ACCEPT = '.ocplugin,.zip,application/zip';

export const PLUGIN_LIMITS = {
  maxPackageBytes: 25 * 1024 * 1024,
  maxFiles: 400,
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
};

const ALLOWED_EXTENSIONS = new Set([
  'js',
  'mjs',
  'json',
  'css',
  'html',
  'md',
  'txt',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'woff2',
  'woff',
  'ttf',
  'otf',
  'wasm',
]);

/** Files people's archivers add that are never part of a plugin. */
const IGNORED = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\.git\/)/;

export interface PluginPackage {
  manifest: PluginManifest;
  /** Files by path inside the package (the manifest included). */
  files: Map<string, Uint8Array>;
}

const extensionOf = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 200 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((part) => part === '..' || part === '.')
  );
}

export function readPluginPackage(bytes: Uint8Array): PluginPackage {
  if (bytes.length > PLUGIN_LIMITS.maxPackageBytes)
    throw new PluginError('The plugin file is larger than 25 MB');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new PluginError('This is not a plugin file (expected a ZIP)');
  let count = 0;
  let total = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, {
      filter(file) {
        if (file.name.endsWith('/') || IGNORED.test(file.name)) return false;
        if (++count > PLUGIN_LIMITS.maxFiles) throw new PluginError('The plugin has too many files');
        if (!safePath(file.name)) throw new PluginError(`Unsafe file path: ${file.name}`);
        if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
          throw new PluginError(`File type not allowed in plugins: ${file.name}`);
        }
        if (file.originalSize > PLUGIN_LIMITS.maxFileBytes)
          throw new PluginError(`${file.name} is too large`);
        total += file.originalSize;
        if (total > PLUGIN_LIMITS.maxTotalBytes) throw new PluginError('The plugin content is too large');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PluginError) throw error;
    throw new PluginError(`The plugin file is damaged: ${(error as Error).message}`);
  }

  // Zipping a folder often wraps everything in it: accept one top-level folder.
  let prefix = '';
  if (!(MANIFEST_FILE in raw)) {
    const nested = Object.keys(raw).filter(
      (p) => p.endsWith(`/${MANIFEST_FILE}`) && p.split('/').length === 2,
    );
    if (nested.length === 1) prefix = nested[0]!.slice(0, -MANIFEST_FILE.length);
  }
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(raw)) {
    if (prefix && !path.startsWith(prefix)) continue;
    files.set(path.slice(prefix.length), data);
  }

  const manifestBytes = files.get(MANIFEST_FILE);
  if (!manifestBytes) throw new PluginError(`The plugin has no ${MANIFEST_FILE}`);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new PluginError(`${MANIFEST_FILE} is not valid JSON`);
  }
  const manifest = parseManifest(json);
  checkReferences(manifest, files);
  return { manifest, files };
}

function checkReferences(m: PluginManifest, files: Map<string, Uint8Array>): void {
  const problems: string[] = [];
  const need = (path: string | undefined, what: string, extensions: string[]) => {
    if (!path) return;
    if (!files.has(path)) problems.push(`${what}: ${path} is missing`);
    else if (!extensions.includes(extensionOf(path)))
      problems.push(`${what}: ${path} must be ${extensions.join(' or ')}`);
  };
  need(m.main, 'main', ['js', 'mjs']);
  need(m.icon, 'icon', ['svg', 'png']);
  for (const pack of m.contributes.iconPacks) {
    const dir = pack.path.endsWith('/') ? pack.path : `${pack.path}/`;
    const svgs = [...files.keys()].filter((p) => p.startsWith(dir) && p.endsWith('.svg'));
    if (svgs.length === 0) problems.push(`iconPacks.${pack.id}: no .svg files in ${dir}`);
  }
  for (const font of m.contributes.fonts) {
    const data = files.get(font.path);
    if (!data) problems.push(`fonts: ${font.path} is missing`);
    else if (!sniffFontFormat(data.subarray(0, 4))) problems.push(`fonts: ${font.path} is not a font file`);
  }
  if (problems.length) throw new PluginError('The plugin package is incomplete', problems);
}

/** The SVG files of an icon pack, by file name. */
export function iconPackFiles(pkg: PluginPackage, path: string): { name: string; svg: string }[] {
  const dir = path.endsWith('/') ? path : `${path}/`;
  const decoder = new TextDecoder();
  return [...pkg.files.entries()]
    .filter(([p]) => p.startsWith(dir) && p.endsWith('.svg'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, data]) => ({ name: p.slice(dir.length, -4), svg: decoder.decode(data) }));
}
