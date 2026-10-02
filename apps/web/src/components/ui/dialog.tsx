'use client';

import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]" />
        <D.Content
          className={cn(
            'fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,30rem)] -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ltr:-translate-x-1/2 rtl:translate-x-1/2',
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-lg font-semibold text-slate-900">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-slate-500">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label={t('common.close')}
            >
              <X className="size-5" />
            </D.Close>
          </div>
          {children}
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
