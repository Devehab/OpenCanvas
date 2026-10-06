/**
 * The main colors of an image blob (a logo), read from a small downscaled copy.
 */
import { extractPalette } from '@opencanvas/core';

const SAMPLE_SIZE = 128;

async function decode(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  // SVG logos cannot be decoded by createImageBitmap in every browser.
  if (blob.type !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function colorsFromImage(blob: Blob, count = 6): Promise<string[]> {
  const image = await decode(blob);
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round((image.width || SAMPLE_SIZE) * scale));
  const height = Math.max(1, Math.round((image.height || SAMPLE_SIZE) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0, width, height);
  if ('close' in image && typeof image.close === 'function') image.close();
  return extractPalette(ctx.getImageData(0, 0, width, height).data, { count });
}
