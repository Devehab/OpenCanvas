/**
 * The OpenCanvas document model.
 *
 * A design is NOT stored as an image. It is a flat store of immutable, typed
 * records (document, pages, nodes, assets). Every visual element is an
 * independent, editable node with its own geometry, style and semantics.
 *
 *   Document
 *    ├── Page (index "a0")
 *    │    ├── Node: shape   (parentId = page)
 *    │    ├── Node: group   (parentId = page)
 *    │    │    ├── Node: text  (parentId = group)
 *    │    │    └── Node: image (parentId = group)
 *    │    └── Node: frame   (clips its children)
 *    └── Page (index "a1")
 *
 * Hierarchy is expressed with `parentId` + a fractional `index` (sibling order,
 * back to front). There are no child arrays to keep in sync, so every structural
 * change is a change to individual records — the property that makes undo/redo,
 * version history and real-time collaboration tractable.
 *
 * Coordinates are CSS pixels (1px = 1/96 inch). A node's box is
 * `(x, y, width, height)` in its parent's coordinate space, rotated by
 * `rotation` degrees (clockwise) and flipped around the box center.
 */

export type Id = string;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

export interface ColorStop {
  /** 0–1 along the gradient. */
  offset: number;
  /** Canonical color (`#rrggbb` / `#rrggbbaa`). */
  color: string;
}

export interface SolidFill {
  type: 'solid';
  color: string;
}

export interface LinearGradientFill {
  type: 'linear-gradient';
  /** Degrees, CSS convention: 0 = bottom→top, 90 = left→right. */
  angle: number;
  stops: ColorStop[];
}

export interface RadialGradientFill {
  type: 'radial-gradient';
  /** Center, normalized to the node box (0–1). */
  cx: number;
  cy: number;
  stops: ColorStop[];
}

export type Fill = SolidFill | LinearGradientFill | RadialGradientFill;

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface Stroke {
  color: string;
  width: number;
  style: StrokeStyle;
  cap: LineCap;
  join: LineJoin;
}

export interface Shadow {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

// ---------------------------------------------------------------------------
// Semantics — what an element *means* in the design, not just what it looks like.
// Used by templates ("replace all photos"), accessibility and AI editing.
// ---------------------------------------------------------------------------

/** Well-known semantic roles. Any string is accepted; these are conventions. */
export const SEMANTIC_ROLES = [
  'background',
  'section',
  'headline',
  'subheadline',
  'body',
  'caption',
  'quote',
  'list',
  'cta',
  'button',
  'logo',
  'image',
  'hero-image',
  'product-image',
  'image-slot',
  'price',
  'badge',
  'icon',
  'decoration',
  'divider',
  'contact',
  'date',
] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number] | (string & {});

export interface SemanticInfo {
  /** e.g. `headline`, `cta`, `logo`, `hero-image`. */
  role: SemanticRole | null;
  /** Human/AI readable description; doubles as alt text for images. */
  description: string;
  /** Template slot identifier, e.g. `photo-1`, so content can be swapped while keeping layout. */
  slot: string | null;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface DocumentRecord {
  typeName: 'document';
  id: 'document';
  title: string;
  /** Design format preset this document was created from (e.g. `instagram-post`), if any. */
  formatId: string | null;
  meta: Record<string, JsonValue>;
}

export interface PageRecord {
  typeName: 'page';
  id: Id;
  index: string;
  name: string;
  width: number;
  height: number;
  background: Fill;
  /** Presenter / page notes. */
  notes: string;
  meta: Record<string, JsonValue>;
}

export type AssetKind = 'image';

export interface AssetRecord {
  typeName: 'asset';
  id: Id;
  kind: AssetKind;
  name: string;
  mimeType: string;
  /** Intrinsic pixel size. */
  width: number;
  height: number;
  /** Byte size of the original file. */
  size: number;
  /** Content hash (`sha256-<hex>`). Binary data is content-addressed and stored outside the document. */
  hash: string;
  /** Remote URL once uploaded, otherwise null (resolved locally by hash). */
  src: string | null;
}

export interface BaseNode<T extends string = string> {
  typeName: 'node';
  id: Id;
  type: T;
  /** Page id or container node id (group/frame). */
  parentId: Id;
  /** Fractional order key among siblings; higher = in front. */
  index: string;
  /** User-facing layer name. Empty string means "derive from content". */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise, around the box center. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** 0–1. */
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  shadow: Shadow | null;
  /** Layer blur radius in px (0 = none). */
  blur: number;
  semantic: SemanticInfo | null;
  /** Free-form data for plugins and integrations. */
  meta: Record<string, JsonValue>;
}

export const SHAPE_KINDS = [
  'rect',
  'ellipse',
  'triangle',
  'right-triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'polygon',
  'star',
  'arrow-right',
  'arrow-left',
  'chevron',
  'cross',
  'heart',
  'speech-bubble',
  'parallelogram',
  'trapezoid',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface ShapeNode extends BaseNode<'shape'> {
  shape: ShapeKind;
  fill: Fill | null;
  stroke: Stroke | null;
  cornerRadius: number;
  /** Number of sides (`polygon`) or points (`star`). */
  sides: number;
  /** Inner radius ratio for `star` (0.1–0.95). */
  innerRatio: number;
}

export const ARROW_HEADS = ['none', 'arrow', 'triangle', 'circle', 'square', 'bar'] as const;
export type ArrowHead = (typeof ARROW_HEADS)[number];

/**
 * A straight line from the left-middle to the right-middle of its box:
 * length = `width`, angle = `rotation`. `height` tracks the stroke width so the
 * box always encloses the visible stroke.
 */
export interface LineNode extends BaseNode<'line'> {
  stroke: Stroke;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Arbitrary vector path (icons, imported SVG paths, freehand). Scaled from `viewBox` into the node box. */
export interface PathNode extends BaseNode<'path'> {
  /** SVG path data. */
  path: string;
  viewBox: ViewBox;
  fill: Fill | null;
  stroke: Stroke | null;
  fillRule: 'nonzero' | 'evenodd';
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type TextDirection = 'auto' | 'ltr' | 'rtl';
export type TextTransform = 'none' | 'uppercase' | 'lowercase';
/**
 * - `auto-width`: the box grows to fit the text, no wrapping (except explicit line breaks).
 * - `auto-height`: fixed width, wraps; height grows to fit.
 * - `fixed`: fixed width and height; optionally shrinks the font to fit (`autoFit`).
 */
export type TextSizing = 'auto-width' | 'auto-height' | 'fixed';
export type ListStyle = 'none' | 'bullet' | 'number';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  /** 100–900. */
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  underline: boolean;
  strikethrough: boolean;
  /** Thousandths of an em (Canva-style); 0 = normal. */
  letterSpacing: number;
  textTransform: TextTransform;
}

export interface TextRun {
  text: string;
  /** Overrides of the node's base style for this run. */
  style: Partial<TextStyle>;
}

export interface Paragraph {
  runs: TextRun[];
  list: ListStyle;
  /** List nesting level 0–4. */
  indent: number;
}

export interface TextContent {
  paragraphs: Paragraph[];
}

export type TextEffect =
  | { type: 'outline'; color: string; width: number }
  | { type: 'hollow'; width: number }
  | { type: 'background'; color: string; padding: number; radius: number }
  | { type: 'neon'; color: string; intensity: number }
  | { type: 'echo'; color: string; offsetX: number; offsetY: number };

export interface TextNode extends BaseNode<'text'> {
  content: TextContent;
  /** Base style; runs override individual properties. */
  style: TextStyle;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  direction: TextDirection;
  /** Line height multiplier (e.g. 1.4). */
  lineHeight: number;
  /** Extra space after each paragraph, in px. */
  paragraphSpacing: number;
  sizing: TextSizing;
  /** Shrink font to fit the box (`sizing: 'fixed'` only). */
  autoFit: boolean;
  effect: TextEffect | null;
}

export interface Crop {
  /** Visible region of the source image, normalized 0–1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAdjustments {
  /** −100…100 */
  brightness: number;
  /** −100…100 */
  contrast: number;
  /** −100…100 */
  saturation: number;
  /** −180…180 degrees */
  hue: number;
  /** −100…100 (negative = cooler, positive = warmer) */
  temperature: number;
  /** 0…100 */
  grayscale: number;
  /** 0…100 */
  sepia: number;
  /** 0…100 */
  vignette: number;
}

export interface ImageNode extends BaseNode<'image'> {
  assetId: Id;
  crop: Crop;
  cornerRadius: number;
  stroke: Stroke | null;
  adjustments: ImageAdjustments;
}

/** Logical grouping; transforms (move, scale, rotate) apply to all children. Bounds follow children. */
export interface GroupNode extends BaseNode<'group'> {}

/** Container with explicit bounds that can clip its children (also used as image placeholders). */
export interface FrameNode extends BaseNode<'frame'> {
  shape: ShapeKind;
  fill: Fill | null;
  stroke: Stroke | null;
  cornerRadius: number;
  clipContent: boolean;
}

export type NodeRecord = ShapeNode | LineNode | PathNode | TextNode | ImageNode | GroupNode | FrameNode;
export type NodeType = NodeRecord['type'];
export type ContainerNode = GroupNode | FrameNode;

export type NodeOfType<T extends NodeType> = Extract<NodeRecord, { type: T }>;

export type AnyRecord = DocumentRecord | PageRecord | NodeRecord | AssetRecord;
export type RecordTypeName = AnyRecord['typeName'];

export const NODE_TYPES: readonly NodeType[] = ['shape', 'line', 'path', 'text', 'image', 'group', 'frame'];

export const isNode = (r: AnyRecord | undefined | null): r is NodeRecord => r?.typeName === 'node';
export const isPage = (r: AnyRecord | undefined | null): r is PageRecord => r?.typeName === 'page';
export const isAsset = (r: AnyRecord | undefined | null): r is AssetRecord => r?.typeName === 'asset';
export const isContainer = (r: AnyRecord | undefined | null): r is ContainerNode =>
  r?.typeName === 'node' && (r.type === 'group' || r.type === 'frame');
export const isNodeOfType = <T extends NodeType>(
  r: AnyRecord | undefined | null,
  type: T,
): r is NodeOfType<T> => r?.typeName === 'node' && r.type === type;

/** Distributive Omit that preserves the discriminated union. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Distributive Partial update for node records. */
export type NodePatch<T extends NodeRecord = NodeRecord> = Partial<
  DistributiveOmit<T, 'id' | 'typeName' | 'type'>
>;
