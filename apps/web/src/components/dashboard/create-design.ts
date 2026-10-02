'use client';

import type { DesignFormat } from '@opencanvas/core';
import { broadcast, TAB_ID } from '@/lib/channel';
import { createDesign } from '@/lib/storage/designs';

export async function createDesignAndOpen(
  router: { push: (href: string) => void },
  options: { title: string; width: number; height: number; format?: DesignFormat | null },
): Promise<void> {
  const design = await createDesign(options);
  broadcast({ type: 'designs-changed', tabId: TAB_ID });
  router.push(`/design/${design.id}`);
}
