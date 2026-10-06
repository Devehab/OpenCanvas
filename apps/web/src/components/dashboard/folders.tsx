'use client';

/** Project folders: cards, the create/rename dialog and "Move to folder" menus. */
import { Check, Folder, FolderInput, FolderMinus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SubMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { updateUpload } from '@/lib/storage/assets';
import { updateDesignMeta } from '@/lib/storage/designs';
import {
  createFolder,
  deleteFolder,
  FOLDER_COLORS,
  type FolderRecord,
  updateFolder,
} from '@/lib/storage/folders';
import { cn } from '@/lib/utils';

/** Drag data for moving designs onto folders. */
export const DESIGN_DRAG_TYPE = 'application/x-opencanvas-design';

export const foldersChanged = () => broadcast({ type: 'folders-changed', tabId: TAB_ID }, { self: true });
const designsChanged = () => broadcast({ type: 'designs-changed', tabId: TAB_ID }, { self: true });

/** Create (no folder) or rename/recolor a folder. */
export function FolderDialog({
  open,
  onOpenChange,
  folder,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder?: FolderRecord;
  onCreated?: (folder: FolderRecord) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]!);
  useEffect(() => {
    if (!open) return;
    setName(folder?.name ?? '');
    setColor(folder?.color ?? FOLDER_COLORS[0]!);
  }, [open, folder]);
  const save = async () => {
    const value = name.trim();
    if (!value) return;
    if (folder) await updateFolder(folder.id, { name: value, color });
    else {
      // Not `onCreated?.(await createFolder())`: optional calls skip their arguments.
      const created = await createFolder(value, color);
      onCreated?.(created);
    }
    foldersChanged();
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={folder ? t('projects.editFolder') : t('projects.newFolder')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => void save()}
            data-testid="save-folder"
          >
            {folder ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('projects.folderName')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            maxLength={100}
            autoFocus
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            data-testid="folder-name"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{t('projects.color')}</legend>
          <div className="flex gap-2">
            {FOLDER_COLORS.map((c) => (
              <label
                key={c}
                className={cn(
                  'flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300',
                  color === c && 'ring-2 ring-slate-900',
                )}
                style={{ background: c }}
              >
                <input
                  type="radio"
                  name="folder-color"
                  className="sr-only"
                  checked={color === c}
                  onChange={() => setColor(c)}
                  aria-label={c}
                />
                {color === c ? <Check className="size-4 text-white" /> : null}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

export function FolderCard({
  folder,
  designs,
  images,
}: {
  folder: FolderRecord;
  designs: number;
  images: number;
}) {
  const { t, formatNumber } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <li
      className={cn(
        'group relative rounded-xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-md',
        over && 'border-brand-500 ring-2 ring-brand-200',
      )}
      data-testid="folder-card"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DESIGN_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        const id = e.dataTransfer.getData(DESIGN_DRAG_TYPE);
        setOver(false);
        if (!id) return;
        e.preventDefault();
        await updateDesignMeta(id, { folderId: folder.id });
        designsChanged();
        toast(t('projects.movedTo', { name: folder.name }), 'success');
      }}
    >
      <Link
        href={`/designs?folder=${folder.id}`}
        className="flex items-center gap-3 p-4"
        data-testid="folder-link"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${folder.color}1f`, color: folder.color }}
        >
          <Folder className="size-6" fill="currentColor" fillOpacity={0.25} />
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-sm font-semibold text-slate-900"
            data-testid="folder-name-label"
          >
            {folder.name}
          </span>
          <span className="block text-xs text-slate-500">
            {t('projects.counts', { designs: formatNumber(designs), images: formatNumber(images) })}
          </span>
        </span>
      </Link>
      <Menu>
        <MenuTrigger
          className="absolute end-2 top-2 rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100"
          aria-label={t('projects.folderActions', { name: folder.name })}
          data-testid="folder-menu"
        >
          <MoreHorizontal className="size-5" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Pencil className="size-4" />} onSelect={() => setEditing(true)}>
            {t('projects.editFolder')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 className="size-4" />} danger onSelect={() => setConfirming(true)}>
            {t('projects.deleteFolder')}
          </MenuItem>
        </MenuContent>
      </Menu>
      <FolderDialog open={editing} onOpenChange={setEditing} folder={folder} />
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('projects.deleteFolder')}
        description={t('projects.deleteFolderBody', { name: folder.name })}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-folder"
              onClick={async () => {
                await deleteFolder(folder.id);
                setConfirming(false);
                foldersChanged();
                designsChanged();
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

/** "Move to folder" submenu for a design or an upload. */
export function MoveToFolderMenu({
  folders,
  current,
  kind,
  id,
}: {
  folders: readonly FolderRecord[];
  current: string | null | undefined;
  kind: 'design' | 'upload';
  id: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const move = async (folderId: string | null, name?: string) => {
    if (kind === 'design') await updateDesignMeta(id, { folderId });
    else await updateUpload(id, { folderId });
    if (kind === 'design') designsChanged();
    else broadcast({ type: 'uploads-changed', tabId: TAB_ID }, { self: true });
    if (name) toast(t('projects.movedTo', { name }), 'success');
  };
  return (
    <SubMenu icon={<FolderInput className="size-4" />} label={t('editor.uploads.moveTo')}>
      {folders.length === 0 ? <MenuItem disabled>{t('projects.noFolders')}</MenuItem> : null}
      {folders.map((f) => (
        <MenuItem
          key={f.id}
          icon={<Folder className="size-4" style={{ color: f.color }} />}
          disabled={current === f.id}
          onSelect={() => void move(f.id, f.name)}
          testId="move-to-folder"
        >
          {f.name}
        </MenuItem>
      ))}
      {current ? (
        <>
          <MenuSeparator />
          <MenuItem icon={<FolderMinus className="size-4" />} onSelect={() => void move(null)}>
            {t('projects.removeFromFolder')}
          </MenuItem>
        </>
      ) : null}
    </SubMenu>
  );
}
