'use client';

import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented control built on native radio inputs (keyboard and screen-reader
 * behavior for free).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  testId?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn('flex rounded-lg bg-slate-100 p-0.5', className)} data-testid={testId}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-center font-medium text-slate-600 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === option.value && 'bg-white text-slate-900 shadow-sm',
            option.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.icon}
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
