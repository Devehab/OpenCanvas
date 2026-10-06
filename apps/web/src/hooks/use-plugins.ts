'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { onChannelMessage } from '@/lib/channel';
import type { PluginHost } from '@/lib/plugins/host';
import { type InstalledPlugin, listPlugins } from '@/lib/storage/plugins';

/** Installed plugins, refreshed when any tab changes them. */
export function usePlugins(): InstalledPlugin[] | null {
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  useEffect(() => {
    const refresh = () => void listPlugins().then(setPlugins);
    refresh();
    return onChannelMessage((m) => {
      if (m.type === 'plugins-changed') refresh();
    });
  }, []);
  return plugins;
}

/** Re-renders when the host's plugins or running state change. */
export function usePluginHostVersion(host: PluginHost | null): number {
  return useSyncExternalStore(
    (listener) => host?.subscribe(listener) ?? (() => {}),
    () => host?.version ?? 0,
    () => 0,
  );
}

/** Object URL for a plugin's icon file, if it has one. */
export function usePluginIcon(plugin: InstalledPlugin): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const file = plugin.manifest.icon ? plugin.files[plugin.manifest.icon] : undefined;
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return file ? url : null;
}
