'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/utils';

/** Inspector section with a heading; optionally collapsible. */
export function Section({
  title,
  children,
  action,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-slate-100 px-4 py-3" aria-labelledby={id}>
      <div className="mb-2 flex items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', !open && '-rotate-90 rtl:rotate-90')}
            />
            <span id={id}>{title}</span>
          </button>
        ) : (
          <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </h3>
        )}
        {action}
      </div>
      {open ? <div className="space-y-2.5">{children}</div> : null}
    </section>
  );
}
