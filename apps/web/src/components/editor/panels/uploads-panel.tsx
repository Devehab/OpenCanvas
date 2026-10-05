'use client';

import { CloudUpload, Folder, FolderInput, Info, MoreHorizontal, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlobImage } from '@/components/ui/blob-image';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SubMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { broadcast, onChannelMessage, TAB_ID } from '@/lib/channel';
import { ASSET_DRAG_TYPE, type LibraryImage, placeImage } from '@/lib/place-image';
import {
  getAssetBlob,
  listUploads,
  removeUpload,
  type UploadSummary,
  updateUpload,
} from '@/lib/storage/assets';
import { type FolderRecord, listFolders } from '@/lib/storage/folders';
import { cn } from '@/lib/utils';

export const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml';

interface Upload extends UploadSummary {
  url: string | null;
}

const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(svg|avif)$/i.test(f.name);

/** Human-readable byte size ("1.2 MB"). */
export function useFormatBytes() {
  const { formatNumber } = useI18n();
  return (bytes: number) => {
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
      value /= 1000;
      unit++;
    }
    return formatNumber(value, {
      style: 'unit',
      unit: units[unit],
      unitDisplay: 'short',
      maximumFractionDigits: unit === 0 ? 0 : 1,
    });
  };
}

/** Drag data for a library image (read by the canvas and the brand kit). */
export function setAssetDragData(e: React.DragEvent, image: LibraryImage) {
  const { hash, mimeType, width, height, name, size } = image;
  e.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({ hash, mimeType, width, height, name, size }));
  e.dataTransfer.effectAllowed = 'copy';
}

export function UploadsPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { editor, uploadFiles } = useEditorContext();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [details, setDetails] = useState<Upload | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Upload | null>(null);
  const urls = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    const [list, folderList] = await Promise.all([listUploads(), listFolders()]);
    // Object URLs are cached per hash and only revoked when an upload disappears.
    const keep = new Set(list.map((u) => u.hash));
    for (const [hash, url] of urls.current) {
      if (!keep.has(hash)) {
        URL.revokeObjectURL(url);
        urls.current.delete(hash);
      }
    }
    const withUrls = await Promise.all(
      list.slice(0, 200).map(async (u) => {
        let url = urls.current.get(u.hash) ?? null;
        if (!url) {
          const blob = await getAssetBlob(u.hash);
          if (blob) {
            url = URL.createObjectURL(blob);
            urls.current.set(u.hash, url);
          }
        }
        return { ...u, url };
      }),
    );
    setUploads(withUrls);
    setFolders(folderList);
  }, []);

  useEffect(() => {
    void refresh();
    const off = onChannelMessage((m) => {
      if (m.type === 'uploads-changed' || m.type === 'designs-changed') void refresh();
    });
    const cache = urls.current;
    return () => {
      off();
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, [refresh]);

  const upload = async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (!images.length) {
      if (files.length) toast(t('editor.uploads.errors.unsupported', { name: files[0]!.name }), 'error');
      return;
    }
    setBusy(true);
    try {
      const placed = await uploadFiles(images, { insert: false });
      // Uploading while a folder is open files the images into that folder.
      if (folderId) {
        await Promise.all(placed.map((p) => updateUpload(p.hash, { folderId })));
        broadcast({ type: 'uploads-changed', tabId: TAB_ID }, { self: true });
      }
      if (placed.length) toast(t('editor.uploads.uploaded', { count: placed.length }), 'success');
    } finally {
      setBusy(false);
    }
  };

  const changed = () => broadcast({ type: 'uploads-changed', tabId: TAB_ID }, { self: true });

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return (uploads ?? []).filter(
      (u) =>
        (folderId === undefined || (u.folderId ?? null) === folderId) &&
        (!q || u.name.toLocaleLowerCase().includes(q)),
    );
  }, [uploads, folderId, query]);

  return (
    <section
      aria-label={t('editor.panels.uploads')}
      className="relative min-h-full space-y-3 p-4 pt-10"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(false);
        void upload([...e.dataTransfer.files]);
      }}
      data-testid="uploads-panel"
    >
      <Button
        variant="primary"
        className="w-full"
        disabled={busy}
        onClick={() => input.current?.click()}
        data-testid="upload-button"
      >
        <CloudUpload className="size-4" />
        {busy ? t('editor.uploads.uploading') : t('editor.uploads.upload')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_IMAGES}
        className="hidden"
        data-testid="upload-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void upload(files);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500 transition-colors hover:border-brand-300 hover:bg-brand-50/40',
          dropping && 'border-brand-400 bg-brand-50 text-brand-700',
        )}
        data-testid="upload-dropzone"
      >
        <CloudUpload className="size-5 text-slate-400" />
        <span className="font-medium text-slate-700">{t('editor.uploads.dropHint')}</span>
        <span>{t('editor.uploads.formats')}</span>
      </button>

      <div className="flex gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('editor.uploads.search')}
            aria-label={t('editor.uploads.search')}
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      {folders.length ? (
        <fieldset className="flex flex-wrap gap-1.5" aria-label={t('projects.folders')}>
          <FolderChip active={folderId === undefined} onClick={() => setFolderId(undefined)}>
            {t('editor.uploads.all')}
          </FolderChip>
          {folders.map((f) => (
            <FolderChip key={f.id} active={folderId === f.id} onClick={() => setFolderId(f.id)}>
              <Folder className="size-3.5" style={{ color: f.color }} />
              {f.name}
            </FolderChip>
          ))}
        </fieldset>
      ) : null}

      {uploads && visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {uploads.length === 0 ? t('editor.uploads.empty') : t('editor.uploads.noMatches')}
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-2" data-testid="uploads-list">
        {visible.map((u) => (
          <li key={u.hash} className="group relative" data-testid="upload-item">
            <button
              type="button"
              draggable
              onDragStart={(e) => setAssetDragData(e, u)}
              onClick={() => placeImage(editor, u)}
              className="oc-checker block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 hover:border-brand-400 focus-visible:outline-2 focus-visible:outline-brand-400"
              title={u.name}
              aria-label={t('editor.uploads.add', { name: u.name || t('editor.nodeTypes.image') })}
            >
              {u.url ? <BlobImage src={u.url} className="size-full object-contain" /> : null}
            </button>
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('editor.uploads.more', { name: u.name })}
                  className="absolute end-1 top-1 flex size-7 items-center justify-center rounded-md bg-white/90 text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  data-testid="upload-menu"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Info className="size-4" />} onSelect={() => setDetails(u)}>
                  {t('editor.uploads.details')}
                </MenuItem>
                <SubMenu icon={<FolderInput className="size-4" />} label={t('editor.uploads.moveTo')}>
                  <MenuItem
                    disabled={!u.folderId}
                    onSelect={async () => {
                      await updateUpload(u.hash, { folderId: null });
                      changed();
                    }}
                  >
                    {t('projects.noFolder')}
                  </MenuItem>
                  {folders.length ? <MenuSeparator /> : null}
                  {folders.map((f) => (
                    <MenuItem
                      key={f.id}
                      icon={<Folder className="size-4" style={{ color: f.color }} />}
                      disabled={u.folderId === f.id}
                      onSelect={async () => {
                        await updateUpload(u.hash, { folderId: f.id });
                        changed();
                        toast(t('projects.movedTo', { name: f.name }), 'success');
                      }}
                    >
                      {f.name}
                    </MenuItem>
                  ))}
                </SubMenu>
                <MenuSeparator />
                <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => setConfirmDelete(u)}>
                  {t('common.delete')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </li>
        ))}
      </ul>
      {dropping ? (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-400 bg-brand-50/90 text-sm font-medium text-brand-700">
          {t('editor.uploads.dropToUpload')}
        </div>
      ) : null}

      <UploadDetailsDialog
        upload={details}
        folders={folders}
        onClose={() => setDetails(null)}
        onRename={async (name) => {
          if (!details) return;
          await updateUpload(details.hash, { name });
          changed();
        }}
      />
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t('editor.uploads.deleteTitle')}
        description={t('editor.uploads.deleteBody')}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-upload"
              onClick={async () => {
                if (!confirmDelete) return;
                await removeUpload(confirmDelete.hash);
                setConfirmDelete(null);
                changed();
                toast(t('editor.uploads.deleted'), 'success');
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </section>
  );
}

function FolderChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 max-w-full items-center gap-1 truncate rounded-full border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50',
        active && 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-50',
      )}
    >
      {children}
    </button>
  );
}

function UploadDetailsDialog({
  upload,
  folders,
  onClose,
  onRename,
}: {
  upload: Upload | null;
  folders: FolderRecord[];
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const { t, formatNumber, locale } = useI18n();
  const { editor } = useEditorContext();
  const formatBytes = useFormatBytes();
  const [name, setName] = useState('');
  useEffect(() => setName(upload?.name ?? ''), [upload]);
  if (!upload) return null;
  const used = editor.store.getAssets().some((a) => a.hash === upload.hash);
  const folder = folders.find((f) => f.id === upload.folderId);
  const rows: [string, string][] = [
    [t('editor.uploads.type'), upload.mimeType.replace('image/', '').replace('+xml', '').toUpperCase()],
    [
      t('editor.uploads.dimensions'),
      `${formatNumber(upload.width)} × ${formatNumber(upload.height)} ${t('common.px')}`,
    ],
    [t('editor.uploads.size'), formatBytes(upload.size)],
    [
      t('editor.uploads.uploadedAt'),
      new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(upload.createdAt),
    ],
    [t('editor.uploads.folder'), folder?.name ?? t('projects.noFolder')],
    [t('editor.uploads.inThisDesign'), used ? t('common.yes') : t('common.no')],
  ];
  const save = async () => {
    if (name.trim() && name.trim() !== upload.name) await onRename(name);
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('editor.uploads.details')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} data-testid="save-upload-details">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="oc-checker flex h-44 items-center justify-center overflow-hidden rounded-xl border border-slate-200">
          {upload.url ? (
            <BlobImage src={upload.url} className="max-h-full max-w-full object-contain" />
          ) : null}
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('editor.uploads.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            maxLength={200}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            data-testid="upload-name"
          />
        </label>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-slate-800" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}
