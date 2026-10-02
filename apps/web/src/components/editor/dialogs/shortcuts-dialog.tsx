'use client';

import { SHORTCUTS } from '@opencanvas/editor';
import { Dialog } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { shortcut } from '@/lib/utils';

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.shortcutsDialog.title')}
      className="w-[min(92vw,36rem)]"
    >
      <dl className="divide-y divide-slate-100 text-sm">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-slate-700">{s.action}</dt>
            <dd>
              <kbd
                className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700"
                dir="ltr"
              >
                {shortcut(s.keys)}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
