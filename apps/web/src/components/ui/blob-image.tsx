import type { ImgHTMLAttributes } from 'react';

/**
 * Plain <img> for local object URLs (uploads, brand assets, previews):
 * next/image cannot optimize blob: URLs.
 */
export function BlobImage({ alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  // biome-ignore lint/performance/noImgElement: blob: URLs are local and cannot be optimized
  return <img alt={alt} draggable={false} {...props} />;
}
