/**
 * Conversion between the document's rich text model and the DOM used by the
 * in-place text editor (a contenteditable element). Only a safe subset of
 * formatting is recognized; everything else is ignored.
 */
import {
  normalizeTextContent,
  type Paragraph,
  type TextContent,
  type TextRun,
  type TextStyle,
} from '@opencanvas/core';

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** CSS declarations for a run's style overrides. */
export function runStyleCss(style: Partial<TextStyle>): string {
  const css: string[] = [];
  if (style.fontFamily) css.push(`font-family:"${style.fontFamily.replace(/["\\<>]/g, '')}"`);
  if (style.fontSize) css.push(`font-size:${style.fontSize}px`);
  if (style.fontWeight) css.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle) css.push(`font-style:${style.fontStyle}`);
  if (style.color) css.push(`color:${style.color}`);
  if (style.letterSpacing !== undefined) css.push(`letter-spacing:${style.letterSpacing / 1000}em`);
  if (style.textTransform) css.push(`text-transform:${style.textTransform}`);
  const decorations = [style.underline ? 'underline' : '', style.strikethrough ? 'line-through' : ''].filter(
    Boolean,
  );
  if (style.underline !== undefined || style.strikethrough !== undefined)
    css.push(`text-decoration:${decorations.join(' ') || 'none'}`);
  return css.join(';');
}

export function textContentToHtml(content: TextContent): string {
  return content.paragraphs
    .map((p) => {
      const runs = p.runs
        .map((r) => {
          const text = escapeHtml(r.text).replace(/\u2028/g, '<br>');
          const css = runStyleCss(r.style);
          return css ? `<span style="${escapeHtml(css)}">${text}</span>` : text;
        })
        .join('');
      const empty = p.runs.every((r) => r.text.length === 0);
      const attrs = [
        `dir="auto"`,
        p.list !== 'none' ? `data-list="${p.list}"` : '',
        p.indent ? `data-indent="${p.indent}"` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<div ${attrs}>${empty ? '<br>' : runs}</div>`;
    })
    .join('');
}

interface Ctx {
  style: Partial<TextStyle>;
}

function parseCssStyle(el: HTMLElement, base: Partial<TextStyle>): Partial<TextStyle> {
  const s = el.style;
  const out: Partial<TextStyle> = { ...base };
  if (s.fontWeight) {
    const w =
      s.fontWeight === 'bold' ? 700 : s.fontWeight === 'normal' ? 400 : Number.parseInt(s.fontWeight, 10);
    if (Number.isFinite(w)) out.fontWeight = w;
  }
  if (s.fontStyle) out.fontStyle = s.fontStyle === 'italic' ? 'italic' : 'normal';
  if (s.fontSize && s.fontSize.endsWith('px')) {
    const v = Number.parseFloat(s.fontSize);
    if (Number.isFinite(v) && v > 0) out.fontSize = v;
  }
  if (s.fontFamily)
    out.fontFamily = s.fontFamily
      .split(',')[0]!
      .trim()
      .replace(/^["']|["']$/g, '');
  if (s.color) out.color = s.color;
  const deco = s.textDecorationLine || s.textDecoration;
  if (deco) {
    out.underline = deco.includes('underline');
    out.strikethrough = deco.includes('line-through');
  }
  return out;
}

function styleForElement(el: HTMLElement, base: Partial<TextStyle>): Partial<TextStyle> {
  let style = { ...base };
  switch (el.tagName) {
    case 'B':
    case 'STRONG':
      style.fontWeight = 700;
      break;
    case 'I':
    case 'EM':
      style.fontStyle = 'italic';
      break;
    case 'U':
      style.underline = true;
      break;
    case 'S':
    case 'STRIKE':
    case 'DEL':
      style.strikethrough = true;
      break;
    case 'FONT': {
      const color = el.getAttribute('color');
      if (color) style.color = color;
      break;
    }
  }
  if (el.getAttribute('style')) style = parseCssStyle(el, style);
  return style;
}

/**
 * Reads the editor DOM back into TextContent. `base` is the node's base style;
 * run overrides equal to it are pruned by normalization.
 */
export function htmlToTextContent(root: HTMLElement, base: TextStyle): TextContent {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  const ensure = (block?: HTMLElement): Paragraph => {
    if (!current) {
      const list = block?.getAttribute('data-list');
      const indent = Number(block?.getAttribute('data-indent') ?? 0);
      current = {
        runs: [],
        list: list === 'bullet' || list === 'number' ? list : 'none',
        indent: Number.isFinite(indent) ? Math.max(0, Math.min(4, indent)) : 0,
      };
      paragraphs.push(current);
    }
    return current;
  };
  const closeParagraph = () => {
    current = null;
  };
  const pushText = (text: string, ctx: Ctx, block?: HTMLElement) => {
    if (!text) return;
    const p = ensure(block);
    p.runs.push({ text: text.replace(/\u00a0/g, ' '), style: { ...ctx.style } } as TextRun);
  };

  const walk = (node: Node, ctx: Ctx, block?: HTMLElement) => {
    if (node.nodeType === 3) {
      pushText(node.nodeValue ?? '', ctx, block);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      // A <br> that is the last child of a block is the browser's empty-line placeholder.
      const isPlaceholder =
        !el.nextSibling && el.parentElement !== root && BLOCK_TAGS.has(el.parentElement?.tagName ?? '');
      if (!isPlaceholder) ensure(block).runs.push({ text: '\u2028', style: { ...ctx.style } });
      else ensure(block);
      return;
    }
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    const isBlock = BLOCK_TAGS.has(el.tagName);
    const style = styleForElement(el, ctx.style);
    if (isBlock) {
      closeParagraph();
      ensure(el);
      for (const child of Array.from(el.childNodes)) walk(child, { style }, el);
      closeParagraph();
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child, { style }, block);
  };

  for (const child of Array.from(root.childNodes)) walk(child, { style: {} });
  if (paragraphs.length === 0) paragraphs.push({ runs: [{ text: '', style: {} }], list: 'none', indent: 0 });
  // Trailing soft breaks at paragraph ends come from browser quirks; drop them.
  for (const p of paragraphs) {
    const last = p.runs[p.runs.length - 1];
    if (
      last &&
      last.text.endsWith('\u2028') &&
      p.runs
        .map((r) => r.text)
        .join('')
        .replace(/\u2028/g, '').length > 0
    ) {
      last.text = last.text.replace(/\u2028+$/, '');
    }
  }
  return normalizeTextContent({ paragraphs }, base);
}
