'use client';

import { useCallback, useEffect, useState } from 'react';
import { onChannelMessage } from '@/lib/channel';
import { type DesignSummary, listDesigns } from '@/lib/storage/designs';
import { getThumbnail } from '@/lib/storage/thumbnails';

export function useDesigns(options: { trashed?: boolean } = {}) {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trashed = options.trashed ?? false;
  const refresh = useCallback(async () => {
    try {
      setDesigns(await listDesigns({ trashed }));
    } catch (e) {
      setError(String(e));
      setDesigns([]);
    }
  }, [trashed]);
  useEffect(() => {
    void refresh();
    const off = onChannelMessage(() => void refresh());
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  return { designs, error, refresh };
}

/** Object URL for a design's thumbnail (revoked on change/unmount). */
export function useThumbnail(designId: string, version: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is a cache-busting key that refetches the thumbnail
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void getThumbnail(designId).then((blob) => {
      if (cancelled || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [designId, version]);
  return url;
}
