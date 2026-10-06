'use client';

/** "Add guides": column and grid presets (like Canva) or a custom grid. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberField } from '@/components/ui/fields';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { type GuideGrid, type GuidePreset, gridGuides, presetGrid } from '@/lib/guides';
import { cn } from '@/lib/utils';

const PRESETS: GuidePreset[] = ['12-columns', '3-columns', '3x3', 'custom'];

function Preview({ grid, width, height }: { grid: GuideGrid; width: number; height: number }) {
  const guides = gridGuides(grid, width, height);
  const box = 64;
  const scale = box / Math.max(width, height);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: width * scale, height: height * scale }}
      className="rounded-md bg-white shadow-sm"
      aria-hidden
    >
      {guides.map((g) =>
        g.axis === 'x' ? (
          <line
            key={`x${g.position}`}
            x1={g.position}
            x2={g.position}
            y1={0}
            y2={height}
            stroke="#a855f7"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <line
            key={`y${g.position}`}
            y1={g.position}
            y2={g.position}
            x1={0}
            x2={width}
            stroke="#a855f7"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </svg>
  );
}

export function GuidesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const page = useEditorValue((e) => e.store.getPage(e.pageId));
  const [preset, setPreset] = useState<GuidePreset>('12-columns');
  const [custom, setCustom] = useState<GuideGrid>({ columns: 2, rows: 2, gutter: 20, margin: 40 });
  useEffect(() => {
    if (open) setPreset('12-columns');
  }, [open]);
  if (!page) return null;
  const gridFor = (p: GuidePreset) => (p === 'custom' ? custom : presetGrid(p, page.width));
  const apply = () => {
    editor.updatePage(
      page.id,
      { guides: gridGuides(gridFor(preset), page.width, page.height) },
      'Add guides',
    );
    editor.state.set({ rulers: true });
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.rulers.addGuides')}
      description={t('editor.rulers.addGuidesHint')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={apply} data-testid="apply-guides">
            {t('editor.rulers.addGuides')}
          </Button>
        </>
      }
    >
      <fieldset className="grid grid-cols-4 gap-2">
        <legend className="sr-only">{t('editor.rulers.layout')}</legend>
        {PRESETS.map((p) => (
          <label
            key={p}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 bg-slate-50 p-2 text-center text-xs font-medium text-slate-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300',
              preset === p ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:border-slate-200',
            )}
          >
            <input
              type="radio"
              name="guide-preset"
              value={p}
              checked={preset === p}
              onChange={() => setPreset(p)}
              className="sr-only"
              data-testid={`guides-${p}`}
            />
            <span className="flex size-16 items-center justify-center">
              <Preview grid={gridFor(p)} width={page.width} height={page.height} />
            </span>
            {t(`editor.rulers.presets.${p}`)}
          </label>
        ))}
      </fieldset>
      {preset === 'custom' ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(['columns', 'rows', 'gutter', 'margin'] as const).map((key) => (
            <div key={key} className="space-y-1">
              <span className="text-xs font-medium text-slate-600">{t(`editor.rulers.${key}`)}</span>
              <NumberField
                label={t(`editor.rulers.${key}`)}
                value={custom[key]}
                min={key === 'columns' || key === 'rows' ? 1 : 0}
                max={key === 'columns' || key === 'rows' ? 24 : Math.min(page.width, page.height) / 2}
                onChange={(v) => setCustom((c) => ({ ...c, [key]: Math.round(v) }))}
                testId={`guides-${key}`}
              />
            </div>
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}
