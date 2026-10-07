'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { broadcast, onChannelMessage, TAB_ID } from '@/lib/channel';
import { getAssetBlob } from '@/lib/storage/assets';
import { type BrandRecord, listBrands } from '@/lib/storage/brands';
import { useLatestCall } from './use-latest-call';

export const brandsChanged = () => broadcast({ type: 'brands-changed', tabId: TAB_ID }, { self: true });

/** All brand kits, refreshed when any tab changes them. */
export function useBrands() {
  const [brands, setBrands] = useState<BrandRecord[] | null>(null);
  const begin = useLatestCall();
  const refresh = useCallback(async () => {
    const isLatest = begin();
    const list = await listBrands();
    if (isLatest()) setBrands(list);
  }, [begin]);
  useEffect(() => {
    void refresh();
    return onChannelMessage((m) => {
      if (m.type === 'brands-changed') void refresh();
    });
  }, [refresh]);
  return { brands, refresh };
}

/** Object URLs for stored images by content hash (revoked when no longer needed). */
export function useAssetUrls(hashes: readonly string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const cache = useRef(new Map<string, string>());
  const key = hashes.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the hash list
  useEffect(() => {
    let alive = true;
    const wanted = new Set(hashes);
    for (const [hash, url] of cache.current)
      if (!wanted.has(hash)) {
        URL.revokeObjectURL(url);
        cache.current.delete(hash);
      }
    void Promise.all(
      [...wanted].map(async (hash) => {
        if (cache.current.has(hash)) return;
        const blob = await getAssetBlob(hash);
        if (blob && alive) cache.current.set(hash, URL.createObjectURL(blob));
      }),
    ).then(() => alive && setUrls(Object.fromEntries(cache.current)));
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(() => {
    const c = cache.current;
    return () => {
      for (const url of c.values()) URL.revokeObjectURL(url);
      c.clear();
    };
  }, []);
  return urls;
}
