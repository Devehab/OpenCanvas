'use client';

import { Tooltip } from 'radix-ui';
import type { ReactElement } from 'react';
import { shortcut as formatShortcut } from '@/lib/utils';

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>;
}

export function Tip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
        >
          {label}
          {shortcut ? <span className="ms-2 text-slate-400">{formatShortcut(shortcut)}</span> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
