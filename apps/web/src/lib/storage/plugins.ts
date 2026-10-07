/**
 * Installed plugins. Installing happens in two steps: `inspectPlugin` checks a
 * package and shows what it asks for; `installPlugin` stores it (and its icon
 * packs and fonts) once the person agrees. Disabling keeps everything but
 * turns the plugin off; uninstalling removes it and what it added.
 */
import { createRandomIdGenerator } from '@opencanvas/core';
import { broadcast, TAB_ID } from '../channel';
import { FONT_MIME, sniffFontFormat } from '../font-files';
import { compareVersions, type PluginManifest } from '../plugins/manifest';
import { iconPackFiles, type PluginPackage, readPluginPackage } from '../plugins/package';
import { svgToIcon } from '../svg-icon';
import { type CustomIcon, getDB, type PluginRecord, updateRecordWithFiles } from './db';
import { iconsChanged } from './icon-packs';

export interface InstalledPlugin extends Omit<PluginRecord, 'manifest'> {
  manifest: PluginManifest;
}

const newId = createRandomIdGenerator();
export const pluginsChanged = () => broadcast({ type: 'plugins-changed', tabId: TAB_ID }, { self: true });
const fontsChanged = () => broadcast({ type: 'fonts-changed', tabId: TAB_ID }, { self: true });

export async function listPlugins(): Promise<InstalledPlugin[]> {
  const db = await getDB();
  const all = (await db.getAll('plugins')) as InstalledPlugin[];
  return all.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export async function getPlugin(id: string): Promise<InstalledPlugin | undefined> {
  const db = await getDB();
  return (await db.get('plugins', id)) as InstalledPlugin | undefined;
}

export interface PluginInspection {
  pkg: PluginPackage;
  /** The installed version, when this is an update. */
  installed: InstalledPlugin | null;
  /** -1 older than installed, 0 same, 1 newer (or new). */
  versionChange: -1 | 0 | 1;
}

export async function inspectPlugin(file: Blob): Promise<PluginInspection> {
  const pkg = readPluginPackage(new Uint8Array(await file.arrayBuffer()));
  const installed = (await getPlugin(pkg.manifest.id)) ?? null;
  const versionChange = installed
    ? (compareVersions(pkg.manifest.version, installed.manifest.version) as -1 | 0 | 1)
    : 1;
  return { pkg, installed, versionChange };
}

const MIME: Record<string, string> = {
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  css: 'text/css',
  html: 'text/html',
  md: 'text/markdown',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  wasm: 'application/wasm',
};

/** Installs (or updates) a checked package, with its icon packs and fonts. Enabled right away. */
export async function installPlugin(pkg: PluginPackage): Promise<InstalledPlugin> {
  const { manifest } = pkg;
  const files: Record<string, Blob> = {};
  for (const [path, data] of pkg.files) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const font = sniffFontFormat(data.subarray(0, 4));
    files[path] = new Blob([data as Uint8Array<ArrayBuffer>], {
      type: font ? FONT_MIME[font] : (MIME[ext] ?? 'application/octet-stream'),
    });
  }
  const db = await getDB();
  const existing = await db.get('plugins', manifest.id);
  const now = Date.now();
  const record: InstalledPlugin = {
    id: manifest.id,
    manifest,
    files,
    enabled: true,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  };
  await removeContributions(manifest.id);
  await db.put('plugins', record);

  for (const pack of manifest.contributes.iconPacks) {
    const icons: CustomIcon[] = [];
    for (const { name, svg } of iconPackFiles(pkg, pack.path)) {
      const converted = svgToIcon(svg, name);
      if (converted.ok) icons.push({ ...converted.icon, id: `${pack.id}/${name}` });
    }
    await db.put('iconPacks', {
      id: `${manifest.id}/${pack.id}`,
      name: pack.name,
      pluginId: manifest.id,
      icons,
      createdAt: now,
    });
  }
  for (const font of manifest.contributes.fonts) {
    const data = pkg.files.get(font.path)!;
    const format = sniffFontFormat(data.subarray(0, 4))!;
    await db.put('fonts', {
      id: newId('font'),
      family: font.family,
      weight: font.weight,
      style: font.style,
      format,
      fileName: font.path.split('/').pop() ?? font.path,
      size: data.length,
      data: new Blob([data as Uint8Array<ArrayBuffer>], { type: FONT_MIME[format] }),
      createdAt: now,
      pluginId: manifest.id,
    });
  }
  pluginsChanged();
  iconsChanged();
  fontsChanged();
  return record;
}

async function removeContributions(pluginId: string): Promise<void> {
  const db = await getDB();
  for (const pack of await db.getAll('iconPacks'))
    if (pack.pluginId === pluginId) await db.delete('iconPacks', pack.id);
  for (const font of await db.getAll('fonts'))
    if (font.pluginId === pluginId) await db.delete('fonts', font.id);
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  await updateRecordWithFiles('plugins', id, (plugin) => ({ ...plugin, enabled, updatedAt: Date.now() }));
  pluginsChanged();
  iconsChanged();
  fontsChanged();
}

export async function uninstallPlugin(id: string): Promise<void> {
  const db = await getDB();
  await removeContributions(id);
  await db.delete('plugins', id);
  pluginsChanged();
  iconsChanged();
  fontsChanged();
}

/** Ids of plugins that are turned off (their icons and fonts are hidden). */
export async function disabledPluginIds(): Promise<Set<string>> {
  const db = await getDB();
  return new Set((await db.getAll('plugins')).filter((p) => !p.enabled).map((p) => p.id));
}
