/**
 * Recently used elements (per browser, like Canva's "Recently used" row).
 * A convenience only: storage may be unavailable, and that is fine.
 */
import type { AnyNodeProps } from '@opencanvas/core';
import { useCallback, useEffect, useState } from 'react';
import type { Label } from './element-library';

export interface RecentElement {
  id: string;
  label: Label;
  props: AnyNodeProps;
  /** Icons keep their set's style for the tile. */
  kind: 'element' | 'icon';
}

const KEY = 'opencanvas.recentElements';
const MAX = 12;
const EVENT = 'opencanvas:recent-elements';

function read(): RecentElement[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (r): r is RecentElement => typeof r?.id === 'string' && typeof r?.props?.type === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

export function useRecentElements() {
  const [recent, setRecent] = useState<RecentElement[]>([]);
  useEffect(() => {
    setRecent(read());
    const sync = () => setRecent(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const remember = useCallback((element: RecentElement) => {
    const next = [element, ...read().filter((r) => r.id !== element.id)].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage full or blocked: keep the in-memory list
    }
    setRecent(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { recent, remember };
}
