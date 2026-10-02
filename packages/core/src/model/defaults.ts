import type {
  ImageAdjustments,
  PageRecord,
  Paragraph,
  SemanticInfo,
  Stroke,
  TextContent,
  TextStyle,
} from './types';

export const DEFAULT_FONT_FAMILY = 'Inter';
export const DEFAULT_TEXT_COLOR = '#111827';
export const DEFAULT_SHAPE_COLOR = '#6d5dfc';

export const DEFAULT_TEXT_STYLE: Readonly<TextStyle> = Object.freeze({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 32,
  fontWeight: 400,
  fontStyle: 'normal',
  color: DEFAULT_TEXT_COLOR,
  underline: false,
  strikethrough: false,
  letterSpacing: 0,
  textTransform: 'none',
});

export const DEFAULT_STROKE: Readonly<Stroke> = Object.freeze({
  color: '#000000',
  width: 2,
  style: 'solid',
  cap: 'butt',
  join: 'miter',
});

export const DEFAULT_IMAGE_ADJUSTMENTS: Readonly<ImageAdjustments> = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  grayscale: 0,
  sepia: 0,
  vignette: 0,
});

export const DEFAULT_SEMANTIC: Readonly<SemanticInfo> = Object.freeze({
  role: null,
  description: '',
  slot: null,
});

export const DEFAULT_PAGE_SIZE = Object.freeze({ width: 1080, height: 1080 });

export function emptyParagraph(): Paragraph {
  return { runs: [{ text: '', style: {} }], list: 'none', indent: 0 };
}

export function emptyTextContent(): TextContent {
  return { paragraphs: [emptyParagraph()] };
}

export const DEFAULT_PAGE_BACKGROUND: PageRecord['background'] = Object.freeze({
  type: 'solid',
  color: '#ffffff',
}) as PageRecord['background'];
