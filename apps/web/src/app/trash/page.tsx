'use client';

import { useState } from 'react';
import { DesignGrid } from '@/components/dashboard/design-card';
import { DashboardShell } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useDesigns } from '@/hooks/use-designs';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { deleteDesignForever } from '@/lib/storage/designs';

export default function TrashPage() {
  const { t } = useI18n();
  // Designs and templates both come here when deleted.
  const { designs, refresh } = useDesigns({ trashed: true, kind: 'any' });
  const [confirm, setConfirm] = useState(false);
  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('nav.trash')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('design.trashHint')}</p>
          </div>
          {designs && designs.length > 0 ? (
            <Button variant="danger" onClick={() => setConfirm(true)}>
              {t('design.emptyTrash')}
            </Button>
          ) : null}
        </div>
        {designs === null ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : designs.length === 0 ? (
          <p className="text-slate-600">{t('design.trashEmpty')}</p>
        ) : (
          <DesignGrid designs={designs} trashed onChange={refresh} />
        )}
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('design.emptyTrash')}
        description={t('design.confirmEmptyTrash')}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                for (const d of designs ?? []) await deleteDesignForever(d.id);
                setConfirm(false);
                broadcast({ type: 'designs-changed', tabId: TAB_ID });
                void refresh();
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </DashboardShell>
  );
}
