'use client';

/**
 * Download dialog, laid out like Canva's: file type (with a suggestion),
 * size, quality (compress / high / limit size), transparency, saved settings
 * and page selection (all, this page, or a custom set).
 */
import { DESIGN_FORMATS } from '@opencanvas/core';
import {
  Check,
  ChevronDown,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Image as ImageIcon,
  Loader2,
  Printer,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented, Toggle } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { type ExportType, runExport, SizeLimitError } from '@/lib/export-runner';
import { clamp, cn, downloadBytes, parseUserNumber, round } from '@/lib/utils';

const TYPES: ExportType[] = ['png', 'jpeg', 'pdf', 'pdfPrint', 'svg', 'webp', 'opencanvas'];
const TYPE_ICONS: Record<ExportType, typeof FileImage> = {
  png: FileImage,
  jpeg: ImageIcon,
  webp: FileImage,
  svg: FileCode2,
  pdf: FileText,
  pdfPrint: Printer,
  opencanvas: FileArchive,
};
/** Design units are CSS pixels: 96 per inch. */
const DESIGN_DPI = 96;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

type QualityMode = 'compress' | 'high' | 'limit';
type PagesMode = 'all' | 'current' | 'custom';

interface Settings {
  type: ExportType;
  scale: number;
  qualityMode: QualityMode;
  quality: number;
  limitKb: number;
  transparent: boolean;
}

const DEFAULTS: Omit<Settings, 'type'> = {
  scale: 1,
  qualityMode: 'high',
  quality: 90,
  limitKb: 500,
  transparent: false,
};

const settingsKey = (designId: string) => `opencanvas.downloadSettings.${designId}`;

function loadSettings(designId: string): Settings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(settingsKey(designId)) ?? 'null') as Partial<Settings> | null;
    if (!raw || !TYPES.includes(raw.type as ExportType)) return null;
    return {
      type: raw.type as ExportType,
      scale: clamp(Number(raw.scale) || 1, MIN_SCALE, MAX_SCALE),
      qualityMode: (['compress', 'high', 'limit'] as const).includes(raw.qualityMode as QualityMode)
        ? (raw.qualityMode as QualityMode)
        : 'high',
      quality: clamp(Number(raw.quality) || 90, 10, 100),
      limitKb: clamp(Number(raw.limitKb) || 500, 10, 100_000),
      transparent: raw.transparent === true,
    };
  } catch {
    return null;
  }
}

/** PDF for documents and print; PNG for everything else (social posts, presentations…). */
function suggestedType(formatId: string | null | undefined): ExportType {
  const category = DESIGN_FORMATS.find((f) => f.id === formatId)?.category;
  return category === 'document' || category === 'print' ? 'pdf' : 'png';
}

function Section({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
          {label}
        </label>
      ) : (
        <div className="text-sm font-medium text-slate-800">{label}</div>
      )}
      {children}
    </div>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, formatNumber } = useI18n();
  const toast = useToast();
  const { editor, session } = useEditorContext();
  const designId = session.design.id;
  const formatId = useEditorValue((e) => e.store.getDocument()?.formatId ?? null);
  const suggested = suggestedType(formatId);
  const [settings, setSettings] = useState<Settings>({ type: suggested, ...DEFAULTS });
  const [remember, setRemember] = useState(false);
  const [pagesMode, setPagesMode] = useState<PagesMode>('all');
  const [custom, setCustom] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const pageIds = useEditorValue((e) => e.store.getPageIds());
  const hiddenIds = useEditorValue((e) => pageIds.filter((id) => e.store.getPage(id)?.hidden), [pageIds]);
  const currentId = useEditorValue((e) => e.pageId);
  const page = useEditorValue((e) => e.store.getPage(e.pageId));

  // Opening the dialog starts from the saved settings for this design, if any.
  useEffect(() => {
    if (!open) return;
    const saved = loadSettings(designId);
    setRemember(saved !== null);
    setSettings(saved ?? { type: suggested, ...DEFAULTS });
    setPagesMode('all');
    setCustom(new Set([editor.pageId]));
  }, [open, designId, suggested, editor]);

  const { type, scale, qualityMode, quality, limitKb, transparent } = settings;
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const raster = type === 'png' || type === 'jpeg' || type === 'webp';
  const isPdf = type === 'pdf' || type === 'pdfPrint';
  const supportsTransparency = type === 'png' || type === 'webp' || type === 'svg';
  const isPackage = type === 'opencanvas';

  const visiblePages = useMemo(() => pageIds.filter((id) => !hiddenIds.includes(id)), [pageIds, hiddenIds]);
  const selected =
    pagesMode === 'all'
      ? visiblePages
      : pagesMode === 'current'
        ? [currentId]
        : pageIds.filter((id) => custom.has(id));
  const nothing = !isPackage && selected.length === 0;

  const start = async () => {
    if (nothing) return;
    setBusy({ done: 0, total: selected.length });
    try {
      await session.autosave.flush();
      const result = await runExport(
        session,
        {
          type,
          pageIds: selected,
          scale,
          transparent: supportsTransparency && transparent,
          quality: quality / 100,
          compress: qualityMode === 'compress',
          maxBytes: raster && qualityMode === 'limit' ? limitKb * 1024 : undefined,
        },
        (done, total) => setBusy({ done, total }),
      );
      try {
        if (remember) localStorage.setItem(settingsKey(designId), JSON.stringify(settings));
        else localStorage.removeItem(settingsKey(designId));
      } catch {
        // settings are a convenience
      }
      downloadBytes(result.data, result.fileName, result.mimeType);
      toast(t('editor.exportDialog.done'), 'success');
      onOpenChange(false);
    } catch (error) {
      toast(
        error instanceof SizeLimitError
          ? t('editor.exportDialog.tooBig', { size: formatNumber(limitKb) })
          : t('editor.exportDialog.failed', { reason: (error as Error).message }),
        'error',
      );
    } finally {
      setBusy(null);
    }
  };

  const TypeIcon = TYPE_ICONS[type];
  const width = page ? Math.round(page.width * scale) : 0;
  const height = page ? Math.round(page.height * scale) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={t('editor.exportDialog.title')}
      className="w-[min(94vw,26rem)]"
    >
      <div className="space-y-5" data-testid="export-dialog">
        <Section label={t('editor.exportDialog.fileType')}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 text-start text-sm hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-brand-400"
                data-testid="export-type"
                aria-label={`${t('editor.exportDialog.fileType')}: ${t(`editor.exportDialog.types.${type}`)}`}
              >
                <TypeIcon className="size-5 text-slate-500" />
                <span className="flex-1 font-medium text-slate-900">
                  {t(`editor.exportDialog.types.${type}`)}
                </span>
                {type === suggested ? <SuggestedBadge /> : null}
                <ChevronDown className="size-4 text-slate-500" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                className="z-[60] w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
              >
                <DropdownMenu.RadioGroup
                  value={type}
                  onValueChange={(v) => update({ type: v as ExportType })}
                >
                  {TYPES.map((ty) => {
                    const Icon = TYPE_ICONS[ty];
                    return (
                      <DropdownMenu.RadioItem
                        key={ty}
                        value={ty}
                        className="flex cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-slate-100"
                        data-testid={`export-type-${ty}`}
                      >
                        <Icon className="mt-0.5 size-5 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                            {t(`editor.exportDialog.types.${ty}`)}
                            {ty === suggested ? <SuggestedBadge /> : null}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {t(`editor.exportDialog.hints.${ty}`)}
                          </span>
                        </span>
                        <DropdownMenu.ItemIndicator>
                          <Check className="mt-0.5 size-4 text-brand-600" />
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    );
                  })}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </Section>

        {raster && page ? (
          <Section label={t('editor.exportDialog.size')} htmlFor="export-scale-input">
            <div className="flex items-center gap-3" data-testid="export-scale">
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.125}
                value={scale}
                onChange={(e) => update({ scale: Number(e.target.value) })}
                aria-label={t('editor.exportDialog.size')}
                aria-valuetext={`${formatNumber(round(scale, 3))}×`}
                className="h-1 flex-1 cursor-pointer accent-brand-500"
              />
              <ScaleInput value={scale} onChange={(v) => update({ scale: v })} />
            </div>
            <p className="text-xs text-slate-500" data-testid="export-dimensions">
              <span dir="ltr">
                {formatNumber(width)} × {formatNumber(height)} {t('common.px')}
              </span>
              {type !== 'webp' ? (
                <span className="text-slate-500">
                  {' · '}
                  {formatNumber(round(DESIGN_DPI * scale, 1))} {t('editor.exportDialog.dpiShort')}
                </span>
              ) : null}
            </p>
          </Section>
        ) : null}

        {raster ? (
          <Section label={t('editor.exportDialog.quality')}>
            <Segmented
              showLabels
              size="md"
              label={t('editor.exportDialog.quality')}
              value={qualityMode}
              onChange={(v) => update({ qualityMode: v })}
              options={[
                { value: 'compress', label: t('editor.exportDialog.compress') },
                { value: 'high', label: t('editor.exportDialog.high') },
                { value: 'limit', label: t('editor.exportDialog.limitSize') },
              ]}
              testId="export-quality"
            />
            {qualityMode === 'high' && (type === 'jpeg' || type === 'webp') ? (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  onChange={(e) => update({ quality: Number(e.target.value) })}
                  aria-label={t('editor.exportDialog.quality')}
                  className="h-1 flex-1 cursor-pointer accent-brand-500"
                />
                <span className="w-10 text-end text-xs tabular-nums text-slate-600">
                  {formatNumber(quality)}%
                </span>
              </div>
            ) : null}
            {qualityMode === 'compress' ? (
              <p className="text-xs text-slate-500">{t('editor.exportDialog.compressHint')}</p>
            ) : null}
            {qualityMode === 'limit' ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {t('editor.exportDialog.maxSize')}
                <input
                  inputMode="numeric"
                  value={limitKb}
                  dir="ltr"
                  onChange={(e) => {
                    const n = parseUserNumber(e.target.value);
                    if (Number.isFinite(n)) update({ limitKb: clamp(Math.round(n), 10, 100_000) });
                  }}
                  className="h-9 w-24 rounded-lg border border-slate-200 px-2 text-end tabular-nums outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  data-testid="export-limit"
                />
                {t('editor.exportDialog.kb')}
              </label>
            ) : null}
          </Section>
        ) : null}

        {isPdf ? (
          <Toggle
            label={t('editor.exportDialog.compressPdf')}
            checked={qualityMode === 'compress'}
            onChange={(v) => update({ qualityMode: v ? 'compress' : 'high' })}
            testId="export-compress-pdf"
          />
        ) : null}

        {supportsTransparency ? (
          <Toggle
            label={t('editor.exportDialog.transparent')}
            checked={transparent}
            onChange={(v) => update({ transparent: v })}
            testId="export-transparent"
          />
        ) : null}

        {isPackage ? null : (
          <Section label={t('editor.exportDialog.selectPages')}>
            <Segmented
              showLabels
              size="md"
              label={t('editor.exportDialog.selectPages')}
              value={pagesMode}
              onChange={setPagesMode}
              options={[
                {
                  value: 'all',
                  label: t('editor.exportDialog.allPagesShort', { count: formatNumber(visiblePages.length) }),
                },
                {
                  value: 'current',
                  label: t('editor.exportDialog.thisPage', {
                    n: formatNumber(pageIds.indexOf(currentId) + 1),
                  }),
                },
                { value: 'custom', label: t('editor.exportDialog.custom') },
              ]}
              testId="export-pages"
            />
            {pagesMode === 'custom' ? (
              <PageChecklist pageIds={pageIds} selected={custom} onChange={setCustom} />
            ) : null}
            {pagesMode === 'all' && hiddenIds.length ? (
              <p className="text-xs text-slate-500">
                {t('editor.exportDialog.hiddenSkipped', { count: formatNumber(hiddenIds.length) })}
              </p>
            ) : null}
            {raster && selected.length > 1 ? (
              <p className="text-xs text-slate-500">{t('editor.exportDialog.multipleZip')}</p>
            ) : null}
          </Section>
        )}

        <Toggle
          label={t('editor.exportDialog.saveSettings')}
          checked={remember}
          onChange={setRemember}
          testId="export-remember"
        />

        {busy && busy.total > 1 ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={busy.total}
            aria-valuenow={busy.done}
          >
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(busy.done / busy.total) * 100}%` }}
            />
          </div>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!!busy || nothing}
          onClick={() => void start()}
          data-testid="export-start"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? t('editor.exportDialog.preparing') : t('editor.exportDialog.download')}
        </Button>
      </div>
    </Dialog>
  );
}

function SuggestedBadge() {
  const { t } = useI18n();
  return (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
      {t('editor.exportDialog.suggested')}
    </span>
  );
}

/** Scale box ("1.5×"): commits on Enter or blur. */
function ScaleInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t, formatNumber } = useI18n();
  const display = formatNumber(round(value, 3));
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(display);
  }, [display, focused]);
  const commit = () => {
    const n = parseUserNumber(draft);
    if (Number.isFinite(n)) onChange(clamp(n, MIN_SCALE, MAX_SCALE));
    else setDraft(display);
  };
  return (
    <label className="flex h-9 w-20 items-center gap-1 rounded-lg border border-slate-200 px-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
      <input
        id="export-scale-input"
        value={draft}
        dir="ltr"
        inputMode="decimal"
        aria-label={t('editor.exportDialog.scale')}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-full min-w-0 bg-transparent text-end text-sm tabular-nums outline-none"
        data-testid="export-scale-input"
      />
      <span className="text-sm text-slate-500">×</span>
    </label>
  );
}

function PageChecklist({
  pageIds,
  selected,
  onChange,
}: {
  pageIds: readonly string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const { t, formatNumber } = useI18n();
  const names = useEditorValue((e) => pageIds.map((id) => e.store.getPage(id)?.name ?? ''), [pageIds]);
  const all = pageIds.every((id) => selected.has(id));
  return (
    <div
      className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-1"
      data-testid="export-page-list"
    >
      <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={all}
          onChange={() => onChange(all ? new Set() : new Set(pageIds))}
          className="accent-brand-600"
        />
        {t('editor.exportDialog.selectAll')}
      </label>
      {pageIds.map((id, i) => (
        <label
          key={id}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50',
          )}
        >
          <input
            type="checkbox"
            checked={selected.has(id)}
            onChange={() => {
              const next = new Set(selected);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              onChange(next);
            }}
            className="accent-brand-600"
            data-testid="export-page-check"
          />
          <span>{t('editor.pages.page', { n: formatNumber(i + 1) })}</span>
          {names[i] ? (
            <span className="truncate text-slate-500" dir="auto">
              {names[i]}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
