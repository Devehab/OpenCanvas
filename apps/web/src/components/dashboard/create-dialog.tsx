'use client';

import { Dialog } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { FormatGrid } from './format-grid';

export function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('home.title')} className="w-[min(94vw,64rem)]">
      <FormatGrid onCreated={() => onOpenChange(false)} />
    </Dialog>
  );
}
