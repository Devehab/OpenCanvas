'use client';

import { useCallback, useEffect, useState } from 'react';
import { onChannelMessage } from '@/lib/channel';
import { type FolderRecord, listFolders } from '@/lib/storage/folders';

/** Project folders, refreshed when any tab changes them. */
export function useFolders() {
  const [folders, setFolders] = useState<FolderRecord[] | null>(null);
  const refresh = useCallback(async () => {
    setFolders(await listFolders());
  }, []);
  useEffect(() => {
    void refresh();
    return onChannelMessage((m) => {
      if (m.type === 'folders-changed' || m.type === 'designs-changed' || m.type === 'uploads-changed')
        void refresh();
    });
  }, [refresh]);
  return { folders, refresh };
}
