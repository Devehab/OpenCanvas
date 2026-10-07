'use client';

/**
 * Templates: folder icons, the folder dialog, "Save as template", and the
 * cards of the Templates page. A template is a design marked as one; using
 * it opens a copy in a new tab and never changes the template itself.
 */
import {
  Briefcase,
  Calendar,
  Camera,
  Check,
  CopyPlus,
  ExternalLink,
  Folder,
  FolderInput,
  FolderMinus,
  Gift,
  GraduationCap,
  Heart,
  type LucideIcon,
  Megaphone,
  MoreHorizontal,
  Music,
  Pencil,
  Plane,
  Presentation,
  Rocket,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Utensils,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DESIGN_DRAG_TYPE } from '@/components/dashboard/folders';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SubMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useThumbnail } from '@/hooks/use-designs';
import { useFolders } from '@/hooks/use-folders';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import {
  createDesignCopy,
  type DesignSummary,
  renameDesign,
  saveAsTemplate,
  setTrashed,
  updateDesignMeta,
} from '@/lib/storage/designs';
import {
  createFolder,
  deleteFolder,
  FOLDER_COLORS,
  type FolderRecord,
  TEMPLATE_FOLDER_ICONS,
  updateFolder,
} from '@/lib/storage/folders';
import { buildStarter, type StarterLang, type StarterTemplate } from '@/lib/templates/starters';
import { documentPreview } from '@/lib/thumbnail-render';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  megaphone: Megaphone,
  presentation: Presentation,
  briefcase: Briefcase,
  calendar: Calendar,
  gift: Gift,
  heart: Heart,
  star: Star,
  'shopping-bag': ShoppingBag,
  'graduation-cap': GraduationCap,
  camera: Camera,
  utensils: Utensils,
  music: Music,
  plane: Plane,
  rocket: Rocket,
  sparkles: Sparkles,
};

export function TemplateFolderIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = ICONS[icon ?? 'folder'] ?? Folder;
  return <Icon className={className} />;
}

export const templatesChanged = () => broadcast({ type: 'designs-changed', tabId: TAB_ID }, { self: true });
const foldersChanged = () => broadcast({ type: 'folders-changed', tabId: TAB_ID }, { self: true });

/** Create or edit a template folder: name, icon and color. */
export function TemplateFolderDialog({
  open,
  onOpenChange,
  folder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder?: FolderRecord;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(TEMPLATE_FOLDER_ICONS[0]);
  const [color, setColor] = useState(FOLDER_COLORS[0]!);
  useEffect(() => {
    if (!open) return;
    setName(folder?.name ?? '');
    setIcon(folder?.icon ?? TEMPLATE_FOLDER_ICONS[0]);
    setColor(folder?.color ?? FOLDER_COLORS[0]!);
  }, [open, folder]);
  const save = async () => {
    const value = name.trim();
    if (!value) return;
    if (folder) await updateFolder(folder.id, { name: value, color, icon });
    else await createFolder(value, color, { kind: 'template', icon });
    foldersChanged();
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={folder ? t('templates.editFolder') : t('templates.newFolder')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => void save()}
            data-testid="save-template-folder"
          >
            {folder ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('templates.folderName')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            maxLength={100}
            autoFocus
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            data-testid="template-folder-name"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{t('templates.icon')}</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {TEMPLATE_FOLDER_ICONS.map((id) => (
              <label
                key={id}
                className={cn(
                  'flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300',
                  icon === id && 'border-transparent ring-2',
                )}
                style={
                  icon === id
                    ? { color, background: `${color}1f`, ['--tw-ring-color' as string]: color }
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="template-folder-icon"
                  className="sr-only"
                  checked={icon === id}
                  onChange={() => setIcon(id)}
                  aria-label={id}
                  data-testid="template-folder-icon"
                  value={id}
                />
                <TemplateFolderIcon icon={id} className="size-5" />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{t('templates.color')}</legend>
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
                  name="template-folder-color"
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

/** "Save as template": a copy of the design becomes a template, in a folder of choice. */
export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  designId,
  title,
  beforeSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designId: string;
  title: string;
  /** Runs first (the editor saves pending edits so the template has them). */
  beforeSave?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { folders } = useFolders('template');
  const [name, setName] = useState(title);
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(title);
  }, [open, title]);
  const save = async () => {
    const value = name.trim() || title;
    setBusy(true);
    try {
      await beforeSave?.();
      const created = await saveAsTemplate(designId, value, folderId || null);
      if (!created) return;
      templatesChanged();
      onOpenChange(false);
      toast(t('templates.saved', { name: value }), 'success');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('templates.saveAsTemplate')}
      description={t('templates.saveAsTemplateHint')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
            data-testid="confirm-save-template"
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('templates.templateName')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            maxLength={256}
            autoFocus
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            data-testid="template-name"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('templates.folder')}</span>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            data-testid="template-folder-select"
          >
            <option value="">{t('templates.noFolder')}</option>
            {(folders ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Dialog>
  );
}

export function TemplateFolderCard({ folder, count }: { folder: FolderRecord; count: number }) {
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
      data-testid="template-folder-card"
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
        templatesChanged();
        toast(t('templates.movedTo', { name: folder.name }), 'success');
      }}
    >
      <Link
        href={`/templates?folder=${folder.id}`}
        className="flex items-center gap-3 p-4"
        data-testid="template-folder-link"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${folder.color}1f`, color: folder.color }}
          data-icon={folder.icon ?? 'folder'}
        >
          <TemplateFolderIcon icon={folder.icon} className="size-6" />
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-sm font-semibold text-slate-900"
            data-testid="template-folder-label"
          >
            {folder.name}
          </span>
          <span className="block text-xs text-slate-500">
            {count === 1 ? t('templates.oneTemplate') : t('templates.count', { count: formatNumber(count) })}
          </span>
        </span>
      </Link>
      <Menu>
        <MenuTrigger
          className="absolute end-2 top-2 rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          aria-label={t('templates.folderActions', { name: folder.name })}
          data-testid="template-folder-menu"
        >
          <MoreHorizontal className="size-5" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Pencil className="size-4" />} onSelect={() => setEditing(true)}>
            {t('templates.editFolder')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 className="size-4" />} danger onSelect={() => setConfirming(true)}>
            {t('templates.deleteFolder')}
          </MenuItem>
        </MenuContent>
      </Menu>
      <TemplateFolderDialog open={editing} onOpenChange={setEditing} folder={folder} />
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('templates.deleteFolder')}
        description={t('templates.deleteFolderBody', { name: folder.name })}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-template-folder"
              onClick={async () => {
                await deleteFolder(folder.id);
                setConfirming(false);
                foldersChanged();
                templatesChanged();
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

function Preview({ src, width, height }: { src: string | null; width: number; height: number }) {
  const ratio = width / height;
  return src ? (
    // biome-ignore lint/performance/noImgElement: local blob URL preview
    <img src={src} alt="" className="max-h-[85%] max-w-[85%] rounded-sm object-contain shadow-sm" />
  ) : (
    <span
      className="rounded-sm bg-white shadow-sm"
      style={
        ratio >= 1
          ? { width: '70%', aspectRatio: String(ratio) }
          : { height: '75%', aspectRatio: String(ratio) }
      }
    />
  );
}

const cardFrame =
  'relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition group-hover:border-brand-300 group-hover:shadow-md';

/** One of the person's templates. Clicking it opens a copy in a new tab. */
export function TemplateCard({
  template,
  folders,
}: {
  template: DesignSummary;
  folders: readonly FolderRecord[];
}) {
  const { t, formatRelative } = useI18n();
  const toast = useToast();
  const thumbnail = useThumbnail(template.id, template.revision);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(template.title);
  const useHref = `/templates/use?id=${encodeURIComponent(template.id)}`;
  const move = async (folderId: string | null, name?: string) => {
    await updateDesignMeta(template.id, { folderId });
    templatesChanged();
    if (name) toast(t('templates.movedTo', { name }), 'success');
  };
  return (
    <li
      className="group relative"
      data-testid="template-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DESIGN_DRAG_TYPE, template.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className={cardFrame}>
        <a
          href={useHref}
          target="_blank"
          rel="noopener"
          className="absolute inset-0 z-10"
          title={t('templates.useHint')}
          data-testid="use-template"
        >
          <span className="sr-only">{`${t('templates.use')}: ${template.title}`}</span>
        </a>
        <Preview src={thumbnail} width={template.width} height={template.height} />
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" data-testid="template-title">
            {template.title}
          </p>
          <p className="text-xs text-slate-500">
            {t('design.edited', { time: formatRelative(template.updatedAt) })}
          </p>
        </div>
        <Menu>
          <MenuTrigger
            className="z-20 rounded-md p-1 text-slate-500 hover:bg-slate-200 focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            aria-label={t('templates.actions')}
            data-testid="template-menu"
          >
            <MoreHorizontal className="size-5" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              icon={<ExternalLink className="size-4" />}
              onSelect={() => window.open(useHref, '_blank', 'noopener')}
            >
              {t('templates.use')}
            </MenuItem>
            <MenuItem
              icon={<Pencil className="size-4" />}
              onSelect={() => {
                window.location.href = `/design/${template.id}`;
              }}
              testId="edit-template"
            >
              {t('templates.edit')}
            </MenuItem>
            <MenuItem
              icon={<Pencil className="size-4" />}
              onSelect={() => setRenaming(true)}
              testId="rename-template"
            >
              {t('common.rename')}
            </MenuItem>
            <MenuItem
              icon={<CopyPlus className="size-4" />}
              onSelect={async () => {
                await saveAsTemplate(
                  template.id,
                  t('design.copyOf', { title: template.title }),
                  template.folderId ?? null,
                );
                templatesChanged();
              }}
            >
              {t('common.duplicate')}
            </MenuItem>
            <SubMenu icon={<FolderInput className="size-4" />} label={t('templates.moveTo')}>
              {folders.length === 0 ? <MenuItem disabled>{t('projects.noFolders')}</MenuItem> : null}
              {folders.map((f) => (
                <MenuItem
                  key={f.id}
                  icon={<TemplateFolderIcon icon={f.icon} className="size-4" />}
                  disabled={template.folderId === f.id}
                  onSelect={() => void move(f.id, f.name)}
                  testId="move-template-to-folder"
                >
                  {f.name}
                </MenuItem>
              ))}
              {template.folderId ? (
                <>
                  <MenuSeparator />
                  <MenuItem icon={<FolderMinus className="size-4" />} onSelect={() => void move(null)}>
                    {t('templates.removeFromFolder')}
                  </MenuItem>
                </>
              ) : null}
            </SubMenu>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 className="size-4" />}
              danger
              testId="template-trash"
              onSelect={async () => {
                await setTrashed(template.id, true);
                templatesChanged();
              }}
            >
              {t('design.moveToTrash')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <Dialog
        open={renaming}
        onOpenChange={(open) => {
          setRenaming(open);
          if (open) setTitle(template.title);
        }}
        title={t('common.rename')}
        footer={
          <>
            <Button onClick={() => setRenaming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              data-testid="confirm-rename-template"
              onClick={async () => {
                await renameDesign(template.id, title.trim() || template.title);
                setRenaming(false);
                templatesChanged();
              }}
            >
              {t('common.apply')}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">{t('templates.templateName')}</span>
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 outline-none focus:border-brand-400"
            value={title}
            maxLength={256}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="rename-template-input"
          />
        </label>
      </Dialog>
    </li>
  );
}

/** A built-in template: use it, or copy it to the person's templates to change it. */
export function StarterCard({ starter }: { starter: StarterTemplate }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const lang: StarterLang = locale === 'ar' ? 'ar' : 'en';
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void documentPreview(`${starter.id}:${lang}`, () => buildStarter(starter, lang)).then((url) => {
      if (alive) setPreview(url);
    });
    return () => {
      alive = false;
    };
  }, [starter, lang]);
  const title = starter.title[lang];
  const useHref = `/templates/use?starter=${encodeURIComponent(starter.id)}`;
  return (
    <li className="group relative" data-testid="starter-card" data-starter={starter.id}>
      <div className={cardFrame}>
        <a
          href={useHref}
          target="_blank"
          rel="noopener"
          className="absolute inset-0 z-10"
          title={t('templates.useHint')}
          data-testid="use-starter"
        >
          <span className="sr-only">{`${t('templates.use')}: ${title}`}</span>
        </a>
        <Preview src={preview} width={starter.width} height={starter.height} />
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{t(`templates.categories.${starter.category}`)}</p>
        </div>
        <Menu>
          <MenuTrigger
            className="z-20 rounded-md p-1 text-slate-500 hover:bg-slate-200 focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            aria-label={t('templates.actions')}
            data-testid="starter-menu"
          >
            <MoreHorizontal className="size-5" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              icon={<ExternalLink className="size-4" />}
              onSelect={() => window.open(useHref, '_blank', 'noopener')}
            >
              {t('templates.use')}
            </MenuItem>
            <MenuItem
              icon={<CopyPlus className="size-4" />}
              testId="copy-starter"
              onSelect={async () => {
                await createDesignCopy(buildStarter(starter, lang), title, { kind: 'template' });
                templatesChanged();
                toast(t('templates.copied'), 'success');
              }}
            >
              {t('templates.copyToMine')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  );
}
