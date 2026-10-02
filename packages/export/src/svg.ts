/**
 * Vector SVG export.
 *
 * Walks the document tree and emits equivalent SVG: transforms, gradients,
 * strokes/dashes, clipping frames, group opacity, blend modes, shadows and
 * blur filters, cropped images and text positioned with the SAME layout the
 * canvas uses (each fragment carries its own direction, so Arabic and mixed
 * bidi text keep their shaping and order in any SVG viewer).
 */
import {
  colorAlpha,
  type DocumentStore,
  type Fill,
  getFrameClipPath,
  getImageClipPath,
  getLocalTransform,
  getShapeNodePath,
  type Id,
  type ImageNode,
  type LineNode,
  layoutText,
  type Mat,
  type NodeRecord,
  opaqueHex,
  type PathCommand,
  pathToSvg,
  type Stroke,
  type TextMeasurer,
  type TextNode,
  textLayoutInput,
} from '@opencanvas/core';
import { arrowSize, dashPattern, linearGradientLine, radialGradientRadius } from '@opencanvas/renderer';

export interface SvgExportOptions {
  measurer: TextMeasurer;
  /** Returns an href (data: URL or https URL) for an image node; may encode adjusted pixels. */
  resolveImage: (node: ImageNode) => Promise<string | null> | string | null;
  /** Include the page background. Default true. */
  background?: boolean;
  /** Extra CSS (e.g. @font-face rules) placed in a <style> element. */
  css?: string;
  /** Prefix for generated ids (avoid collisions when inlining several SVGs). */
  idPrefix?: string;
}

const num = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function escapeXml(value: string): string {
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are invalid in XML and must be stripped
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  );
}

const matrix = (m: Mat) => `matrix(${num(m.a)} ${num(m.b)} ${num(m.c)} ${num(m.d)} ${num(m.e)} ${num(m.f)})`;

/** Color + opacity attributes (SVG 1.1 viewers ignore 8-digit hex, so alpha is split out). */
function paintAttrs(kind: 'fill' | 'stroke', color: string): string {
  const alpha = colorAlpha(color);
  return `${kind}="${opaqueHex(color)}"${alpha < 1 ? ` ${kind}-opacity="${num(alpha)}"` : ''}`;
}

class SvgBuilder {
  private defs: string[] = [];
  private nextId = 1;
  constructor(private readonly prefix: string) {}

  id(kind: string): string {
    return `${this.prefix}${kind}${this.nextId++}`;
  }

  addDef(def: string): void {
    this.defs.push(def);
  }

  defsXml(): string {
    return this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '';
  }

  /** Fill attributes for a paint over the box (ox, oy, w, h). */
  fill(fill: Fill | null, w: number, h: number, ox = 0, oy = 0): string {
    if (!fill) return 'fill="none"';
    if (fill.type === 'solid') return paintAttrs('fill', fill.color);
    const id = this.id('g');
    const stops = fill.stops
      .map((s) => {
        const a = colorAlpha(s.color);
        return `<stop offset="${num(s.offset)}" stop-color="${opaqueHex(s.color)}"${a < 1 ? ` stop-opacity="${num(a)}"` : ''}/>`;
      })
      .join('');
    if (fill.type === 'linear-gradient') {
      const g = linearGradientLine(fill.angle, w, h);
      this.addDef(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(g.x0 + ox)}" y1="${num(g.y0 + oy)}" x2="${num(g.x1 + ox)}" y2="${num(g.y1 + oy)}">${stops}</linearGradient>`,
      );
    } else {
      const cx = fill.cx * w;
      const cy = fill.cy * h;
      const r = radialGradientRadius(cx, cy, w, h);
      this.addDef(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(cx + ox)}" cy="${num(cy + oy)}" r="${num(r)}">${stops}</radialGradient>`,
      );
    }
    return `fill="url(#${id})"`;
  }

  stroke(stroke: Stroke | null): string {
    if (!stroke || stroke.width <= 0) return '';
    const dash = dashPattern(stroke.style, stroke.width);
    const cap = stroke.style === 'dotted' ? 'round' : stroke.cap;
    return [
      paintAttrs('stroke', stroke.color),
      `stroke-width="${num(stroke.width)}"`,
      cap !== 'butt' ? `stroke-linecap="${cap}"` : '',
      stroke.join !== 'miter' ? `stroke-linejoin="${stroke.join}"` : '',
      dash.length ? `stroke-dasharray="${dash.map(num).join(' ')}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  clipPath(commands: readonly PathCommand[]): string {
    const id = this.id('c');
    this.addDef(`<clipPath id="${id}"><path d="${pathToSvg(commands)}"/></clipPath>`);
    return id;
  }

  /** Filter for shadow and/or layer blur, in the node's local units. */
  filter(node: NodeRecord): string | null {
    if (!node.shadow && node.blur <= 0) return null;
    const id = this.id('f');
    const parts: string[] = [];
    if (node.blur > 0)
      parts.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${num(node.blur)}" result="blurred"/>`);
    const source = node.blur > 0 ? 'blurred' : 'SourceGraphic';
    if (node.shadow) {
      const s = node.shadow;
      parts.push(
        `<feDropShadow in="${source}" dx="${num(s.offsetX)}" dy="${num(s.offsetY)}" stdDeviation="${num(s.blur / 2)}" flood-color="${opaqueHex(s.color)}" flood-opacity="${num(colorAlpha(s.color))}"/>`,
      );
    }
    this.addDef(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${parts.join('')}</filter>`,
    );
    return id;
  }
}

function fontFamilyAttr(fontFamily: string): string {
  return `${fontFamily.replace(/["'<>&]/g, '')}, "Noto Sans Arabic", sans-serif`;
}

function textNodeSvg(b: SvgBuilder, node: TextNode, measurer: TextMeasurer): string {
  const layout = layoutText(textLayoutInput(node), measurer);
  const effect = node.effect;
  const out: string[] = [];
  if (effect?.type === 'background') {
    for (const line of layout.lines) {
      const items = line.marker ? [line.marker, ...line.fragments] : line.fragments;
      if (items.length === 0) continue;
      const minX = Math.min(...items.map((f) => f.x));
      const maxX = Math.max(...items.map((f) => f.x + f.width));
      const size = Math.max(...items.map((f) => f.style.fontSize));
      const pad = effect.padding;
      out.push(
        `<rect x="${num(minX - pad)}" y="${num(line.baseline - size * 0.9 - pad * 0.5)}" width="${num(maxX - minX + pad * 2)}" height="${num(size * 1.2 + pad)}" rx="${num(effect.radius)}" ${paintAttrs('fill', effect.color)}/>`,
      );
    }
  }
  const glowId = effect?.type === 'neon' ? b.id('f') : null;
  if (glowId && effect?.type === 'neon') {
    const sigma = node.style.fontSize * (0.15 + effect.intensity / 250);
    b.addDef(
      `<filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${num(sigma)}"/></filter>`,
    );
  }
  for (const line of layout.lines) {
    const items = line.marker ? [line.marker, ...line.fragments] : line.fragments;
    for (const f of items) {
      const s = f.style;
      // Anchor each fragment at its center: correct regardless of how a viewer
      // interprets text-anchor for right-to-left text.
      const cx = f.x + f.width / 2;
      const attrs = [
        `font-family="${escapeXml(fontFamilyAttr(s.fontFamily))}"`,
        `font-size="${num(s.fontSize)}"`,
        s.fontWeight !== 400 ? `font-weight="${s.fontWeight}"` : '',
        s.fontStyle === 'italic' ? 'font-style="italic"' : '',
        s.letterSpacing ? `letter-spacing="${num(s.letterSpacing)}"` : '',
        f.direction === 'rtl' ? 'direction="rtl" unicode-bidi="embed"' : '',
        'text-anchor="middle"',
      ]
        .filter(Boolean)
        .join(' ');
      const text = escapeXml(f.text);
      const at = (dx: number, dy: number) => `x="${num(cx + dx)}" y="${num(line.baseline + dy)}" ${attrs}`;
      if (effect?.type === 'echo')
        out.push(
          `<text ${at(effect.offsetX, effect.offsetY)} ${paintAttrs('fill', effect.color)} xml:space="preserve">${text}</text>`,
        );
      if (glowId && effect?.type === 'neon') {
        out.push(
          `<text ${at(0, 0)} ${paintAttrs('fill', effect.color)} filter="url(#${glowId})" xml:space="preserve">${text}</text>`,
        );
      }
      let paint = paintAttrs('fill', s.color);
      if (effect?.type === 'outline')
        paint += ` ${paintAttrs('stroke', effect.color)} stroke-width="${num(effect.width * 2)}" stroke-linejoin="round" paint-order="stroke"`;
      if (effect?.type === 'hollow')
        paint = `fill="none" ${paintAttrs('stroke', s.color)} stroke-width="${num(effect.width)}" stroke-linejoin="round"`;
      if (effect?.type === 'neon') paint = 'fill="#ffffff"';
      out.push(`<text ${at(0, 0)} ${paint} xml:space="preserve">${text}</text>`);
      const thickness = Math.max(1, s.fontSize * 0.06);
      if (s.underline)
        out.push(
          `<rect x="${num(f.x)}" y="${num(line.baseline + s.fontSize * 0.12)}" width="${num(f.width)}" height="${num(thickness)}" ${paintAttrs('fill', s.color)}/>`,
        );
      if (s.strikethrough)
        out.push(
          `<rect x="${num(f.x)}" y="${num(line.baseline - s.fontSize * 0.3)}" width="${num(f.width)}" height="${num(thickness)}" ${paintAttrs('fill', s.color)}/>`,
        );
    }
  }
  return out.join('');
}

function lineNodeSvg(b: SvgBuilder, node: LineNode): string {
  const { stroke } = node;
  const sw = stroke.width;
  if (sw <= 0) return '';
  const y = node.height / 2;
  const size = arrowSize(sw);
  const inset = (h: LineNode['startArrow']) =>
    h === 'triangle' ? size * 0.8 : h === 'circle' || h === 'square' ? size / 2 : 0;
  const x0 = inset(node.startArrow);
  const x1 = node.width - inset(node.endArrow);
  const color = paintAttrs('fill', stroke.color);
  const strokeColor = paintAttrs('stroke', stroke.color);
  const out: string[] = [];
  if (x1 > x0)
    out.push(`<path d="M${num(x0)} ${num(y)}L${num(x1)} ${num(y)}" fill="none" ${b.stroke(stroke)}/>`);
  const head = (kind: LineNode['startArrow'], tip: number, dir: 1 | -1) => {
    const back = tip - dir * size;
    switch (kind) {
      case 'arrow':
        out.push(
          `<path d="M${num(back)} ${num(y - size * 0.6)}L${num(tip)} ${num(y)}L${num(back)} ${num(y + size * 0.6)}" fill="none" ${strokeColor} stroke-width="${num(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
        break;
      case 'triangle':
        out.push(
          `<path d="M${num(tip)} ${num(y)}L${num(back)} ${num(y - size * 0.6)}L${num(back)} ${num(y + size * 0.6)}Z" ${color}/>`,
        );
        break;
      case 'circle':
        out.push(
          `<circle cx="${num(tip - (dir * size) / 2)}" cy="${num(y)}" r="${num(size / 2)}" ${color}/>`,
        );
        break;
      case 'square':
        out.push(
          `<rect x="${num(tip - (dir > 0 ? size : 0))}" y="${num(y - size / 2)}" width="${num(size)}" height="${num(size)}" ${color}/>`,
        );
        break;
      case 'bar':
        out.push(
          `<path d="M${num(tip)} ${num(y - size * 0.6)}L${num(tip)} ${num(y + size * 0.6)}" ${strokeColor} stroke-width="${num(sw)}" stroke-linecap="round"/>`,
        );
        break;
    }
  };
  head(node.startArrow, 0, -1);
  head(node.endArrow, node.width, 1);
  return out.join('');
}

async function nodeSvg(
  b: SvgBuilder,
  store: DocumentStore,
  node: NodeRecord,
  options: SvgExportOptions,
): Promise<string> {
  if (!node.visible) return '';
  const attrs = [`transform="${matrix(getLocalTransform(node))}"`];
  if (node.opacity < 1) attrs.push(`opacity="${num(node.opacity)}"`);
  const styles: string[] = [];
  if (node.blendMode !== 'normal') styles.push(`mix-blend-mode:${node.blendMode}`);
  if (node.type === 'group' || node.type === 'frame') styles.push('isolation:isolate');
  if (styles.length) attrs.push(`style="${styles.join(';')}"`);
  const filterId = b.filter(node);
  if (filterId) attrs.push(`filter="url(#${filterId})"`);
  if (node.semantic?.description) attrs.push(`aria-label="${escapeXml(node.semantic.description)}"`);

  let content = '';
  switch (node.type) {
    case 'shape': {
      const d = pathToSvg(getShapeNodePath(node));
      content = `<path d="${d}" ${b.fill(node.fill, node.width, node.height)} ${b.stroke(node.stroke)}/>`;
      break;
    }
    case 'frame': {
      const commands = getFrameClipPath(node);
      const d = pathToSvg(commands);
      const children = (
        await Promise.all(store.getChildren(node.id).map((c) => nodeSvg(b, store, c, options)))
      ).join('');
      const fill = node.fill ? `<path d="${d}" ${b.fill(node.fill, node.width, node.height)}/>` : '';
      const body = node.clipContent
        ? `<g clip-path="url(#${b.clipPath(commands)})">${children}</g>`
        : children;
      const stroke = node.stroke ? `<path d="${d}" fill="none" ${b.stroke(node.stroke)}/>` : '';
      content = fill + body + stroke;
      break;
    }
    case 'group':
      content = (
        await Promise.all(store.getChildren(node.id).map((c) => nodeSvg(b, store, c, options)))
      ).join('');
      break;
    case 'image': {
      const href = await options.resolveImage(node);
      const asset = store.getAsset(node.assetId);
      if (!href || !asset) break;
      const { crop } = node;
      // Nested viewport whose viewBox selects the crop region of the full image.
      const inner = `<svg x="0" y="0" width="${num(node.width)}" height="${num(node.height)}" viewBox="${num(crop.x * asset.width)} ${num(crop.y * asset.height)} ${num(crop.width * asset.width)} ${num(crop.height * asset.height)}" preserveAspectRatio="none"><image width="${asset.width}" height="${asset.height}" href="${escapeXml(href)}" preserveAspectRatio="none"/></svg>`;
      content =
        node.cornerRadius > 0
          ? `<g clip-path="url(#${b.clipPath(getImageClipPath(node))})">${inner}</g>`
          : inner;
      if (node.stroke)
        content += `<path d="${pathToSvg(getImageClipPath(node))}" fill="none" ${b.stroke(node.stroke)}/>`;
      break;
    }
    case 'line':
      content = lineNodeSvg(b, node);
      break;
    case 'path': {
      const vb = node.viewBox;
      const t = `matrix(${num(node.width / vb.width)} 0 0 ${num(node.height / vb.height)} ${num((-vb.x * node.width) / vb.width)} ${num((-vb.y * node.height) / vb.height)})`;
      content = `<path transform="${t}" d="${escapeXml(node.path)}" fill-rule="${node.fillRule}" ${b.fill(node.fill, vb.width, vb.height, vb.x, vb.y)} ${b.stroke(node.stroke)}/>`;
      break;
    }
    case 'text':
      content = textNodeSvg(b, node, options.measurer);
      break;
  }
  return `<g ${attrs.join(' ')}>${content}</g>`;
}

/** Exports one page as a standalone SVG document. */
export async function exportPageSvg(
  store: DocumentStore,
  pageId: Id,
  options: SvgExportOptions,
): Promise<string> {
  const page = store.getPage(pageId);
  if (!page) throw new Error(`Page ${pageId} not found`);
  const b = new SvgBuilder(options.idPrefix ?? 'oc');
  const w = num(page.width);
  const h = num(page.height);
  const pageClip = b.id('page');
  b.addDef(`<clipPath id="${pageClip}"><rect width="${w}" height="${h}"/></clipPath>`);
  const background =
    options.background !== false
      ? `<rect width="${w}" height="${h}" ${b.fill(page.background, page.width, page.height)}/>`
      : '';
  const body = (await Promise.all(store.getChildren(pageId).map((n) => nodeSvg(b, store, n, options)))).join(
    '',
  );
  const title = store.getDocument()?.title ?? '';
  const style = options.css ? `<style>${options.css.replace(/<\/style/gi, '')}</style>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (title ? `<title>${escapeXml(title)}</title>` : '') +
    style +
    b.defsXml() +
    `<g clip-path="url(#${pageClip})">${background}${body}</g></svg>`
  );
}
