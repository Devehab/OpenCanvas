'use client';

import { Slider as S } from 'radix-ui';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { clamp, cn, parseUserNumber, round } from '@/lib/utils';

/**
 * Numeric input that commits on Enter/blur, supports arrow keys (Shift ×10)
 * and shows a short prefix label (X, Y, W, H…).
 */
export function NumberField({
  label,
  prefix,
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  digits = 0,
  suffix,
  disabled,
  className,
  testId,
}: {
  label: string;
  prefix?: ReactNode;
  value: number | 'mixed';
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  suffix?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const display = value === 'mixed' ? '' : String(round(value, digits));
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(display);
  }, [display, focused]);
  const commit = (raw: string) => {
    const parsed = parseUserNumber(raw);
    if (Number.isFinite(parsed)) onChange(clamp(parsed, min, max));
    else setDraft(display);
  };
  return (
    <label
      className={cn(
        'flex h-8 min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100',
        disabled && 'opacity-50',
        className,
      )}
    >
      {prefix ? <span className="shrink-0 text-xs font-medium text-slate-500">{prefix}</span> : null}
      <input
        aria-label={label}
        data-testid={testId}
        inputMode="decimal"
        disabled={disabled}
        className="w-full min-w-0 bg-transparent text-slate-800 tabular-nums outline-none"
        dir="ltr"
        value={draft}
        placeholder={value === 'mixed' ? '—' : undefined}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = value === 'mixed' ? 0 : value;
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const next = clamp(round(base + delta, digits + 2), min, max);
            onChange(next);
            setDraft(String(round(next, digits)));
          } else if (e.key === 'Escape') {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix ? <span className="shrink-0 text-xs text-slate-500">{suffix}</span> : null}
    </label>
  );
}

/** Slider with a numeric readout; `onChange` fires continuously (callers coalesce history). */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(Math.round(v)),
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span id={id} className="font-medium text-slate-600">
          {label}
        </span>
        <span className="tabular-nums text-slate-500" dir="ltr">
          {format(value)}
        </span>
      </div>
      <S.Root
        className="relative flex h-4 touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0]!)}
        aria-labelledby={id}
        data-testid={testId}
      >
        <S.Track className="relative h-1 grow rounded-full bg-slate-200">
          <S.Range className="absolute h-full rounded-full bg-brand-500" />
        </S.Track>
        <S.Thumb
          className="block size-3.5 rounded-full border-2 border-brand-500 bg-white shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          aria-label={label}
        />
      </S.Root>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel,
  testId,
}: {
  label: string;
  value: T | '';
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  hideLabel?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-slate-600', hideLabel && 'sr-only')}>
        {label}
      </label>
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        {value === '' ? <option value="">—</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Single-choice button group with radio semantics: one tab stop, arrow keys
 * move the choice (following the visual direction in RTL layouts).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : 0;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step =
      e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
        ? 1
        : e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
          ? -1
          : 0;
    if (!step || options.length === 0) return;
    e.preventDefault();
    const next = (tabStop + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-lg bg-slate-100 p-0.5"
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        // biome-ignore lint/a11y/useSemanticElements: styled radio buttons following the WAI-ARIA radio group pattern
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          tabIndex={i === tabStop ? 0 : -1}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-7 flex-1 items-center justify-center rounded-md text-xs font-medium text-slate-600 transition-colors',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900',
          )}
        >
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[inset-inline-start]',
            checked ? 'start-[1.125rem]' : 'start-0.5',
          )}
        />
      </button>
    </label>
  );
}
