'use client';

import { Copy, Download, ExternalLink, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useThumbnail } from '@/hooks/use-designs';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { downloadDesignPackage } from '@/lib/package-io';
import {
  type DesignSummary,
  deleteDesignForever,
  duplicateDesign,
  getDesign,
  renameDesign,
  setTrashed,
} from '@/lib/storage/designs';

export function DesignCard({
  design,
  trashed,
  onChange,
}: {
  design: DesignSummary;
  trashed?: boolean;
  onChange: () => void;
}) {
  const { t, formatRelative } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const thumbnail = useThumbnail(design.id, design.revision);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(design.title);
  const changed = () => {
    broadcast({ type: 'designs-changed', tabId: TAB_ID });
    onChange();
  };
  const ratio = design.width / design.height;
  const href = `/design/${design.id}`;

  return (
    <li className="group relative" data-testid="design-card">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition group-hover:border-brand-300 group-hover:shadow-md">
        {trashed ? null : (
          <Link
            href={href}
            className="absolute inset-0 z-10"
            aria-label={`${t('common.open')} ${design.title}`}
          />
        )}
        {thumbnail ? (
          // biome-ignore lint/performance/noImgElement: local blob URL thumbnail
          <img
            src={thumbnail}
            alt=""
            className="max-h-[85%] max-w-[85%] rounded-sm object-contain shadow-sm"
          />
        ) : (
          <span
            className="rounded-sm bg-white shadow-sm"
            style={
              ratio >= 1
                ? { width: '70%', aspectRatio: String(ratio) }
                : { height: '75%', aspectRatio: String(ratio) }
            }
          />
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" data-testid="design-title">
            {design.title}
          </p>
          <p className="text-xs text-slate-500">
            {t('design.edited', { time: formatRelative(design.updatedAt) })}
          </p>
        </div>
        <Menu>
          <MenuTrigger
            className="z-20 rounded-md p-1 text-slate-500 hover:bg-slate-200 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            aria-label={t('design.actions')}
            data-testid="design-menu"
          >
            <MoreHorizontal className="size-5" />
          </MenuTrigger>
          <MenuContent align="end">
            {trashed ? (
              <>
                <MenuItem
                  icon={<RotateCcw className="size-4" />}
                  onSelect={async () => {
                    await setTrashed(design.id, false);
                    changed();
                  }}
                >
                  {t('design.restore')}
                </MenuItem>
                <MenuItem icon={<Trash2 className="size-4" />} danger onSelect={() => setConfirming(true)}>
                  {t('design.deleteForever')}
                </MenuItem>
              </>
            ) : (
              <>
                <MenuItem icon={<ExternalLink className="size-4" />} onSelect={() => router.push(href)}>
                  {t('common.open')}
                </MenuItem>
                <MenuItem icon={<Pencil className="size-4" />} onSelect={() => setRenaming(true)}>
                  {t('common.rename')}
                </MenuItem>
                <MenuItem
                  icon={<Copy className="size-4" />}
                  onSelect={async () => {
                    await duplicateDesign(design.id, t('design.copyOf', { title: design.title }));
                    changed();
                  }}
                >
                  {t('common.duplicate')}
                </MenuItem>
                <MenuItem
                  icon={<Download className="size-4" />}
                  onSelect={async () => {
                    const full = await getDesign(design.id);
                    if (full) await downloadDesignPackage(full);
                  }}
                >
                  {t('design.download')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Trash2 className="size-4" />}
                  danger
                  testId="design-trash"
                  onSelect={async () => {
                    await setTrashed(design.id, true);
                    changed();
                  }}
                >
                  {t('design.moveToTrash')}
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      <Dialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t('common.rename')}
        footer={
          <>
            <Button onClick={() => setRenaming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await renameDesign(design.id, title.trim() || t('design.untitled'));
                setRenaming(false);
                changed();
              }}
            >
              {t('common.apply')}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">{t('design.renamePrompt')}</span>
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 outline-none focus:border-brand-400"
            value={title}
            maxLength={256}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </Dialog>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('design.deleteForever')}
        description={t('design.confirmDeleteForever', { title: design.title })}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteDesignForever(design.id);
                setConfirming(false);
                changed();
                toast(t('design.deleteForever'));
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </li>
  );
}

export function DesignGrid({
  designs,
  trashed,
  onChange,
}: {
  designs: DesignSummary[];
  trashed?: boolean;
  onChange: () => void;
}) {
  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      data-testid="design-grid"
    >
      {designs.map((d) => (
        <DesignCard key={d.id} design={d} trashed={trashed} onChange={onChange} />
      ))}
    </ul>
  );
}
