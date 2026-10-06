'use client';

import { useEffect, useState } from 'react';
import { onChannelMessage } from '@/lib/channel';
import { type IconPackRecord, listIconPacks } from '@/lib/storage/icon-packs';
import { disabledPluginIds } from '@/lib/storage/plugins';

/**
 * Icon packs: the person's own and those of plugins. With `usable`, packs of
 * plugins that are turned off are left out.
 */
export function useIconPacks(options: { usable?: boolean } = {}): IconPackRecord[] | null {
  const [packs, setPacks] = useState<IconPackRecord[] | null>(null);
  const usable = options.usable ?? false;
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [all, disabled] = await Promise.all([listIconPacks(), disabledPluginIds()]);
      if (!alive) return;
      setPacks(usable ? all.filter((p) => !p.pluginId || !disabled.has(p.pluginId)) : all);
    };
    void refresh();
    const off = onChannelMessage((m) => {
      if (m.type === 'icons-changed' || m.type === 'plugins-changed') void refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [usable]);
  return packs;
}
