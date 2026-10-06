'use client';

import { getUniformStyleValue, type TextEffect, type TextNode, type TextStyle } from '@opencanvas/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { NumberField, Segmented, SelectField, SliderField, Toggle } from '@/components/ui/fields';
import { Section } from '@/components/ui/section';
import { useToast } from '@/components/ui/toast';
import { useEditorContext } from '@/hooks/use-editor';
import { useFontCatalog } from '@/hooks/use-fonts';
import { useI18n } from '@/i18n';
import { syncCustomFonts } from '@/lib/custom-fonts';
import { fontErrorMessage } from '@/lib/font-errors';
import { FONT_ACCEPT } from '@/lib/font-files';
import { fontInfo, nearestWeight } from '@/lib/fonts';
import { addCustomFont } from '@/lib/storage/fonts';
import { cn } from '@/lib/utils';
import { useDocumentColors } from './controls';

/** Weights with a translated name (CSS weight keywords 100–900). */
const NAMED_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
type NamedWeight = (typeof NAMED_WEIGHTS)[number];
const isNamedWeight = (w: number): w is NamedWeight => (NAMED_WEIGHTS as readonly number[]).includes(w);

const FONT_GROUPS = ['custom', 'sans', 'serif', 'display', 'handwriting'] as const;

function FontPicker({ value, onChange }: { value: string | 'mixed'; onChange: (family: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const catalog = useFontCatalog();
  const upload = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<'all' | 'arabic'>('all');
  const fonts = catalog.filter((f) => filter === 'all' || f.arabic);
  const onUpload = async (files: File[]) => {
    let first: string | null = null;
    for (const file of files) {
      try {
        const font = await addCustomFont(file);
        first ??= font.family;
        toast(t('settings.fonts.added', { name: font.family }), 'success');
      } catch (error) {
        toast(fontErrorMessage(t, error, file.name), 'error');
      }
    }
    // Uploading from the picker applies the new font right away.
    if (first) {
      await syncCustomFonts();
      onChange(first);
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{t('editor.inspector.font')}</span>
        <Segmented
          label={t('editor.inspector.font')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Aa' },
            { value: 'arabic', label: 'عربي' },
          ]}
        />
      </div>
      <div className="flex gap-1.5">
        <select
          aria-label={t('editor.inspector.font')}
          data-testid="font-family"
          value={value === 'mixed' ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-brand-400"
          style={{ fontFamily: value === 'mixed' ? undefined : `"${value}"` }}
        >
          {value === 'mixed' ? <option value="">—</option> : null}
          {FONT_GROUPS.map((group) => {
            const list = fonts.filter((f) => f.category === group);
            if (list.length === 0) return null;
            return (
              <optgroup key={group} label={t(`editor.inspector.fontGroups.${group}`)}>
                {list.map((f) => (
                  <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>
                    {f.family}
                    {f.arabic && !f.custom ? ' · عربي' : ''}
                  </option>
                ))}
              </optgroup>
            );
          })}
          {value !== 'mixed' && !catalog.some((f) => f.family === value) ? (
            <option value={value}>{value}</option>
          ) : null}
        </select>
        <IconButton
          label={t('editor.inspector.uploadFont')}
          onClick={() => upload.current?.click()}
          className="size-9 shrink-0 border border-slate-200"
          data-testid="upload-font"
        >
          <Upload className="size-4" />
        </IconButton>
        <input
          ref={upload}
          type="file"
          accept={FONT_ACCEPT}
          multiple
          hidden
          data-testid="upload-font-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void onUpload(files);
          }}
        />
      </div>
    </div>
  );
}

export function TextSection({ nodes }: { nodes: TextNode[] }) {
  const { t } = useI18n();
  const { editor, viewRef } = useEditorContext();
  const swatches = useDocumentColors();
  const node = nodes[0]!;
  const ids = nodes.map((n) => n.id);
  const uniform = useMemo(
    () =>
      <K extends keyof TextStyle>(key: K): TextStyle[K] | 'mixed' => {
        let value: TextStyle[K] | 'mixed' | undefined;
        for (const n of nodes) {
          const v = getUniformStyleValue(n, key);
          if (value === undefined) value = v;
          else if (value !== v) return 'mixed';
        }
        return value!;
      },
    [nodes],
  );
  const setStyle = (style: Partial<TextStyle>, coalesce = false) => {
    if (editor.editingTextId && viewRef.current) {
      viewRef.current.applyTextStyle(style);
      return;
    }
    editor.execute(
      'text.set-style',
      { ids, style },
      { coalesceKey: coalesce ? `text-style:${Object.keys(style).join()}:${ids.join()}` : undefined },
    );
  };
  const setProps = (patch: Partial<TextNode>, coalesce = false) =>
    editor.updateSelected(patch as Record<string, unknown>, { coalesce });
  const family = uniform('fontFamily');
  const firstColor = node.content.paragraphs[0]?.runs[0]?.style.color ?? node.style.color;
  const weight = uniform('fontWeight');
  const info = typeof family === 'string' ? fontInfo(family) : undefined;
  const weights = info?.weights ?? [400, 700];
  const toggle = (key: 'underline' | 'strikethrough') => setStyle({ [key]: uniform(key) !== true });
  const isBold = weight !== 'mixed' && weight >= 600;
  const isItalic = uniform('fontStyle') === 'italic';
  const listStyle = node.content.paragraphs.every((p) => p.list === 'bullet')
    ? 'bullet'
    : node.content.paragraphs.every((p) => p.list === 'number')
      ? 'number'
      : 'none';
  const setList = (list: 'none' | 'bullet' | 'number') => {
    for (const n of nodes) {
      editor.execute('text.set-content', {
        id: n.id,
        content: {
          paragraphs: n.content.paragraphs.map((p) => ({ ...p, list: p.list === list ? 'none' : list })),
        },
      });
    }
  };
  const effect = node.effect;
  const effectType = effect?.type ?? 'none';
  const setEffect = (type: string) => {
    const defaults: Record<string, TextEffect | null> = {
      none: null,
      outline: { type: 'outline', color: '#000000', width: 2 },
      hollow: { type: 'hollow', width: 2 },
      background: { type: 'background', color: '#fde047', padding: 8, radius: 6 },
      neon: { type: 'neon', color: '#ec4899', intensity: 50 },
      echo: { type: 'echo', color: '#00000059', offsetX: 4, offsetY: 4 },
    };
    setProps({ effect: defaults[type] ?? null });
  };
  const styleButton = (
    active: boolean,
    label: string,
    onClick: () => void,
    icon: React.ReactNode,
    testId: string,
  ) => (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex h-8 flex-1 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100',
        active && 'bg-brand-100 text-brand-700 hover:bg-brand-100',
      )}
    >
      {icon}
    </button>
  );

  return (
    <Section title={t('editor.nodeTypes.text')}>
      <FontPicker
        value={family}
        onChange={(f) =>
          setStyle({ fontFamily: f, fontWeight: nearestWeight(f, weight === 'mixed' ? 400 : weight) })
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t('editor.inspector.fontSize')}
          prefix="px"
          value={uniform('fontSize')}
          min={1}
          max={4000}
          step={1}
          digits={1}
          onChange={(v) => setStyle({ fontSize: v })}
          testId="font-size"
        />
        <SelectField
          label={t('editor.inspector.fontWeight')}
          hideLabel
          value={weight === 'mixed' ? '' : String(weight)}
          options={weights.map((w) => ({
            value: String(w),
            label: isNamedWeight(w) ? t(`editor.inspector.weights.${w}`) : String(w),
          }))}
          onChange={(w) => setStyle({ fontWeight: Number(w) })}
        />
      </div>
      <div className="flex gap-1 rounded-lg bg-slate-50 p-0.5">
        {styleButton(
          isBold,
          t('editor.inspector.bold'),
          () =>
            setStyle({
              fontWeight: nearestWeight(typeof family === 'string' ? family : 'Inter', isBold ? 400 : 700),
            }),
          <Bold className="size-4" />,
          'text-bold',
        )}
        {styleButton(
          isItalic,
          t('editor.inspector.italic'),
          () => setStyle({ fontStyle: isItalic ? 'normal' : 'italic' }),
          <Italic className="size-4" />,
          'text-italic',
        )}
        {styleButton(
          uniform('underline') === true,
          t('editor.inspector.underline'),
          () => toggle('underline'),
          <Underline className="size-4" />,
          'text-underline',
        )}
        {styleButton(
          uniform('strikethrough') === true,
          t('editor.inspector.strikethrough'),
          () => toggle('strikethrough'),
          <Strikethrough className="size-4" />,
          'text-strike',
        )}
        {styleButton(
          listStyle === 'bullet',
          t('editor.inspector.bullets'),
          () => setList('bullet'),
          <List className="size-4" />,
          'text-bullets',
        )}
        {styleButton(
          listStyle === 'number',
          t('editor.inspector.numbers'),
          () => setList('number'),
          <ListOrdered className="size-4" />,
          'text-numbers',
        )}
      </div>
      <ColorField
        label={t('editor.inspector.color')}
        value={uniform('color') === 'mixed' ? firstColor : (uniform('color') as string)}
        mixed={uniform('color') === 'mixed'}
        swatches={swatches}
        onChange={(c, final) => setStyle({ color: c }, !final)}
        testId="text-color"
      />
      <Segmented
        label={t('editor.inspector.textAlign')}
        value={node.align}
        onChange={(align) => setProps({ align })}
        options={[
          { value: 'left', label: t('editor.inspector.textLeft'), icon: <AlignLeft className="size-4" /> },
          {
            value: 'center',
            label: t('editor.inspector.textCenter'),
            icon: <AlignCenter className="size-4" />,
          },
          { value: 'right', label: t('editor.inspector.textRight'), icon: <AlignRight className="size-4" /> },
          {
            value: 'justify',
            label: t('editor.inspector.textJustify'),
            icon: <AlignJustify className="size-4" />,
          },
        ]}
      />
      <SliderField
        label={t('editor.inspector.lineHeight')}
        value={node.lineHeight}
        min={0.5}
        max={3}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => setProps({ lineHeight: v }, true)}
      />
      <SliderField
        label={t('editor.inspector.letterSpacing')}
        value={uniform('letterSpacing') === 'mixed' ? 0 : (uniform('letterSpacing') as number)}
        min={-200}
        max={800}
        step={10}
        onChange={(v) => setStyle({ letterSpacing: v }, true)}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t('editor.inspector.case')}
          value={uniform('textTransform') === 'mixed' ? '' : (uniform('textTransform') as string)}
          onChange={(v) => setStyle({ textTransform: v as TextStyle['textTransform'] })}
          options={[
            { value: 'none', label: t('editor.inspector.caseNone') },
            { value: 'uppercase', label: t('editor.inspector.caseUpper') },
            { value: 'lowercase', label: t('editor.inspector.caseLower') },
          ]}
        />
        <SelectField
          label={t('editor.inspector.direction')}
          value={node.direction}
          onChange={(v) => setProps({ direction: v as TextNode['direction'] })}
          testId="text-direction"
          options={[
            { value: 'auto', label: t('editor.inspector.dirAuto') },
            { value: 'ltr', label: t('editor.inspector.dirLtr') },
            { value: 'rtl', label: t('editor.inspector.dirRtl') },
          ]}
        />
      </div>
      <SelectField
        label={t('editor.inspector.sizing')}
        value={node.sizing}
        onChange={(v) => setProps({ sizing: v as TextNode['sizing'] })}
        options={[
          { value: 'auto-width', label: t('editor.inspector.autoWidth') },
          { value: 'auto-height', label: t('editor.inspector.autoHeight') },
          { value: 'fixed', label: t('editor.inspector.fixed') },
        ]}
      />
      {node.sizing === 'fixed' ? (
        <Toggle
          label={t('editor.inspector.autoFit')}
          checked={node.autoFit}
          onChange={(v) => setProps({ autoFit: v })}
        />
      ) : null}
      <SelectField
        label={t('editor.inspector.textEffect')}
        value={effectType}
        onChange={setEffect}
        testId="text-effect"
        options={[
          { value: 'none', label: t('editor.inspector.effectNone') },
          { value: 'outline', label: t('editor.inspector.effectOutline') },
          { value: 'hollow', label: t('editor.inspector.effectHollow') },
          { value: 'background', label: t('editor.inspector.effectBackground') },
          { value: 'neon', label: t('editor.inspector.effectNeon') },
          { value: 'echo', label: t('editor.inspector.effectEcho') },
        ]}
      />
      {effect && 'color' in effect ? (
        <ColorField
          label={t('editor.inspector.color')}
          value={effect.color}
          swatches={swatches}
          onChange={(c, final) => setProps({ effect: { ...effect, color: c } }, !final)}
        />
      ) : null}
      {effect && 'width' in effect ? (
        <SliderField
          label={t('editor.inspector.thickness')}
          value={effect.width}
          min={0}
          max={20}
          step={0.5}
          onChange={(v) => setProps({ effect: { ...effect, width: v } }, true)}
        />
      ) : null}
      {effect?.type === 'neon' ? (
        <SliderField
          label={t('editor.inspector.intensity')}
          value={effect.intensity}
          min={0}
          max={100}
          onChange={(v) => setProps({ effect: { ...effect, intensity: v } }, true)}
        />
      ) : null}
      {effect?.type === 'background' ? (
        <>
          <SliderField
            label={t('editor.inspector.padding')}
            value={effect.padding}
            min={0}
            max={60}
            onChange={(v) => setProps({ effect: { ...effect, padding: v } }, true)}
          />
          <SliderField
            label={t('editor.inspector.roundness')}
            value={effect.radius}
            min={0}
            max={60}
            onChange={(v) => setProps({ effect: { ...effect, radius: v } }, true)}
          />
        </>
      ) : null}
      {effect?.type === 'echo' ? (
        <>
          <SliderField
            label={t('editor.inspector.offsetX')}
            value={effect.offsetX}
            min={-50}
            max={50}
            onChange={(v) => setProps({ effect: { ...effect, offsetX: v } }, true)}
          />
          <SliderField
            label={t('editor.inspector.offsetY')}
            value={effect.offsetY}
            min={-50}
            max={50}
            onChange={(v) => setProps({ effect: { ...effect, offsetY: v } }, true)}
          />
        </>
      ) : null}
    </Section>
  );
}
