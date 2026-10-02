'use client';

import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { directionOf, I18nProvider, type Locale } from '@/i18n';

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nProvider locale={locale}>
      <Direction.Provider dir={directionOf(locale)}>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </Direction.Provider>
    </I18nProvider>
  );
}
