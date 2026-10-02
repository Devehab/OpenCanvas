/**
 * Canvas encoders for the browser (OffscreenCanvas.convertToBlob or
 * HTMLCanvasElement.toBlob). Node uses `encodeCanvas` from
 * `@opencanvas/renderer/node`.
 */
import type { CanvasLike } from '@opencanvas/renderer';
import { type CanvasEncoder, RASTER_MIME, type RasterFormat } from './raster';

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function createBrowserEncoder(): CanvasEncoder {
  return {
    async encode(canvas: CanvasLike, format: RasterFormat, quality: number): Promise<Uint8Array> {
      const type = RASTER_MIME[format];
      const c = canvas as unknown as {
        convertToBlob?: (o: { type: string; quality?: number }) => Promise<Blob>;
        toBlob?: (cb: (b: Blob | null) => void, type: string, quality?: number) => void;
      };
      let blob: Blob | null = null;
      if (typeof c.convertToBlob === 'function') {
        blob = await c.convertToBlob({ type, quality });
      } else if (typeof c.toBlob === 'function') {
        blob = await new Promise<Blob | null>((resolve) => c.toBlob!((b) => resolve(b), type, quality));
      }
      if (!blob) throw new Error(`Could not encode ${format}`);
      // Browsers silently fall back to PNG for unsupported types (e.g. WebP in old Safari).
      if (blob.type && blob.type !== type)
        throw new Error(`This browser cannot export ${format.toUpperCase()}`);
      return blobToBytes(blob);
    },
  };
}
