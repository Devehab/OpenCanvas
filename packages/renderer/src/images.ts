/**
 * Image sources and processed-image caching.
 */
import type { AssetRecord, ImageAdjustments } from '@opencanvas/core';
import { applyAdjustments, hasAdjustments } from './filters';
import { type CanvasLike, context2d, type RenderPlatform } from './platform';

/** Anything drawable with drawImage() that has a known pixel size. */
export type DrawableImage = CanvasImageSource & { width: number; height: number };

/**
 * Resolves asset records to drawable images. Implementations may load
 * asynchronously; return null until the image is ready (the renderer draws a
 * placeholder) and trigger a re-render when it arrives.
 */
export interface ImageResolver {
  get(asset: AssetRecord): DrawableImage | null;
}

/** Simple resolver backed by a map of preloaded images (Node, tests, exports). */
export class MapImageResolver implements ImageResolver {
  constructor(private readonly images: Map<string, DrawableImage> = new Map()) {}

  set(assetIdOrHash: string, image: DrawableImage): this {
    this.images.set(assetIdOrHash, image);
    return this;
  }

  get(asset: AssetRecord): DrawableImage | null {
    return this.images.get(asset.id) ?? this.images.get(asset.hash) ?? null;
  }
}

/** Longest side used when processing adjustments for interactive rendering. */
const MAX_PROCESS_SIZE = 4096;

interface Entry {
  canvas: CanvasLike;
  bytes: number;
}

/**
 * Caches adjusted versions of images (brightness, contrast, …). Keyed by the
 * source image, the adjustment values and the processing resolution.
 */
export class AdjustedImageCache {
  private readonly entries = new Map<string, Entry>();
  private readonly sourceIds = new WeakMap<object, number>();
  private nextSourceId = 1;
  private bytes = 0;

  constructor(
    private readonly platform: RenderPlatform,
    private readonly maxBytes = 256 * 1024 * 1024,
  ) {}

  private sourceKey(source: object): number {
    let id = this.sourceIds.get(source);
    if (!id) {
      id = this.nextSourceId++;
      this.sourceIds.set(source, id);
    }
    return id;
  }

  get(source: DrawableImage, adjustments: ImageAdjustments, maxSize = MAX_PROCESS_SIZE): DrawableImage {
    if (!hasAdjustments(adjustments)) return source;
    const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const key = `${this.sourceKey(source)}|${w}x${h}|${Object.values(adjustments).join(',')}`;
    const hit = this.entries.get(key);
    if (hit) {
      // Refresh LRU position.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.canvas as unknown as DrawableImage;
    }
    const canvas = this.platform.createCanvas(w, h);
    const ctx = context2d(canvas);
    ctx.drawImage(source, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    applyAdjustments(data.data, w, h, adjustments);
    ctx.putImageData(data, 0, 0);
    const entry = { canvas, bytes: w * h * 4 };
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
    while (this.bytes > this.maxBytes && this.entries.size > 1) {
      const [oldestKey, oldest] = this.entries.entries().next().value as [string, Entry];
      this.entries.delete(oldestKey);
      this.bytes -= oldest.bytes;
    }
    return canvas as unknown as DrawableImage;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}
