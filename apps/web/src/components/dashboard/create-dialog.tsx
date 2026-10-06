'use client';

/**
 * "Create a design": categories on the side (For you, Presentations, Social
 * media, Video, Print…), a search box, platform chips for social formats,
 * preview cards, custom size and a photo editor entry.
 */
import {
  DESIGN_FORMATS,
  type DesignFormat,
  type FormatCategory,
  type FormatPlatform,
} from '@opencanvas/core';
import {
  Briefcase,
  FileText,
  Globe,
  ImagePlus,
  Loader2,
  Mail,
  Megaphone,
  Monitor,
  PenLine,
  Presentation,
  Printer,
  Ruler,
  Search,
  Share2,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog as D } from 'radix-ui';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { normalizeArabic } from '@/lib/icon-library/arabic';
import { photoDesignSnapshot } from '@/lib/photo-design';
import { prepareImage } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { createDesignAndOpen } from './create-design';
import { CustomSizeDialog } from './custom-size-dialog';

type Tab = 'for-you' | Exclude<FormatCategory, 'custom'> | 'photo';

const TABS: { id: Tab; icon: typeof Sparkles; label: string }[] = [
  { id: 'for-you', icon: Sparkles, label: 'categories.forYou' },
  { id: 'presentation', icon: Presentation, label: 'categories.presentation' },
  { id: 'social', icon: Share2, label: 'categories.social' },
  { id: 'video', icon: Video, label: 'categories.video' },
  { id: 'photo', icon: ImagePlus, label: 'categories.photo' },
  { id: 'print', icon: Printer, label: 'categories.print' },
  { id: 'document', icon: FileText, label: 'categories.document' },
  { id: 'whiteboard', icon: PenLine, label: 'categories.whiteboard' },
  { id: 'website', icon: Globe, label: 'categories.website' },
  { id: 'email', icon: Mail, label: 'categories.email' },
  { id: 'marketing', icon: Megaphone, label: 'categories.marketing' },
];

const CATEGORY_ICON: Record<FormatCategory, typeof Sparkles> = {
  presentation: Presentation,
  social: Share2,
  video: Video,
  print: Printer,
  document: FileText,
  whiteboard: PenLine,
  website: Monitor,
  email: Mail,
  marketing: Briefcase,
  custom: Ruler,
};

/** Soft card colors per category. */
const CATEGORY_TINT: Record<FormatCategory, string> = {
  presentation: 'from-amber-100 to-orange-200 text-orange-600',
  social: 'from-pink-100 to-fuchsia-200 text-fuchsia-600',
  video: 'from-sky-100 to-indigo-200 text-indigo-600',
  print: 'from-emerald-100 to-teal-200 text-teal-600',
  document: 'from-slate-100 to-slate-200 text-slate-600',
  whiteboard: 'from-lime-100 to-green-200 text-green-700',
  website: 'from-cyan-100 to-sky-200 text-sky-700',
  email: 'from-rose-100 to-red-200 text-rose-600',
  marketing: 'from-violet-100 to-purple-200 text-violet-600',
  custom: 'from-slate-100 to-slate-200 text-slate-600',
};

const PLATFORMS: FormatPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'pinterest',
  'tiktok',
  'x',
  'whatsapp',
  'youtube',
  'snapchat',
];

function FormatCard({ format, onCreate }: { format: DesignFormat; onCreate: (f: DesignFormat) => void }) {
  const { t, formatNumber } = useI18n();
  const Icon = CATEGORY_ICON[format.category];
  const ratio = format.width / format.height;
  const box = 92;
  const w = ratio >= 1 ? box : Math.max(28, box * ratio);
  const h = ratio >= 1 ? Math.max(18, box / ratio) : box;
  return (
    <button
      type="button"
      onClick={() => onCreate(format)}
      data-testid={`format-${format.id}`}
      className="group flex w-full flex-col items-center gap-2 rounded-xl p-2 text-center transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-400"
    >
      <span className="flex h-28 w-full items-center justify-center rounded-xl bg-slate-100 transition group-hover:bg-slate-200/70">
        <span
          className={cn(
            'flex items-center justify-center rounded-md bg-gradient-to-br shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md',
            CATEGORY_TINT[format.category],
          )}
          style={{ width: w, height: h }}
          aria-hidden
        >
          <Icon className="size-5 opacity-80" />
        </span>
      </span>
      <span className="text-sm font-medium leading-tight text-slate-800">{t(`formats.${format.id}`)}</span>
      <span className="text-xs text-slate-500" dir="ltr">
        {format.physical
          ? `${formatNumber(format.physical.width)} × ${formatNumber(format.physical.height)} ${format.physical.unit}`
          : `${formatNumber(format.width)} × ${formatNumber(format.height)} px`}
      </span>
    </button>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

export function CreateDialog({
  open,
  onOpenChange,
  folderId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Designs created from a project folder go into that folder. */
  folderId?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('for-you');
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<FormatPlatform | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const create = async (format: DesignFormat) => {
    onOpenChange(false);
    await createDesignAndOpen(router, {
      title: t(`formats.${format.id}`),
      width: format.width,
      height: format.height,
      format,
      folderId,
    });
  };

  const createFromPhoto = async (file: File) => {
    setBusy(true);
    try {
      const prepared = await prepareImage(file, file.name || 'photo');
      if (!prepared.ok) {
        toast(t(`editor.uploads.errors.${prepared.reason}`, { name: prepared.name }), 'error');
        return;
      }
      const title = file.name.replace(/\.[^.]+$/, '') || t('createDialog.photoTitle');
      const snapshot = photoDesignSnapshot(prepared.asset, title);
      onOpenChange(false);
      await createDesignAndOpen(router, {
        title,
        width: prepared.asset.width,
        height: prepared.asset.height,
        snapshot,
        folderId,
      });
    } finally {
      setBusy(false);
    }
  };

  const searchResults = useMemo(() => {
    const q = normalizeArabic(query.trim());
    if (!q) return null;
    return DESIGN_FORMATS.filter((f) => {
      const haystack = normalizeArabic(
        [
          f.name,
          t(`formats.${f.id}`),
          t(`categories.${f.category}`),
          f.platform ? t(`platforms.${f.platform}`) : '',
          f.platform ?? '',
          `${f.width}x${f.height}`,
        ].join(' '),
      );
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [query, t]);

  let body: ReactNode;
  if (searchResults) {
    body =
      searchResults.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          <p>{t('createDialog.noResults', { query })}</p>
          <Button className="mt-4" onClick={() => setCustomOpen(true)}>
            <Ruler className="size-4" />
            {t('home.customSize')}
          </Button>
        </div>
      ) : (
        <CardGrid>
          {searchResults.map((f) => (
            <FormatCard key={f.id} format={f} onCreate={create} />
          ))}
        </CardGrid>
      );
  } else if (tab === 'photo') {
    body = (
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-indigo-200 text-indigo-600">
          <ImagePlus className="size-8" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t('createDialog.photoTitle')}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('createDialog.photoHint')}</p>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => photoInput.current?.click()}
          data-testid="create-from-photo"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {busy ? t('createDialog.creating') : t('createDialog.choosePhoto')}
        </Button>
        <input
          ref={photoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          data-testid="create-photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void createFromPhoto(file);
          }}
        />
      </div>
    );
  } else if (tab === 'for-you') {
    const popular = DESIGN_FORMATS.filter((f) => f.popular);
    const groups = (
      [
        'presentation',
        'social',
        'video',
        'print',
        'document',
        'whiteboard',
        'website',
        'email',
        'marketing',
      ] as const
    )
      .map((category) => ({ category, items: popular.filter((f) => f.category === category) }))
      .filter((g) => g.items.length);
    body = (
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.category} aria-labelledby={`create-${g.category}`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 id={`create-${g.category}`} className="text-sm font-semibold text-slate-900">
                {t(`categories.${g.category}`)}
              </h3>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setTab(g.category)}
              >
                {t('home.seeAll')}
              </button>
            </div>
            <CardGrid>
              {g.items.map((f) => (
                <FormatCard key={f.id} format={f} onCreate={create} />
              ))}
            </CardGrid>
          </section>
        ))}
      </div>
    );
  } else {
    const inCategory = DESIGN_FORMATS.filter((f) => f.category === tab);
    const platforms = PLATFORMS.filter((p) => inCategory.some((f) => f.platform === p));
    const shown = platform ? inCategory.filter((f) => f.platform === platform) : inCategory;
    body = (
      <>
        {platforms.length ? (
          <fieldset className="mb-4 flex flex-wrap gap-1.5" aria-label={t('createDialog.categoriesLabel')}>
            {[null, ...platforms].map((p) => (
              <button
                key={p ?? 'popular'}
                type="button"
                aria-pressed={platform === p}
                onClick={() => setPlatform(p)}
                className={cn(
                  'h-8 rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50',
                  platform === p && 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
                )}
                data-testid={`platform-${p ?? 'all'}`}
              >
                {p ? t(`platforms.${p}`) : t('categories.popular')}
              </button>
            ))}
          </fieldset>
        ) : null}
        <CardGrid>
          {shown.map((f) => (
            <FormatCard key={f.id} format={f} onCreate={create} />
          ))}
        </CardGrid>
      </>
    );
  }

  return (
    <>
      <D.Root open={open} onOpenChange={onOpenChange}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]" />
          <D.Content
            className="fixed start-1/2 top-1/2 z-50 flex h-[min(90vh,46rem)] w-[min(96vw,72rem)] -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ltr:-translate-x-1/2 rtl:translate-x-1/2"
            data-testid="create-dialog"
          >
            <nav
              className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-e border-slate-100 bg-slate-50/60 p-3 max-md:hidden"
              aria-label={t('createDialog.categoriesLabel')}
            >
              <D.Title className="mb-3 px-2 pt-1 text-lg font-semibold text-slate-900">
                {t('createDialog.title')}
              </D.Title>
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={tab === item.id && !query ? 'page' : undefined}
                  onClick={() => {
                    setTab(item.id);
                    setPlatform(null);
                    setQuery('');
                  }}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-lg px-3 text-start text-sm font-medium text-slate-700 hover:bg-white',
                    tab === item.id && !query && 'bg-white text-brand-700 shadow-sm',
                  )}
                  data-testid={`create-tab-${item.id}`}
                >
                  <item.icon className="size-[18px]" />
                  {t(item.label)}
                </button>
              ))}
              <div className="my-2 h-px bg-slate-200" />
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-start text-sm font-medium text-slate-700 hover:bg-white"
                data-testid="format-custom"
              >
                <Ruler className="size-[18px]" />
                {t('home.customSize')}
              </button>
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('createDialog.search')}
                    aria-label={t('createDialog.search')}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    data-testid="create-search"
                  />
                </label>
                <D.Close
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                  aria-label={t('common.close')}
                >
                  <X className="size-5" />
                </D.Close>
              </div>
              <D.Description className="sr-only">{t('createDialog.search')}</D.Description>
              {/* Small screens: categories as a scrolling row. */}
              <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2 md:hidden">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      setPlatform(null);
                      setQuery('');
                    }}
                    className={cn(
                      'h-8 shrink-0 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-700',
                      tab === item.id && !query && 'border-brand-300 bg-brand-50 text-brand-700',
                    )}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
      <CustomSizeDialog open={customOpen} onOpenChange={setCustomOpen} />
    </>
  );
}
