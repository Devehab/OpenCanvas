'use client';

import { useCallback, useEffect, useState } from 'react';
import { onChannelMessage } from '@/lib/channel';
import { type FolderKind, type FolderRecord, listFolders } from '@/lib/storage/folders';
import { useLatestCall } from './use-latest-call';

/** Project folders (or template folders), refreshed when any tab changes them. */
export function useFolders(kind: FolderKind = 'project') {
  const [folders, setFolders] = useState<FolderRecord[] | null>(null);
  const begin = useLatestCall();
  const refresh = useCallback(async () => {
    const isLatest = begin();
    const list = await listFolders(kind);
    if (isLatest()) setFolders(list);
  }, [kind, begin]);
  useEffect(() => {
    void refresh();
    return onChannelMessage((m) => {
      if (m.type === 'folders-changed' || m.type === 'designs-changed' || m.type === 'uploads-changed')
        void refresh();
    });
  }, [refresh]);
  return { folders, refresh };
}
