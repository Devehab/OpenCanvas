'use client';

import { DESIGN_FORMATS, type DesignFormat } from '@opencanvas/core';
import { Ruler } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { createDesignAndOpen } from './create-design';
import { CustomSizeDialog } from './custom-size-dialog';

export const FEATURED_FORMATS = [
  'presentation',
  'instagram-post',
  'instagram-story',
  'youtube-thumbnail',
  'a4',
  'poster',
  'facebook-post',
  'logo',
  'business-card',
];

/** Proportional preview rectangle for a format. */
function FormatShape({ format }: { format: DesignFormat }) {
  const max = 44;
  const ratio = format.width / format.height;
  const w = ratio >= 1 ? max : max * ratio;
  const h = ratio >= 1 ? max / ratio : max;
  return (
    <span className="flex size-14 items-center justify-center" aria-hidden>
      <span className="rounded-[4px] border-2 border-brand-400 bg-brand-50" style={{ width: w, height: h }} />
    </span>
  );
}

export function FormatGrid({ formats, onCreated }: { formats?: readonly string[]; onCreated?: () => void }) {
  const { t, formatNumber } = useI18n();
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  const list = (formats ?? DESIGN_FORMATS.map((f) => f.id))
    .map((id) => DESIGN_FORMATS.find((f) => f.id === id)!)
    .filter(Boolean);
  const create = async (format: DesignFormat) => {
    onCreated?.();
    await createDesignAndOpen(router, {
      title: t(`formats.${format.id}`),
      width: format.width,
      height: format.height,
      format,
    });
  };
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((format) => (
          <li key={format.id}>
            <button
              type="button"
              data-testid={`format-${format.id}`}
              onClick={() => void create(format)}
              className="group flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <FormatShape format={format} />
              <span className="text-sm font-medium text-slate-800">{t(`formats.${format.id}`)}</span>
              <span className="text-xs text-slate-500" dir="ltr">
                {format.physical
                  ? `${formatNumber(format.physical.width)} × ${formatNumber(format.physical.height)} ${format.physical.unit}`
                  : `${formatNumber(format.width)} × ${formatNumber(format.height)} px`}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            data-testid="format-custom"
            onClick={() => setCustomOpen(true)}
            className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="flex size-14 items-center justify-center text-brand-500">
              <Ruler className="size-7" />
            </span>
            <span className="text-sm font-medium text-slate-800">{t('home.customSize')}</span>
          </button>
        </li>
      </ul>
      <CustomSizeDialog open={customOpen} onOpenChange={setCustomOpen} />
    </>
  );
}
