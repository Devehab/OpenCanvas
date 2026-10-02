/**
 * Runtime validation (zod) for every record type.
 *
 * Schemas fill in defaults, so partial input — from templates, imports, plugins
 * or AI-generated designs — is normalized into complete records. Anything that
 * crosses a trust boundary (file import, paste, network, AI output) must go
 * through these schemas before entering a store.
 */
import { z } from 'zod';
import { CANONICAL_COLOR_PATTERN, normalizeColor } from '../color';
import { isValidOrderKey } from '../fractional-index';
import { isValidId } from '../ids';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_IMAGE_ADJUSTMENTS,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_STROKE,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_STYLE,
} from './defaults';
import { LIMITS } from './limits';
import {
  type AnyRecord,
  ARROW_HEADS,
  type AssetRecord,
  BLEND_MODES,
  type DocumentRecord,
  type FrameNode,
  type GroupNode,
  type ImageNode,
  type LineNode,
  type NodeRecord,
  type PageRecord,
  type PathNode,
  SHAPE_KINDS,
  type ShapeNode,
  type TextNode,
} from './types';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const IdSchema = z.string().refine((v) => isValidId(v), 'Invalid id');
export const OrderKeySchema = z.string().refine((v) => isValidOrderKey(v), 'Invalid order key');

/** Accepts any CSS-ish color (hex, rgb(), hsl(), a few names) and normalizes it to canonical hex. */
export const ColorSchema = z
  .string()
  .max(64)
  .refine((v) => normalizeColor(v) !== null, 'Invalid color')
  .transform((v) => normalizeColor(v)!);

/** Strict canonical color (used where input has already been normalized). */
export const CanonicalColorSchema = z.string().regex(CANONICAL_COLOR_PATTERN);

const coordinate = z.number().min(-LIMITS.maxCoordinate).max(LIMITS.maxCoordinate);
const dimension = z.number().min(0).max(LIMITS.maxNodeDimension);
const unit = z.number().min(0).max(1);

const JsonMetaSchema = z
  .record(z.string().max(128), z.json())
  .refine((v) => JSON.stringify(v).length <= LIMITS.maxMetaBytes, 'Metadata too large')
  .default({});

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

export const ColorStopSchema = z.object({ offset: unit, color: ColorSchema });

const stops = z.array(ColorStopSchema).min(1).max(LIMITS.maxGradientStops);

export const FillSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: ColorSchema }),
  z.object({ type: z.literal('linear-gradient'), angle: z.number().default(90), stops }),
  z.object({
    type: z.literal('radial-gradient'),
    cx: z.number().min(-10).max(10).default(0.5),
    cy: z.number().min(-10).max(10).default(0.5),
    stops,
  }),
]);

export const StrokeSchema = z.object({
  color: ColorSchema.default(DEFAULT_STROKE.color),
  width: z.number().min(0).max(LIMITS.maxStrokeWidth).default(DEFAULT_STROKE.width),
  style: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
  cap: z.enum(['butt', 'round', 'square']).default('butt'),
  join: z.enum(['miter', 'round', 'bevel']).default('miter'),
});

export const ShadowSchema = z.object({
  color: ColorSchema.default('#00000040'),
  offsetX: z.number().min(-10_000).max(10_000).default(0),
  offsetY: z.number().min(-10_000).max(10_000).default(4),
  blur: z.number().min(0).max(LIMITS.maxBlur).default(12),
});

export const SemanticSchema = z.object({
  role: z.string().max(64).nullable().default(null),
  description: z.string().max(LIMITS.maxDescriptionLength).default(''),
  slot: z.string().max(64).nullable().default(null),
});

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export const DocumentRecordSchema = z.object({
  typeName: z.literal('document'),
  id: z.literal('document'),
  title: z.string().max(LIMITS.maxTitleLength).default('Untitled design'),
  formatId: z.string().max(64).nullable().default(null),
  meta: JsonMetaSchema,
});

export const PageRecordSchema = z.object({
  typeName: z.literal('page'),
  id: IdSchema,
  index: OrderKeySchema,
  name: z.string().max(LIMITS.maxNameLength).default(''),
  width: z.number().min(LIMITS.minPageDimension).max(LIMITS.maxPageDimension).default(1080),
  height: z.number().min(LIMITS.minPageDimension).max(LIMITS.maxPageDimension).default(1080),
  background: FillSchema.default({ type: 'solid', color: '#ffffff' }),
  notes: z.string().max(LIMITS.maxNotesLength).default(''),
  meta: JsonMetaSchema,
});

export const AssetRecordSchema = z.object({
  typeName: z.literal('asset'),
  id: IdSchema,
  kind: z.literal('image').default('image'),
  name: z.string().max(LIMITS.maxNameLength).default(''),
  mimeType: z.string().max(128),
  width: z.number().int().min(1).max(100_000),
  height: z.number().int().min(1).max(100_000),
  size: z.number().int().min(0),
  hash: z.string().regex(/^sha256-[0-9a-f]{64}$/, 'Invalid content hash'),
  src: z.string().max(4096).nullable().default(null),
});

const baseNodeShape = {
  typeName: z.literal('node'),
  id: IdSchema,
  parentId: IdSchema,
  index: OrderKeySchema,
  name: z.string().max(LIMITS.maxNameLength).default(''),
  x: coordinate.default(0),
  y: coordinate.default(0),
  width: dimension.default(100),
  height: dimension.default(100),
  rotation: z.number().min(-36_000).max(36_000).default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  opacity: unit.default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  blendMode: z.enum(BLEND_MODES).default('normal'),
  shadow: ShadowSchema.nullable().default(null),
  blur: z.number().min(0).max(LIMITS.maxBlur).default(0),
  semantic: SemanticSchema.nullable().default(null),
  meta: JsonMetaSchema,
};

const cornerRadius = z.number().min(0).max(LIMITS.maxCornerRadius).default(0);

export const ShapeNodeSchema = z.object({
  ...baseNodeShape,
  type: z.literal('shape'),
  shape: z.enum(SHAPE_KINDS).default('rect'),
  fill: FillSchema.nullable().default({ type: 'solid', color: DEFAULT_SHAPE_COLOR }),
  stroke: StrokeSchema.nullable().default(null),
  cornerRadius,
  sides: z.number().int().min(3).max(64).default(5),
  innerRatio: z.number().min(0.05).max(0.95).default(0.5),
});

export const LineNodeSchema = z.object({
  ...baseNodeShape,
  type: z.literal('line'),
  height: dimension.default(4),
  stroke: StrokeSchema.default({ color: '#1f2937', width: 4, style: 'solid', cap: 'round', join: 'round' }),
  startArrow: z.enum(ARROW_HEADS).default('none'),
  endArrow: z.enum(ARROW_HEADS).default('none'),
});

export const ViewBoxSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().positive().default(24),
  height: z.number().positive().default(24),
});

export const PathNodeSchema = z.object({
  ...baseNodeShape,
  type: z.literal('path'),
  path: z.string().max(LIMITS.maxPathDataLength).default(''),
  viewBox: ViewBoxSchema.default({ x: 0, y: 0, width: 24, height: 24 }),
  fill: FillSchema.nullable().default({ type: 'solid', color: '#1f2937' }),
  stroke: StrokeSchema.nullable().default(null),
  fillRule: z.enum(['nonzero', 'evenodd']).default('nonzero'),
});

export const TextStyleSchema = z.object({
  fontFamily: z.string().min(1).max(LIMITS.maxFontFamilyLength).default(DEFAULT_FONT_FAMILY),
  fontSize: z.number().min(LIMITS.minFontSize).max(LIMITS.maxFontSize).default(DEFAULT_TEXT_STYLE.fontSize),
  fontWeight: z.number().int().min(1).max(1000).default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  color: ColorSchema.default(DEFAULT_TEXT_COLOR),
  underline: z.boolean().default(false),
  strikethrough: z.boolean().default(false),
  letterSpacing: z.number().min(-500).max(2000).default(0),
  textTransform: z.enum(['none', 'uppercase', 'lowercase']).default('none'),
});

/** Run-level overrides: every property optional, no defaults. */
export const TextStyleOverridesSchema = z
  .object({
    fontFamily: z.string().min(1).max(LIMITS.maxFontFamilyLength),
    fontSize: z.number().min(LIMITS.minFontSize).max(LIMITS.maxFontSize),
    fontWeight: z.number().int().min(1).max(1000),
    fontStyle: z.enum(['normal', 'italic']),
    color: ColorSchema,
    underline: z.boolean(),
    strikethrough: z.boolean(),
    letterSpacing: z.number().min(-500).max(2000),
    textTransform: z.enum(['none', 'uppercase', 'lowercase']),
  })
  .partial();

export const TextRunSchema = z.object({
  text: z.string().max(LIMITS.maxTextLength),
  style: TextStyleOverridesSchema.default({}),
});

export const ParagraphSchema = z.object({
  runs: z.array(TextRunSchema).max(LIMITS.maxRunsPerParagraph).default([]),
  list: z.enum(['none', 'bullet', 'number']).default('none'),
  indent: z.number().int().min(0).max(4).default(0),
});

export const TextContentSchema = z
  .object({
    paragraphs: z.array(ParagraphSchema).min(1).max(LIMITS.maxParagraphs),
  })
  .refine(
    (c) =>
      c.paragraphs.reduce((n, p) => n + p.runs.reduce((m, r) => m + r.text.length, 0), 0) <=
      LIMITS.maxTextLength,
    'Text too long',
  );

export const TextEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('outline'),
    color: ColorSchema.default('#000000'),
    width: z.number().min(0).max(200).default(2),
  }),
  z.object({ type: z.literal('hollow'), width: z.number().min(0).max(200).default(2) }),
  z.object({
    type: z.literal('background'),
    color: ColorSchema.default('#fde047'),
    padding: z.number().min(0).max(500).default(8),
    radius: z.number().min(0).max(500).default(6),
  }),
  z.object({
    type: z.literal('neon'),
    color: ColorSchema.default('#22d3ee'),
    intensity: z.number().min(0).max(100).default(50),
  }),
  z.object({
    type: z.literal('echo'),
    color: ColorSchema.default('#00000059'),
    offsetX: z.number().min(-500).max(500).default(4),
    offsetY: z.number().min(-500).max(500).default(4),
  }),
]);

export const TextNodeSchema = z.object({
  ...baseNodeShape,
  type: z.literal('text'),
  content: TextContentSchema.default({
    paragraphs: [{ runs: [{ text: '', style: {} }], list: 'none', indent: 0 }],
  }),
  style: TextStyleSchema.default({ ...DEFAULT_TEXT_STYLE }),
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  direction: z.enum(['auto', 'ltr', 'rtl']).default('auto'),
  lineHeight: z.number().min(0.5).max(5).default(1.4),
  paragraphSpacing: z.number().min(0).max(10_000).default(0),
  sizing: z.enum(['auto-width', 'auto-height', 'fixed']).default('auto-height'),
  autoFit: z.boolean().default(false),
  effect: TextEffectSchema.nullable().default(null),
});

export const CropSchema = z
  .object({ x: unit, y: unit, width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) })
  .refine((c) => c.x + c.width <= 1 + 1e-9 && c.y + c.height <= 1 + 1e-9, 'Crop must lie within the image');

const adjustment = (min: number, max: number) => z.number().min(min).max(max).default(0);

export const ImageAdjustmentsSchema = z.object({
  brightness: adjustment(-100, 100),
  contrast: adjustment(-100, 100),
  saturation: adjustment(-100, 100),
  hue: adjustment(-180, 180),
  temperature: adjustment(-100, 100),
  grayscale: adjustment(0, 100),
  sepia: adjustment(0, 100),
  vignette: adjustment(0, 100),
});

export const ImageNodeSchema = z.object({
  ...baseNodeShape,
  type: z.literal('image'),
  assetId: IdSchema,
  crop: CropSchema.default({ x: 0, y: 0, width: 1, height: 1 }),
  cornerRadius,
  stroke: StrokeSchema.nullable().default(null),
  adjustments: ImageAdjustmentsSchema.default({ ...DEFAULT_IMAGE_ADJUSTMENTS }),
});

export const GroupNodeSchema = z.object({ ...baseNodeShape, type: z.literal('group') });

export const FrameNodeSchema = z.object({
  ...baseNodeShape,
  type: z.literal('frame'),
  shape: z.enum(SHAPE_KINDS).default('rect'),
  fill: FillSchema.nullable().default(null),
  stroke: StrokeSchema.nullable().default(null),
  cornerRadius,
  clipContent: z.boolean().default(true),
});

export const NodeRecordSchema = z.discriminatedUnion('type', [
  ShapeNodeSchema,
  LineNodeSchema,
  PathNodeSchema,
  TextNodeSchema,
  ImageNodeSchema,
  GroupNodeSchema,
  FrameNodeSchema,
]);

export const AnyRecordSchema = z.discriminatedUnion('typeName', [
  DocumentRecordSchema,
  PageRecordSchema,
  AssetRecordSchema,
  // Nodes are a nested discriminated union on `type`.
  z.looseObject({ typeName: z.literal('node') }),
]);

// Compile-time checks that schema outputs match the hand-written model types.
type Assignable<A, B> = [A] extends [B] ? true : false;
type Check<T extends true> = T;
export type _SchemaChecks = [
  Check<Assignable<z.output<typeof DocumentRecordSchema>, DocumentRecord>>,
  Check<Assignable<z.output<typeof PageRecordSchema>, PageRecord>>,
  Check<Assignable<z.output<typeof AssetRecordSchema>, AssetRecord>>,
  Check<Assignable<z.output<typeof ShapeNodeSchema>, ShapeNode>>,
  Check<Assignable<z.output<typeof LineNodeSchema>, LineNode>>,
  Check<Assignable<z.output<typeof PathNodeSchema>, PathNode>>,
  Check<Assignable<z.output<typeof TextNodeSchema>, TextNode>>,
  Check<Assignable<z.output<typeof ImageNodeSchema>, ImageNode>>,
  Check<Assignable<z.output<typeof GroupNodeSchema>, GroupNode>>,
  Check<Assignable<z.output<typeof FrameNodeSchema>, FrameNode>>,
];

export class ValidationError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(message: string, issues: { path: string; message: string }[]) {
    super(
      `${message}${issues.length ? `: ${issues.map((i) => `${i.path || '<root>'} ${i.message}`).join('; ')}` : ''}`,
    );
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

function toIssues(error: z.ZodError, prefix = ''): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    message: issue.message,
  }));
}

/** Parses and normalizes a single record. Throws {@link ValidationError}. */
export function parseRecord(input: unknown, context = 'record'): AnyRecord {
  const head = AnyRecordSchema.safeParse(input);
  if (!head.success) throw new ValidationError(`Invalid ${context}`, toIssues(head.error, context));
  if (head.data.typeName === 'node') return parseNode(input, context);
  return head.data as AnyRecord;
}

/** Parses and normalizes a node record. Throws {@link ValidationError}. */
export function parseNode(input: unknown, context = 'node'): NodeRecord {
  const result = NodeRecordSchema.safeParse(input);
  if (!result.success) throw new ValidationError(`Invalid ${context}`, toIssues(result.error, context));
  return result.data as NodeRecord;
}

export function safeParseRecord(
  input: unknown,
): { ok: true; record: AnyRecord } | { ok: false; error: ValidationError } {
  try {
    return { ok: true, record: parseRecord(input) };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error };
    throw error;
  }
}
