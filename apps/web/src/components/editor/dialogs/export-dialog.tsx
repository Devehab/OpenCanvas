'use client';

import { resolvePageRange } from '@opencanvas/export';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberField, SliderField, Toggle } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { type ExportType, runExport } from '@/lib/export-runner';
import { cn, downloadBytes, round } from '@/lib/utils';

const TYPES: ExportType[] = ['png', 'jpeg', 'webp', 'svg', 'pdf', 'pdfPrint', 'opencanvas'];
/** Design units are CSS pixels: 96 per inch. */
const DESIGN_DPI = 96;
const MIN_DPI = 24;
const MAX_DPI = 600;
const MAX_SLIDER_SCALE = 4;

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
  const [type, setType] = useState<ExportType>('png');
  const [pagesMode, setPagesMode] = useState<'all' | 'current' | 'range'>('all');
  const [range, setRange] = useState('');
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const pageIds = useEditorValue((e) => e.store.getPageIds());
  const page = useEditorValue((e) => e.store.getPage(e.pageId));
  const raster = type === 'png' || type === 'jpeg' || type === 'webp';
  const supportsTransparency = type === 'png' || type === 'webp' || type === 'svg';
  const isPackage = type === 'opencanvas';

  let selected: string[] = [];
  let rangeError = false;
  try {
    selected =
      pagesMode === 'all'
        ? [...pageIds]
        : pagesMode === 'current'
          ? [editor.pageId]
          : resolvePageRange(pageIds, range);
  } catch {
    rangeError = true;
  }

  const start = async () => {
    if (rangeError || selected.length === 0) return;
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
        },
        (done, total) => setBusy({ done, total }),
      );
      downloadBytes(result.data, result.fileName, result.mimeType);
      toast(t('editor.exportDialog.done'), 'success');
      onOpenChange(false);
    } catch (error) {
      toast(t('editor.exportDialog.failed', { reason: (error as Error).message }), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={t('editor.exportDialog.title')}
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={!!busy || rangeError}
          onClick={() => void start()}
          data-testid="export-start"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? t('editor.exportDialog.preparing') : t('editor.exportDialog.download')}
        </Button>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">
            {t('editor.exportDialog.fileType')}
          </legend>
          <div className="grid gap-1.5" role="radiogroup">
            {TYPES.map((ty) => (
              <label
                key={ty}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-2.5',
                  type === ty ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="export-type"
                  value={ty}
                  checked={type === ty}
                  onChange={() => setType(ty)}
                  className="mt-1 accent-brand-600"
                  data-testid={`export-type-${ty}`}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {t(`editor.exportDialog.types.${ty}`)}
                  </span>
                  <span className="block text-xs text-slate-600">{t(`editor.exportDialog.hints.${ty}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {isPackage ? null : (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">
              {t('editor.exportDialog.pages')}
            </legend>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={pagesMode}
              onChange={(e) => setPagesMode(e.target.value as typeof pagesMode)}
              aria-label={t('editor.exportDialog.pages')}
              data-testid="export-pages"
            >
              <option value="all">{t('editor.exportDialog.allPages', { count: pageIds.length })}</option>
              <option value="current">{t('editor.exportDialog.currentPage')}</option>
              <option value="range">{t('editor.exportDialog.customRange')}</option>
            </select>
            {pagesMode === 'range' ? (
              <input
                className={cn(
                  'h-9 w-full rounded-md border px-2 text-sm',
                  rangeError && range ? 'border-red-400' : 'border-slate-200',
                )}
                placeholder={t('editor.exportDialog.rangeHint')}
                aria-label={t('editor.exportDialog.customRange')}
                value={range}
                dir="ltr"
                onChange={(e) => setRange(e.target.value)}
              />
            ) : null}
            {raster && selected.length > 1 ? (
              <p className="text-xs text-slate-500">{t('editor.exportDialog.multipleZip')}</p>
            ) : null}
          </fieldset>
        )}
        {raster && page ? (
          <>
            <SliderField
              label={t('editor.exportDialog.size')}
              value={Math.min(scale, MAX_SLIDER_SCALE)}
              min={0.25}
              max={MAX_SLIDER_SCALE}
              step={0.25}
              testId="export-scale"
              format={() =>
                `${formatNumber(round(scale, 3))}× · ${formatNumber(Math.round(page.width * scale))} × ${formatNumber(Math.round(page.height * scale))} px`
              }
              onChange={setScale}
            />
            {type !== 'webp' ? (
              <NumberField
                label={t('editor.exportDialog.dpi')}
                prefix={t('editor.exportDialog.dpi')}
                value={round(DESIGN_DPI * scale, 1)}
                min={MIN_DPI}
                max={MAX_DPI}
                digits={1}
                testId="export-dpi"
                onChange={(dpi) => setScale(dpi / DESIGN_DPI)}
              />
            ) : null}
          </>
        ) : null}
        {type === 'jpeg' || type === 'webp' ? (
          <SliderField
            label={t('editor.exportDialog.quality')}
            value={quality}
            min={10}
            max={100}
            format={(v) => `${Math.round(v)}%`}
            onChange={setQuality}
          />
        ) : null}
        {supportsTransparency ? (
          <Toggle
            label={t('editor.exportDialog.transparent')}
            checked={transparent}
            onChange={setTransparent}
            testId="export-transparent"
          />
        ) : null}
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
      </div>
    </Dialog>
  );
}
