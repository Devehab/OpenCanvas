'use client';

import { useCallback, useEffect, useState } from 'react';
import { onChannelMessage } from '@/lib/channel';
import { type FolderRecord, listFolders } from '@/lib/storage/folders';
import { useLatestCall } from './use-latest-call';

/** Project folders, refreshed when any tab changes them. */
export function useFolders() {
  const [folders, setFolders] = useState<FolderRecord[] | null>(null);
  const begin = useLatestCall();
  const refresh = useCallback(async () => {
    const isLatest = begin();
    const list = await listFolders();
    if (isLatest()) setFolders(list);
  }, [begin]);
  useEffect(() => {
    void refresh();
    return onChannelMessage((m) => {
      if (m.type === 'folders-changed' || m.type === 'designs-changed' || m.type === 'uploads-changed')
        void refresh();
    });
  }, [refresh]);
  return { folders, refresh };
}
