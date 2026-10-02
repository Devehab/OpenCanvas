'use client';

import { DESIGN_FORMATS, LIMITS } from '@opencanvas/core';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberField } from '@/components/ui/fields';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';

export function ResizeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, formatNumber } = useI18n();
  const { editor } = useEditorContext();
  const page = useEditorValue((e) => e.store.getPage(e.pageId));
  const [width, setWidth] = useState(page?.width ?? 1080);
  const [height, setHeight] = useState(page?.height ?? 1080);
  const [mode, setMode] = useState<'scale' | 'keep'>('scale');
  useEffect(() => {
    if (open && page) {
      setWidth(page.width);
      setHeight(page.height);
    }
  }, [open, page]);
  if (!page) return null;
  const valid =
    width >= 16 && height >= 16 && width <= LIMITS.maxPageDimension && height <= LIMITS.maxPageDimension;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.resizeDialog.title')}
      description={t('editor.resizeDialog.current', {
        width: formatNumber(page.width),
        height: formatNumber(page.height),
      })}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid}
            data-testid="resize-apply"
            onClick={() => {
              editor.execute('document.resize', {
                width: Math.round(width),
                height: Math.round(height),
                mode,
              });
              editor.zoomToFit();
              onOpenChange(false);
            }}
          >
            {t('editor.resizeDialog.apply')}
          </Button>
        </>
      }
    >
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pe-1">
        {DESIGN_FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setWidth(f.width);
              setHeight(f.height);
            }}
            className={`rounded-lg border px-2.5 py-2 text-start text-sm ${f.width === width && f.height === height ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}
          >
            <span className="block font-medium text-slate-800">{t(`formats.${f.id}`)}</span>
            <span className="block text-xs text-slate-500" dir="ltr">
              {f.width} × {f.height}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField
          label={t('custom.width')}
          prefix={t('editor.inspector.width')}
          value={width}
          min={1}
          max={LIMITS.maxPageDimension}
          onChange={setWidth}
          testId="resize-width"
        />
        <NumberField
          label={t('custom.height')}
          prefix={t('editor.inspector.height')}
          value={height}
          min={1}
          max={LIMITS.maxPageDimension}
          onChange={setHeight}
          testId="resize-height"
        />
      </div>
      <fieldset className="mt-4 space-y-2 text-sm">
        {(['scale', 'keep'] as const).map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input
              type="radio"
              name="resize-mode"
              checked={mode === m}
              onChange={() => setMode(m)}
              className="accent-brand-600"
            />
            {t(`editor.resizeDialog.${m}`)}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
