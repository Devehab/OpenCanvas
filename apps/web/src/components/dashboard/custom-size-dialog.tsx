'use client';

import { inToPx, LIMITS, mmToPx } from '@opencanvas/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberField, SelectField } from '@/components/ui/fields';
import { useI18n } from '@/i18n';
import { createDesignAndOpen } from './create-design';

type Unit = 'px' | 'mm' | 'in';

export function CustomSizeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('px');
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const toPx = (v: number) => (unit === 'mm' ? mmToPx(v) : unit === 'in' ? inToPx(v) : Math.round(v));
  const pxW = toPx(width);
  const pxH = toPx(height);
  const min = 16;
  const max = LIMITS.maxPageDimension;
  const valid = pxW >= min && pxH >= min && pxW <= max && pxH <= max;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('custom.title')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid}
            data-testid="custom-create"
            onClick={() =>
              void createDesignAndOpen(router, { title: t('design.untitled'), width: pxW, height: pxH })
            }
          >
            {t('custom.create')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_1fr_6rem] items-end gap-3">
        <div className="space-y-1">
          <span className="text-xs font-medium text-slate-600">{t('custom.width')}</span>
          <NumberField
            label={t('custom.width')}
            value={width}
            onChange={setWidth}
            min={1}
            max={100000}
            digits={unit === 'px' ? 0 : 2}
            testId="custom-width"
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-slate-600">{t('custom.height')}</span>
          <NumberField
            label={t('custom.height')}
            value={height}
            onChange={setHeight}
            min={1}
            max={100000}
            digits={unit === 'px' ? 0 : 2}
            testId="custom-height"
          />
        </div>
        <SelectField
          label={t('custom.unit')}
          value={unit}
          onChange={(u) => setUnit(u)}
          options={[
            { value: 'px', label: 'px' },
            { value: 'mm', label: 'mm' },
            { value: 'in', label: 'in' },
          ]}
        />
      </div>
      {!valid ? <p className="mt-3 text-sm text-red-600">{t('custom.invalid', { min, max })}</p> : null}
      {unit !== 'px' && valid ? (
        <p className="mt-3 text-sm text-slate-500" dir="ltr">
          {pxW} × {pxH} px
        </p>
      ) : null}
    </Dialog>
  );
}
