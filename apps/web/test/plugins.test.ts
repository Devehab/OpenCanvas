import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { compareVersions, PluginError, parseManifest } from '@/lib/plugins/manifest';
import { readPluginPackage } from '@/lib/plugins/package';

const base = {
  manifestVersion: 1,
  id: 'com.example.effects',
  name: 'Effects',
  version: '1.2.0',
  description: 'Image effects',
  author: 'Example',
  main: 'main.js',
  permissions: ['images:read', 'images:write'],
  contributes: { commands: [{ id: 'grayscale', title: 'Grayscale', context: 'image' }] },
};

const pack = (files: Record<string, string | Uint8Array>) =>
  zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])),
  );

const issuesOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof PluginError) return [error.message, ...error.issues].join('\n');
    throw error;
  }
  throw new Error('expected a PluginError');
};

describe('plugin manifest', () => {
  it('accepts a valid manifest and fills defaults', () => {
    const m = parseManifest(base);
    expect(m.contributes.iconPacks).toEqual([]);
    expect(m.network).toEqual([]);
    expect(m.contributes.commands[0]).toMatchObject({ id: 'grayscale', context: 'image' });
  });

  it('lists every problem', () => {
    const text = issuesOf(() =>
      parseManifest({ ...base, id: 'Not An Id', version: 'one', permissions: ['root'], extra: true }),
    );
    expect(text).toContain('id:');
    expect(text).toContain('version:');
    expect(text).toContain('permissions.0');
    expect(text).toMatch(/extra|Unrecognized/);
  });

  it('requires a script for commands and the network permission for hosts', () => {
    const { main: _main, ...noMain } = base;
    expect(issuesOf(() => parseManifest(noMain))).toContain('need a "main" script');
    expect(issuesOf(() => parseManifest({ ...base, network: ['api.example.com'] }))).toContain('"network"');
  });

  it('compares versions', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '2.0.0-beta.1')).toBe(1);
  });
});

describe('plugin package', () => {
  const manifest = JSON.stringify(base);

  it('reads a valid package', () => {
    const pkg = readPluginPackage(pack({ 'opencanvas-plugin.json': manifest, 'main.js': 'export {}' }));
    expect(pkg.manifest.id).toBe('com.example.effects');
    expect([...pkg.files.keys()].sort()).toEqual(['main.js', 'opencanvas-plugin.json']);
  });

  it('accepts a package wrapped in one folder (zipping a folder)', () => {
    const pkg = readPluginPackage(
      pack({ 'effects/opencanvas-plugin.json': manifest, 'effects/main.js': '', '__MACOSX/._main.js': '' }),
    );
    expect([...pkg.files.keys()].sort()).toEqual(['main.js', 'opencanvas-plugin.json']);
  });

  it('refuses unsafe paths, unknown file types and missing files', () => {
    expect(
      issuesOf(() => readPluginPackage(pack({ 'opencanvas-plugin.json': manifest, '../evil.js': '' }))),
    ).toContain('Unsafe file path');
    expect(
      issuesOf(() =>
        readPluginPackage(pack({ 'opencanvas-plugin.json': manifest, 'main.js': '', 'run.exe': '' })),
      ),
    ).toContain('File type not allowed');
    expect(issuesOf(() => readPluginPackage(pack({ 'opencanvas-plugin.json': manifest })))).toContain(
      'main: main.js is missing',
    );
    expect(issuesOf(() => readPluginPackage(strToU8('not a zip')))).toContain('expected a ZIP');
    expect(
      issuesOf(() =>
        readPluginPackage(
          pack({
            'opencanvas-plugin.json': JSON.stringify({
              ...base,
              contributes: { fonts: [{ family: 'X', path: 'x.woff2' }] },
              main: undefined,
            }),
            'x.woff2': 'not a font',
          }),
        ),
      ),
    ).toContain('x.woff2 is not a font file');
  });
});

describe('example plugins', () => {
  const root = fileURLToPath(new URL('../../../plugins/examples/', import.meta.url));
  const folders = readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory());

  it.each(folders)('%s passes the install checks', (folder) => {
    const files: Record<string, Uint8Array> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else
          files[relative(join(root, folder), full).split(sep).join('/')] = new Uint8Array(readFileSync(full));
      }
    };
    walk(join(root, folder));
    const pkg = readPluginPackage(zipSync(files));
    expect(pkg.manifest.id).toMatch(/^org\.opencanvas\./);
  });
});
