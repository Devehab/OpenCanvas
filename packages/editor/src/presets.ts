/**
 * Element presets offered by the editor UI (text styles, shapes, lines).
 * Each preset is plain node props, so it is also what templates and AI produce.
 */
import type { AnyNodeProps, ShapeKind, TextStyle } from '@opencanvas/core';

export interface TextPreset {
  id: 'heading' | 'subheading' | 'body' | 'arabic-heading' | 'arabic-body';
  label: string;
  props: AnyNodeProps;
}

const textProps = (
  text: string,
  style: Partial<TextStyle>,
  extra: Record<string, unknown> = {},
): AnyNodeProps =>
  ({
    type: 'text',
    sizing: 'auto-width',
    content: { paragraphs: [{ runs: [{ text, style: {} }], list: 'none', indent: 0 }] },
    style: { fontFamily: 'Inter', color: '#111827', ...style },
    ...extra,
  }) as AnyNodeProps;

export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: 'heading',
    label: 'Add a heading',
    props: textProps(
      'Add a heading',
      { fontSize: 64, fontWeight: 700 },
      { semantic: { role: 'headline', description: '', slot: null } },
    ),
  },
  {
    id: 'subheading',
    label: 'Add a subheading',
    props: textProps(
      'Add a subheading',
      { fontSize: 36, fontWeight: 600 },
      { semantic: { role: 'subheadline', description: '', slot: null } },
    ),
  },
  {
    id: 'body',
    label: 'Add a little bit of body text',
    props: textProps(
      'Add a little bit of body text',
      { fontSize: 22, fontWeight: 400 },
      { semantic: { role: 'body', description: '', slot: null } },
    ),
  },
  {
    id: 'arabic-heading',
    label: 'أضف عنوانًا',
    props: textProps(
      'أضف عنوانًا',
      { fontFamily: 'Cairo', fontSize: 64, fontWeight: 700 },
      { align: 'right', semantic: { role: 'headline', description: '', slot: null } },
    ),
  },
  {
    id: 'arabic-body',
    label: 'أضف نصًا',
    props: textProps(
      'أضف نصًا قصيرًا هنا',
      { fontFamily: 'Cairo', fontSize: 24 },
      { align: 'right', semantic: { role: 'body', description: '', slot: null } },
    ),
  },
];

export const SHAPE_PRESETS: readonly { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Square' },
  { kind: 'ellipse', label: 'Circle' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'right-triangle', label: 'Right triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'octagon', label: 'Octagon' },
  { kind: 'star', label: 'Star' },
  { kind: 'heart', label: 'Heart' },
  { kind: 'arrow-right', label: 'Arrow right' },
  { kind: 'arrow-left', label: 'Arrow left' },
  { kind: 'chevron', label: 'Chevron' },
  { kind: 'cross', label: 'Cross' },
  { kind: 'speech-bubble', label: 'Speech bubble' },
  { kind: 'parallelogram', label: 'Parallelogram' },
  { kind: 'trapezoid', label: 'Trapezoid' },
];

export function shapeProps(kind: ShapeKind, size = 200): AnyNodeProps {
  const wide =
    kind === 'arrow-right' || kind === 'arrow-left' || kind === 'chevron' || kind === 'parallelogram';
  return {
    type: 'shape',
    shape: kind,
    width: wide ? size * 1.4 : size,
    height: size,
    sides: kind === 'star' ? 5 : 6,
    fill: { type: 'solid', color: '#6d5dfc' },
  } as AnyNodeProps;
}

export const LINE_PRESETS = [
  {
    id: 'line',
    label: 'Line',
    props: {
      type: 'line',
      width: 300,
      height: 4,
      stroke: { color: '#111827', width: 4, style: 'solid', cap: 'round', join: 'round' },
    },
  },
  {
    id: 'dashed',
    label: 'Dashed line',
    props: {
      type: 'line',
      width: 300,
      height: 4,
      stroke: { color: '#111827', width: 4, style: 'dashed', cap: 'butt', join: 'round' },
    },
  },
  {
    id: 'dotted',
    label: 'Dotted line',
    props: {
      type: 'line',
      width: 300,
      height: 4,
      stroke: { color: '#111827', width: 4, style: 'dotted', cap: 'round', join: 'round' },
    },
  },
  {
    id: 'arrow',
    label: 'Arrow',
    props: {
      type: 'line',
      width: 300,
      height: 4,
      endArrow: 'triangle',
      stroke: { color: '#111827', width: 4, style: 'solid', cap: 'round', join: 'round' },
    },
  },
  {
    id: 'double-arrow',
    label: 'Double arrow',
    props: {
      type: 'line',
      width: 300,
      height: 4,
      startArrow: 'arrow',
      endArrow: 'arrow',
      stroke: { color: '#111827', width: 4, style: 'solid', cap: 'round', join: 'round' },
    },
  },
] as const satisfies readonly { id: string; label: string; props: Record<string, unknown> }[];

export function framePreset(kind: ShapeKind = 'rect', size = 300): AnyNodeProps {
  return {
    type: 'frame',
    shape: kind,
    width: size,
    height: size,
    fill: { type: 'solid', color: '#e5e7eb' },
    clipContent: true,
    semantic: { role: 'image-slot', description: '', slot: null },
  } as AnyNodeProps;
}
