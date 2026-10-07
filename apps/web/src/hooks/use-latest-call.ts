'use client';

import { useCallback, useRef } from 'react';

/**
 * For refreshes that can overlap (every save in any tab asks for one): call
 * `begin()` when one starts, and apply its result only while the returned
 * `isLatest()` holds. Otherwise an older refresh that read the data before a
 * change (a delete, say) could finish last and bring the old data back.
 */
export function useLatestCall(): () => () => boolean {
  const latest = useRef(0);
  return useCallback(() => {
    const seq = ++latest.current;
    return () => seq === latest.current;
  }, []);
}
