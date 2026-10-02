/**
 * SceneRenderer — draws pages of the structured document onto any Canvas 2D
 * context (browser <canvas>, OffscreenCanvas, or @napi-rs/canvas in Node).
 *
 * The renderer only READS the document; it never owns state. The editor, the
 * thumbnail generator and the exporters all share it, so what you see is
 * exactly what you export.
 */
import {
  applyToPoint,
  type Box,
  boxCorners,
  boxFromPoints,
  boxIntersects,
  type DocumentStore,
  determinant,
  type Fill,
  type FrameNode,
  getFrameClipPath,
  getImageClipPath,
  getLocalTransform,
  getParsedPath,
  getShapeNodePath,
  type Id,
  type ImageNode,
  type LineNode,
  type Mat,
  multiply,
  type NodeRecord,
  type PathCommand,
  type PathNode,
  type Stroke,
  type TextMeasurer,
  toCssColor,
  tracePath,
} from '@opencanvas/core';
import { arrowSize, visualBoundsInParent, visualLocalBounds } from './bounds';
import { blurRGBA } from './filters';
import { AdjustedImageCache, type ImageResolver } from './images';
import { dashPattern, toCanvasPaint, toCompositeOperation } from './paint';
import { type Context2D, context2d, type RenderPlatform } from './platform';
import { drawText } from './text';
import { TextLayoutCache } from './text-cache';

export interface RenderOptions {
  /** Page → target pixel transform (camera × devicePixelRatio). Default: identity. */
  transform?: Mat;
  /** Fill the page background. Default true. */
  background?: boolean;
  /** Clip drawing to the page rectangle. Default true. */
  clipToPage?: boolean;
  /** Nodes not to draw (e.g. the text currently being edited in a DOM overlay). */
  hiddenIds?: ReadonlySet<Id>;
  /** Visible page-space rectangle; nodes outside are skipped. */
  viewport?: Box | null;
  /** Draw placeholders for images that are not loaded yet. Default true. */
  placeholders?: boolean;
  /** `export` processes images at full resolution. Default `interactive`. */
  quality?: 'interactive' | 'export';
}

export interface RenderStats {
  drawn: number;
  culled: number;
  layers: number;
  missingImages: number;
}

interface FrameState {
  store: DocumentStore;
  options: RenderOptions;
  stats: RenderStats;
  hidden: ReadonlySet<Id>;
}

const MAX_LAYER_PIXELS = 64 * 1024 * 1024;
const MAX_LAYER_SIDE = 16_384;

function toMat(m: DOMMatrix | { a: number; b: number; c: number; d: number; e: number; f: number }): Mat {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

export class SceneRenderer {
  readonly textLayouts: TextLayoutCache;
  readonly adjustedImages: AdjustedImageCache;

  constructor(
    private readonly platform: RenderPlatform,
    private images: ImageResolver,
    private measurer: TextMeasurer,
  ) {
    this.textLayouts = new TextLayoutCache(measurer);
    this.adjustedImages = new AdjustedImageCache(platform);
  }

  setImageResolver(images: ImageResolver): void {
    this.images = images;
  }

  /** Call after web fonts load or the measurer changes. */
  invalidateText(measurer?: TextMeasurer): void {
    if (measurer) this.measurer = measurer;
    this.textLayouts.clear(this.measurer);
  }

  getMeasurer(): TextMeasurer {
    return this.measurer;
  }

  renderPage(ctx: Context2D, store: DocumentStore, pageId: Id, options: RenderOptions = {}): RenderStats {
    const page = store.getPage(pageId);
    const stats: RenderStats = { drawn: 0, culled: 0, layers: 0, missingImages: 0 };
    if (!page) return stats;
    const t = options.transform ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    ctx.save();
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
    if (options.clipToPage !== false) {
      ctx.beginPath();
      ctx.rect(0, 0, page.width, page.height);
      ctx.clip();
    }
    if (options.background !== false) this.fillBox(ctx, page.background, page.width, page.height);
    const state: FrameState = { store, options, stats, hidden: options.hiddenIds ?? new Set() };
    for (const child of store.getChildren(pageId)) this.drawNode(ctx, child, state, true);
    ctx.restore();
    return stats;
  }

  /** Draws only the given top-level nodes (e.g. exporting a selection). */
  renderNodes(
    ctx: Context2D,
    store: DocumentStore,
    ids: readonly Id[],
    options: RenderOptions = {},
  ): RenderStats {
    const stats: RenderStats = { drawn: 0, culled: 0, layers: 0, missingImages: 0 };
    const t = options.transform ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const state: FrameState = { store, options, stats, hidden: options.hiddenIds ?? new Set() };
    for (const id of ids) {
      const node = store.getNode(id);
      if (!node) continue;
      // Compose the node's ancestor transforms so nested nodes render in place.
      let m: Mat = t;
      for (const a of [...store.getAncestors(id)].reverse()) m = multiply(m, getLocalTransform(a));
      ctx.save();
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      this.drawNode(ctx, node, state, false);
      ctx.restore();
    }
    return stats;
  }

  // ---------------------------------------------------------------------------

  private drawNode(ctx: Context2D, node: NodeRecord, state: FrameState, topLevel: boolean): void {
    if (!node.visible || state.hidden.has(node.id)) return;
    if (topLevel && state.options.viewport) {
      if (!boxIntersects(visualBoundsInParent(state.store, node), state.options.viewport)) {
        state.stats.culled++;
        return;
      }
    }
    const local = getLocalTransform(node);
    if (this.needsLayer(node)) {
      this.drawWithLayer(ctx, node, local, state);
      return;
    }
    ctx.save();
    ctx.transform(local.a, local.b, local.c, local.d, local.e, local.f);
    ctx.globalAlpha *= node.opacity;
    ctx.globalCompositeOperation = toCompositeOperation(node.blendMode);
    const device = toMat(ctx.getTransform());
    const scale = Math.sqrt(Math.abs(determinant(device))) || 1;
    if (node.blur > 0 && this.platform.supportsFilter) ctx.filter = `blur(${node.blur * scale}px)`;
    if (node.shadow) this.applyShadow(ctx, node, device, scale);
    this.drawContent(ctx, node, state, scale);
    ctx.restore();
    state.stats.drawn++;
  }

  /** Shadows on multi-part nodes and effects on containers need an offscreen layer. */
  private needsLayer(node: NodeRecord): boolean {
    const isContainer = node.type === 'group' || node.type === 'frame';
    if (isContainer)
      return node.opacity < 1 || node.blendMode !== 'normal' || node.shadow !== null || node.blur > 0;
    if (node.blur > 0 && !this.platform.supportsFilter) return true;
    if (node.shadow) {
      const singlePass =
        (node.type === 'shape' && !(node.fill && node.stroke)) ||
        (node.type === 'image' && !node.stroke) ||
        (node.type === 'path' && !(node.fill && node.stroke));
      return !singlePass;
    }
    return false;
  }

  private applyShadow(ctx: Context2D, node: NodeRecord, device: Mat, scale: number): void {
    const s = node.shadow!;
    const offset = {
      x: device.a * s.offsetX + device.c * s.offsetY,
      y: device.b * s.offsetX + device.d * s.offsetY,
    };
    ctx.shadowColor = toCssColor(s.color);
    ctx.shadowBlur = s.blur * scale;
    ctx.shadowOffsetX = offset.x;
    ctx.shadowOffsetY = offset.y;
  }

  private drawWithLayer(ctx: Context2D, node: NodeRecord, local: Mat, state: FrameState): void {
    const parentDevice = toMat(ctx.getTransform());
    const device = multiply(parentDevice, local);
    const scale = Math.sqrt(Math.abs(determinant(device))) || 1;
    const blurPx = node.blur * scale;
    const vb = visualLocalBounds(state.store, node);
    const corners = boxCorners(vb).map((p) => applyToPoint(device, p));
    const db = boxFromPoints(corners);
    // Limit the layer to the target surface (plus room for blur to spread in).
    const margin = Math.ceil(blurPx * 3) + 2;
    const target = {
      x: -margin,
      y: -margin,
      width: ctx.canvas.width + margin * 2,
      height: ctx.canvas.height + margin * 2,
    };
    const x0 = Math.floor(Math.max(db.x - margin, target.x));
    const y0 = Math.floor(Math.max(db.y - margin, target.y));
    const x1 = Math.ceil(Math.min(db.x + db.width + margin, target.x + target.width));
    const y1 = Math.ceil(Math.min(db.y + db.height + margin, target.y + target.height));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    if (w * h > MAX_LAYER_PIXELS || w > MAX_LAYER_SIDE || h > MAX_LAYER_SIDE) {
      // Degrade gracefully: draw directly (effects may be approximated).
      ctx.save();
      ctx.transform(local.a, local.b, local.c, local.d, local.e, local.f);
      ctx.globalAlpha *= node.opacity;
      this.drawContent(ctx, node, state, scale);
      ctx.restore();
      return;
    }
    const layer = this.platform.createCanvas(w, h);
    const lctx = context2d(layer);
    lctx.setTransform(device.a, device.b, device.c, device.d, device.e - x0, device.f - y0);
    this.drawContent(lctx, node, state, scale);
    const useJsBlur = blurPx > 0 && !this.platform.supportsFilter;
    if (useJsBlur) {
      const data = lctx.getImageData(0, 0, w, h);
      blurRGBA(data.data, w, h, blurPx);
      lctx.putImageData(data, 0, 0);
    }
    ctx.save();
    const alpha = ctx.globalAlpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * node.opacity;
    ctx.globalCompositeOperation = toCompositeOperation(node.blendMode);
    if (node.shadow) this.applyShadow(ctx, node, device, scale);
    if (blurPx > 0 && !useJsBlur) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(layer as unknown as CanvasImageSource, x0, y0);
    ctx.restore();
    state.stats.layers++;
    state.stats.drawn++;
  }

  private drawChildren(ctx: Context2D, parentId: Id, state: FrameState): void {
    for (const child of state.store.getChildren(parentId)) this.drawNode(ctx, child, state, false);
  }

  private drawContent(ctx: Context2D, node: NodeRecord, state: FrameState, scale: number): void {
    switch (node.type) {
      case 'shape': {
        const path = getShapeNodePath(node);
        if (node.fill) this.fillPath(ctx, path, node.fill, node.width, node.height);
        if (node.stroke) {
          if (node.fill && node.shadow) this.clearShadow(ctx);
          this.strokePath(ctx, path, node.stroke);
        }
        break;
      }
      case 'frame':
        this.drawFrame(ctx, node, state);
        break;
      case 'group':
        this.drawChildren(ctx, node.id, state);
        break;
      case 'image':
        this.drawImageNode(ctx, node, state);
        break;
      case 'line':
        this.drawLine(ctx, node);
        break;
      case 'path':
        this.drawPathNode(ctx, node);
        break;
      case 'text': {
        const layout = this.textLayouts.get(node);
        drawText(ctx, node, layout, { platform: this.platform, deviceScale: scale });
        break;
      }
    }
  }

  private clearShadow(ctx: Context2D): void {
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  private fillBox(ctx: Context2D, fill: Fill, width: number, height: number): void {
    ctx.fillStyle = toCanvasPaint(ctx, fill, width, height);
    ctx.fillRect(0, 0, width, height);
  }

  private fillPath(
    ctx: Context2D,
    path: readonly PathCommand[],
    fill: Fill,
    width: number,
    height: number,
    rule: CanvasFillRule = 'nonzero',
  ): void {
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.fillStyle = toCanvasPaint(ctx, fill, width, height);
    ctx.fill(rule);
  }

  private strokePath(ctx: Context2D, path: readonly PathCommand[], stroke: Stroke): void {
    if (stroke.width <= 0) return;
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = toCssColor(stroke.color);
    ctx.lineCap = stroke.style === 'dotted' ? 'round' : stroke.cap;
    ctx.lineJoin = stroke.join;
    ctx.setLineDash(dashPattern(stroke.style, stroke.width));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawFrame(ctx: Context2D, node: FrameNode, state: FrameState): void {
    const path = getFrameClipPath(node);
    if (node.fill) this.fillPath(ctx, path, node.fill, node.width, node.height);
    if (node.clipContent) {
      ctx.save();
      ctx.beginPath();
      tracePath(ctx, path);
      ctx.clip();
      this.drawChildren(ctx, node.id, state);
      ctx.restore();
    } else {
      this.drawChildren(ctx, node.id, state);
    }
    if (node.stroke) this.strokePath(ctx, path, node.stroke);
  }

  private drawImageNode(ctx: Context2D, node: ImageNode, state: FrameState): void {
    const asset = state.store.getAsset(node.assetId);
    const source = asset ? this.images.get(asset) : null;
    if (!source) {
      state.stats.missingImages++;
      if (state.options.placeholders !== false) this.drawPlaceholder(ctx, node.width, node.height);
      return;
    }
    const image = this.adjustedImages.get(
      source,
      node.adjustments,
      state.options.quality === 'export' ? Number.POSITIVE_INFINITY : 4096,
    );
    const { crop } = node;
    ctx.save();
    if (node.cornerRadius > 0) {
      ctx.beginPath();
      tracePath(ctx, getImageClipPath(node));
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      crop.x * image.width,
      crop.y * image.height,
      crop.width * image.width,
      crop.height * image.height,
      0,
      0,
      node.width,
      node.height,
    );
    ctx.restore();
    if (node.stroke) {
      if (node.shadow) this.clearShadow(ctx);
      this.strokePath(ctx, getImageClipPath(node), node.stroke);
    }
  }

  private drawPlaceholder(ctx: Context2D, width: number, height: number): void {
    ctx.save();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(1, Math.min(width, height) / 100);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, height);
    ctx.moveTo(width, 0);
    ctx.lineTo(0, height);
    ctx.stroke();
    ctx.restore();
  }

  private drawLine(ctx: Context2D, node: LineNode): void {
    const { stroke } = node;
    const sw = stroke.width;
    if (sw <= 0) return;
    const y = node.height / 2;
    const size = arrowSize(sw);
    const inset = (head: LineNode['startArrow']) =>
      head === 'triangle' ? size * 0.8 : head === 'circle' || head === 'square' ? size / 2 : 0;
    const x0 = inset(node.startArrow);
    const x1 = node.width - inset(node.endArrow);
    const color = toCssColor(stroke.color);
    if (x1 > x0) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineWidth = sw;
      ctx.strokeStyle = color;
      ctx.lineCap = stroke.style === 'dotted' ? 'round' : stroke.cap;
      ctx.setLineDash(dashPattern(stroke.style, sw));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const head = (kind: LineNode['startArrow'], tipX: number, dir: 1 | -1) => {
      if (kind === 'none') return;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = sw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const back = tipX - dir * size;
      ctx.beginPath();
      switch (kind) {
        case 'arrow':
          ctx.moveTo(back, y - size * 0.6);
          ctx.lineTo(tipX, y);
          ctx.lineTo(back, y + size * 0.6);
          ctx.stroke();
          break;
        case 'triangle':
          ctx.moveTo(tipX, y);
          ctx.lineTo(back, y - size * 0.6);
          ctx.lineTo(back, y + size * 0.6);
          ctx.closePath();
          ctx.fill();
          break;
        case 'circle':
          ctx.arc(tipX - (dir * size) / 2, y, size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.rect(tipX - (dir > 0 ? size : 0), y - size / 2, size, size);
          ctx.fill();
          break;
        case 'bar':
          ctx.moveTo(tipX, y - size * 0.6);
          ctx.lineTo(tipX, y + size * 0.6);
          ctx.stroke();
          break;
      }
    };
    head(node.startArrow, 0, -1);
    head(node.endArrow, node.width, 1);
  }

  private drawPathNode(ctx: Context2D, node: PathNode): void {
    const vb = node.viewBox;
    const commands = getParsedPath(node.path);
    if (commands.length === 0) return;
    ctx.save();
    // Like SVG viewBox scaling: stroke widths are in viewBox units.
    ctx.scale(node.width / vb.width, node.height / vb.height);
    ctx.translate(-vb.x, -vb.y);
    if (node.fill) {
      ctx.beginPath();
      tracePath(ctx, commands);
      ctx.fillStyle = toCanvasPaint(ctx, node.fill, vb.width, vb.height, vb.x, vb.y);
      ctx.fill(node.fillRule);
    }
    if (node.stroke) {
      if (node.fill && node.shadow) this.clearShadow(ctx);
      this.strokePath(ctx, commands, node.stroke);
    }
    ctx.restore();
  }
}
