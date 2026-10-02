'use client';

import type { AnyNodeProps } from '@opencanvas/core';
import { TEXT_PRESETS } from '@opencanvas/editor';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { ELEMENT_DRAG_TYPE } from '../side-panel';

/** Preview size per preset kind (Arabic presets share the Latin kind). */
const SIZE_CLASSES: Record<string, string> = {
  heading: 'text-2xl font-bold',
  subheading: 'text-lg font-semibold',
  body: 'text-sm',
};

export function TextPanel() {
  const { t, locale } = useI18n();
  const { editor } = useEditorContext();
  const insert = (props: AnyNodeProps) => {
    const ids = editor.insertNodes([props]);
    if (ids[0]) editor.select(ids);
  };
  const latin = TEXT_PRESETS.filter((p) => !p.id.startsWith('arabic-'));
  const arabic = TEXT_PRESETS.filter((p) => p.id.startsWith('arabic-'));
  const labelFor: Record<string, string> = {
    heading: t('editor.textPanel.heading'),
    subheading: t('editor.textPanel.subheading'),
    body: t('editor.textPanel.body'),
    'arabic-heading': t('editor.textPanel.arabicHeading'),
    'arabic-body': t('editor.textPanel.arabicBody'),
  };
  const groups = locale === 'ar' ? [arabic, latin] : [latin, arabic];
  return (
    <div className="space-y-4 p-4 pt-10">
      <Button
        variant="primary"
        className="w-full"
        data-testid="add-text-box"
        onClick={() =>
          insert({ ...TEXT_PRESETS.find((p) => p.id === (locale === 'ar' ? 'arabic-body' : 'body'))!.props })
        }
      >
        <Type className="size-4" />
        {t('editor.textPanel.add')}
      </Button>
      {groups.map((group) => (
        <div key={group === arabic ? 'arabic' : 'latin'} className="space-y-2">
          {group === arabic ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('editor.textPanel.arabic')}
            </h3>
          ) : null}
          {group.map((preset) => {
            const isArabic = preset.id.startsWith('arabic-');
            return (
              <button
                key={preset.id}
                type="button"
                draggable
                data-testid={`text-preset-${preset.id}`}
                onDragStart={(e) => e.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify(preset.props))}
                onClick={() => insert(preset.props)}
                dir={isArabic ? 'rtl' : 'ltr'}
                className={cn(
                  'block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-start hover:border-brand-300 hover:bg-brand-50',
                  SIZE_CLASSES[preset.id.replace(/^arabic-/, '')] ?? 'text-sm',
                )}
                style={{ fontFamily: isArabic ? 'Cairo, sans-serif' : 'Inter, sans-serif' }}
              >
                {labelFor[preset.id]}
              </button>
            );
          })}
        </div>
      ))}
      <p className="text-xs text-slate-500">{t('editor.textPanel.tip')}</p>
    </div>
  );
}
