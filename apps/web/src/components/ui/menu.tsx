'use client';

import { Check, ChevronRight } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn, shortcut as formatShortcut } from '@/lib/utils';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

const contentClass =
  'z-50 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-800 shadow-xl data-[state=open]:animate-in';

export function MenuContent({
  children,
  align = 'start',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'end' | 'center';
  className?: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={6} className={cn(contentClass, className)}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-slate-100';

export function MenuItem({
  children,
  icon,
  shortcut,
  onSelect,
  disabled,
  danger,
  testId,
}: {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <DropdownMenu.Item
      className={cn(itemClass, danger && 'text-red-600')}
      onSelect={onSelect}
      disabled={disabled}
      data-testid={testId}
    >
      <span className="flex size-4 items-center justify-center text-slate-500">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut ? (
        <span className="text-xs text-slate-500" dir="ltr">
          {formatShortcut(shortcut)}
        </span>
      ) : null}
    </DropdownMenu.Item>
  );
}

export function MenuCheckItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <DropdownMenu.CheckboxItem className={itemClass} checked={checked} onCheckedChange={onCheckedChange}>
      <span className="flex size-4 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

/** Menu item showing a check when it is the current choice (radio-like). */
export function MenuRadioItem({
  children,
  checked,
  icon,
  onSelect,
  testId,
}: {
  children: ReactNode;
  checked: boolean;
  icon?: ReactNode;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <DropdownMenu.CheckboxItem
      className={itemClass}
      checked={checked}
      onSelect={onSelect}
      data-testid={testId}
      role="menuitemradio"
    >
      <span className="flex size-4 items-center justify-center text-slate-500">{icon}</span>
      <span className="flex-1">{children}</span>
      <span className="flex size-4 items-center justify-center text-brand-600">
        <DropdownMenu.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenu.ItemIndicator>
      </span>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2 py-1 text-xs font-semibold text-slate-500">
      {children}
    </DropdownMenu.Label>
  );
}

export function SubMenu({
  label,
  icon,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={itemClass}>
        <span className="flex size-4 items-center justify-center text-slate-500">{icon}</span>
        <span className="flex-1">{label}</span>
        <ChevronRight className="size-4 text-slate-400 rtl:rotate-180" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={4} className={contentClass}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
