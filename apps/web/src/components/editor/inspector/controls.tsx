'use client';

import type { Fill, Shadow, Stroke } from '@opencanvas/core';
import { ColorField } from '@/components/ui/color-field';
import { NumberField, Segmented, SelectField, SliderField, Toggle } from '@/components/ui/fields';
import { useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';

/** Colors used in the document, for quick access in color pickers. */
export function useDocumentColors(): string[] {
  return useEditorValue((e) => {
    const colors = new Set<string>();
    for (const n of e.store.getNodes()) {
      const r = n as unknown as Record<string, unknown>;
      const fill = r.fill as Fill | null | undefined;
      if (fill?.type === 'solid') colors.add(fill.color);
      const stroke = r.stroke as Stroke | null | undefined;
      if (stroke) colors.add(stroke.color);
      if (n.type === 'text') colors.add(n.style.color);
      if (colors.size > 20) break;
    }
    return [...colors];
  });
}

export function FillControl({
  value,
  onChange,
  allowNone = true,
  testId,
}: {
  value: Fill | null;
  onChange: (fill: Fill | null, final: boolean) => void;
  allowNone?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const swatches = useDocumentColors();
  const mode = value?.type ?? 'none';
  const first = value?.type === 'solid' ? value.color : (value?.stops[0]?.color ?? '#6d5dfc');
  const last =
    value && value.type !== 'solid' ? (value.stops[value.stops.length - 1]?.color ?? '#ffffff') : '#db2777';
  const options = [
    ...(allowNone ? [{ value: 'none' as const, label: t('editor.inspector.noFill') }] : []),
    { value: 'solid' as const, label: t('editor.inspector.solidColor') },
    { value: 'linear-gradient' as const, label: t('editor.inspector.linearGradient') },
    { value: 'radial-gradient' as const, label: t('editor.inspector.radialGradient') },
  ];
  const setMode = (m: string) => {
    if (m === 'none') onChange(null, true);
    else if (m === 'solid') onChange({ type: 'solid', color: first }, true);
    else if (m === 'linear-gradient')
      onChange(
        {
          type: 'linear-gradient',
          angle: 90,
          stops: [
            { offset: 0, color: first },
            { offset: 1, color: last },
          ],
        },
        true,
      );
    else
      onChange(
        {
          type: 'radial-gradient',
          cx: 0.5,
          cy: 0.5,
          stops: [
            { offset: 0, color: first },
            { offset: 1, color: last },
          ],
        },
        true,
      );
  };
  return (
    <div className="space-y-2">
      <SelectField
        label={t('editor.inspector.fill')}
        hideLabel
        value={mode}
        options={options}
        onChange={setMode}
        testId={testId ? `${testId}-mode` : undefined}
      />
      {value?.type === 'solid' ? (
        <ColorField
          label={t('editor.inspector.color')}
          value={value.color}
          swatches={swatches}
          onChange={(c, final) => onChange({ type: 'solid', color: c }, final)}
          testId={testId ? `${testId}-color` : undefined}
        />
      ) : null}
      {value && value.type !== 'solid' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ColorField
              label={`${t('editor.inspector.color')} 1`}
              value={first}
              swatches={swatches}
              onChange={(c, final) =>
                onChange({ ...value, stops: [{ offset: 0, color: c }, ...value.stops.slice(1)] }, final)
              }
            />
            <ColorField
              label={`${t('editor.inspector.color')} 2`}
              value={last}
              swatches={swatches}
              onChange={(c, final) =>
                onChange({ ...value, stops: [...value.stops.slice(0, -1), { offset: 1, color: c }] }, final)
              }
            />
          </div>
          {value.type === 'linear-gradient' ? (
            <SliderField
              label={t('editor.inspector.angle')}
              value={value.angle}
              min={0}
              max={360}
              format={(v) => `${Math.round(v)}°`}
              onChange={(a) => onChange({ ...value, angle: a }, false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const DEFAULT_STROKE: Stroke = { color: '#111827', width: 2, style: 'solid', cap: 'butt', join: 'miter' };

export function StrokeControl({
  value,
  onChange,
  allowNone = true,
}: {
  value: Stroke | null;
  onChange: (stroke: Stroke | null, final: boolean) => void;
  allowNone?: boolean;
}) {
  const { t } = useI18n();
  const swatches = useDocumentColors();
  return (
    <div className="space-y-2">
      {allowNone ? (
        <Toggle
          label={t('editor.inspector.stroke')}
          checked={value !== null}
          onChange={(on) => onChange(on ? DEFAULT_STROKE : null, true)}
          testId="stroke-toggle"
        />
      ) : null}
      {value ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ColorField
              label={t('editor.inspector.color')}
              value={value.color}
              swatches={swatches}
              onChange={(c, final) => onChange({ ...value, color: c }, final)}
            />
            <NumberField
              label={t('editor.inspector.strokeWidth')}
              prefix="px"
              value={value.width}
              min={0}
              max={500}
              step={1}
              digits={1}
              onChange={(w) => onChange({ ...value, width: w }, true)}
            />
          </div>
          <Segmented
            label={t('editor.inspector.strokeStyle')}
            value={value.style}
            onChange={(style) => onChange({ ...value, style }, true)}
            options={[
              { value: 'solid', label: t('editor.inspector.solid') },
              { value: 'dashed', label: t('editor.inspector.dashed') },
              { value: 'dotted', label: t('editor.inspector.dotted') },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

const DEFAULT_SHADOW: Shadow = { color: '#0f172a40', offsetX: 0, offsetY: 8, blur: 20 };

export function ShadowControl({
  value,
  onChange,
}: {
  value: Shadow | null;
  onChange: (shadow: Shadow | null, final: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Toggle
        label={t('editor.inspector.shadow')}
        checked={value !== null}
        onChange={(on) => onChange(on ? DEFAULT_SHADOW : null, true)}
        testId="shadow-toggle"
      />
      {value ? (
        <>
          <ColorField
            label={t('editor.inspector.color')}
            value={value.color}
            onChange={(c, final) => onChange({ ...value, color: c }, final)}
          />
          <SliderField
            label={t('editor.inspector.offsetX')}
            value={value.offsetX}
            min={-100}
            max={100}
            onChange={(v) => onChange({ ...value, offsetX: v }, false)}
          />
          <SliderField
            label={t('editor.inspector.offsetY')}
            value={value.offsetY}
            min={-100}
            max={100}
            onChange={(v) => onChange({ ...value, offsetY: v }, false)}
          />
          <SliderField
            label={t('editor.inspector.blurAmount')}
            value={value.blur}
            min={0}
            max={150}
            onChange={(v) => onChange({ ...value, blur: v }, false)}
          />
        </>
      ) : null}
    </div>
  );
}
