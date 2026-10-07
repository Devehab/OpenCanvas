'use client';

import { useCallback, useEffect, useState } from 'react';
import { onChannelMessage } from '@/lib/channel';
import { type DesignSummary, listDesigns } from '@/lib/storage/designs';
import { getThumbnailRecord } from '@/lib/storage/thumbnails';
import { ensureThumbnail } from '@/lib/thumbnail-render';
import { useLatestCall } from './use-latest-call';

export function useDesigns(options: { trashed?: boolean } = {}) {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trashed = options.trashed ?? false;
  const begin = useLatestCall();
  const refresh = useCallback(async () => {
    const isLatest = begin();
    try {
      const list = await listDesigns({ trashed });
      if (isLatest()) setDesigns(list);
    } catch (e) {
      if (!isLatest()) return;
      setError(String(e));
      setDesigns([]);
    }
  }, [trashed, begin]);
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

/**
 * Object URL for a design's preview (revoked on change/unmount). Missing or
 * outdated previews are regenerated in the background.
 */
export function useThumbnail(designId: string, revision: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      onChannelMessage((m) => {
        if (m.type === 'thumbnail-updated' && m.designId === designId) setVersion((v) => v + 1);
      }),
    [designId],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` refetches after a preview was written
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void getThumbnailRecord(designId).then((record) => {
      if (cancelled) return;
      if (!record || (record.revision ?? 0) < revision) ensureThumbnail(designId, revision);
      if (!record) return;
      created = URL.createObjectURL(record.blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [designId, revision, version]);
  return url;
}
