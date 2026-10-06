'use client';

import { normalizeColor, toCssColor } from '@opencanvas/core';
import { Pipette } from 'lucide-react';
import { Popover } from 'radix-ui';
import { createContext, useContext, useEffect, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export const DEFAULT_SWATCHES = [
  '#000000',
  '#545454',
  '#a6a6a6',
  '#ffffff',
  '#ff3131',
  '#ff66c4',
  '#cb6ce6',
  '#8c52ff',
  '#5e17eb',
  '#0097b2',
  '#0cc0df',
  '#5ce1e6',
  '#38b6ff',
  '#004aad',
  '#00bf63',
  '#7ed957',
  '#c1ff72',
  '#ffde59',
  '#ffbd59',
  '#ff914d',
];

/** The active brand kit's colors, shown first in every color picker inside the editor. */
export const BrandColorsContext = createContext<readonly string[]>([]);

interface EyeDropperResult {
  sRGBHex: string;
}

export function ColorSwatch({ color, size = 'md' }: { color: string | null; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'oc-checker relative inline-block shrink-0 overflow-hidden rounded-md border border-slate-300',
        size === 'sm' ? 'size-5' : 'size-7',
      )}
      aria-hidden
    >
      <span className="absolute inset-0" style={{ background: color ? toCssColor(color) : 'transparent' }} />
    </span>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  swatches = [],
  mixed = false,
  testId,
}: {
  label: string;
  value: string;
  /** The selection has several colors; `value` is the first one. */
  mixed?: boolean;
  onChange: (color: string, final: boolean) => void;
  /** Colors already used in the document, shown first. */
  swatches?: readonly string[];
  testId?: string;
}) {
  const { t } = useI18n();
  const brandColors = useContext(BrandColorsContext);
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const commitHex = (raw: string) => {
    const normalized = normalizeColor(raw.startsWith('#') || !/^[0-9a-f]{3,8}$/i.test(raw) ? raw : `#${raw}`);
    if (normalized) onChange(normalized, true);
    else setHex(value);
  };
  return (
    <Popover.Root>
      <Popover.Trigger
        className="flex h-8 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-1.5 text-sm text-slate-700 hover:border-slate-300"
        aria-label={label}
        data-testid={testId}
      >
        <ColorSwatch color={value} size="sm" />
        {mixed ? (
          <span>{t('common.mixed')}</span>
        ) : (
          <span className="tabular-nums uppercase" dir="ltr">
            {value.slice(0, 7)}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-60 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          aria-label={label}
        >
          <div className="oc-colorful">
            <HexAlphaColorPicker
              color={value}
              onChange={(c) => onChange(normalizeColor(c) ?? c, false)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label={`${label} (hex)`}
              className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-sm uppercase outline-none focus:border-brand-400"
              dir="ltr"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitHex((e.target as HTMLInputElement).value)}
            />
            {hasEyeDropper ? (
              <button
                type="button"
                aria-label={t('common.pickColor')}
                title={t('common.pickColor')}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50"
                onClick={async () => {
                  try {
                    const dropper = new (
                      window as unknown as { EyeDropper: new () => { open(): Promise<EyeDropperResult> } }
                    ).EyeDropper();
                    const result = await dropper.open();
                    const c = normalizeColor(result.sRGBHex);
                    if (c) onChange(c, true);
                  } catch {
                    // cancelled
                  }
                }}
              >
                <Pipette className="size-4" />
              </button>
            ) : null}
          </div>
          {[brandColors, swatches, DEFAULT_SWATCHES].map((list, i) =>
            list.length ? (
              <div
                key={['brand', 'document', 'defaults'][i]}
                className="grid grid-cols-10 gap-1"
                data-testid={i === 0 ? 'brand-swatches' : undefined}
              >
                {[...new Set(list)].slice(0, 20).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    title={c}
                    onClick={() => onChange(c, true)}
                    className={cn('rounded-md ring-offset-1', c === value && 'ring-2 ring-brand-500')}
                  >
                    <ColorSwatch color={c} size="sm" />
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
