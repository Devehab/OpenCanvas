/**
 * Asynchronous image loading for the browser renderer.
 */
import type { AssetRecord } from '@opencanvas/core';
import type { DrawableImage, ImageResolver } from '@opencanvas/renderer';

export type BlobSource = (asset: AssetRecord) => Promise<Blob | null>;

type Entry = { status: 'loading' } | { status: 'ready'; image: DrawableImage } | { status: 'error' };

/** Decodes a blob into something drawable, honouring EXIF orientation. */
export async function decodeBlob(blob: Blob): Promise<DrawableImage> {
  if (blob.type === 'image/svg+xml' || typeof createImageBitmap === 'undefined') {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      // SVGs without intrinsic size report 0×0; give them a sensible default.
      if (!img.naturalWidth || !img.naturalHeight) {
        img.width = 512;
        img.height = 512;
      }
      return img as unknown as DrawableImage;
    } finally {
      // Keep the URL alive until decode() finished; images keep their data afterwards.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }
  return (await createImageBitmap(blob, { imageOrientation: 'from-image' })) as unknown as DrawableImage;
}

/**
 * Loads images on demand. `get()` returns null while loading and calls
 * `onChange` when an image becomes available, so the view re-renders.
 */
export class BrowserImageResolver implements ImageResolver {
  private readonly cache = new Map<string, Entry>();
  private readonly waiters = new Map<string, Promise<DrawableImage | null>>();

  constructor(
    private readonly source: BlobSource,
    private readonly onChange: () => void,
  ) {}

  /** Number of images currently loading. */
  get pending(): number {
    return this.waiters.size;
  }

  get(asset: AssetRecord): DrawableImage | null {
    const entry = this.cache.get(asset.hash);
    if (entry?.status === 'ready') return entry.image;
    if (!entry) void this.load(asset);
    return null;
  }

  /** Resolves when the asset's image is available (used before exporting). */
  load(asset: AssetRecord): Promise<DrawableImage | null> {
    const entry = this.cache.get(asset.hash);
    if (entry?.status === 'ready') return Promise.resolve(entry.image);
    if (entry?.status === 'error') return Promise.resolve(null);
    const pending = this.waiters.get(asset.hash);
    if (pending) return pending;
    this.cache.set(asset.hash, { status: 'loading' });
    const promise = (async () => {
      try {
        const blob = await this.source(asset);
        if (!blob) throw new Error('missing');
        const image = await decodeBlob(blob);
        this.cache.set(asset.hash, { status: 'ready', image });
        this.onChange();
        return image;
      } catch {
        this.cache.set(asset.hash, { status: 'error' });
        return null;
      } finally {
        this.waiters.delete(asset.hash);
      }
    })();
    this.waiters.set(asset.hash, promise);
    return promise;
  }

  /** Registers an already decoded image (e.g. right after an upload). */
  put(hash: string, image: DrawableImage): void {
    this.cache.set(hash, { status: 'ready', image });
    this.onChange();
  }

  async loadAll(assets: readonly AssetRecord[]): Promise<void> {
    await Promise.all(assets.map((a) => this.load(a)));
  }
}
