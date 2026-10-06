/**
 * Browser export orchestration (raster, SVG, PDF, .opencanvas).
 */
import type { ImageNode } from '@opencanvas/core';
import { serializeDocument } from '@opencanvas/core';
import {
  createBrowserEncoder,
  type ExportContext,
  exportPageRaster,
  exportPageSvg,
  exportPdf,
  PACKAGE_EXTENSION,
  PACKAGE_MIME,
  type RasterFormat,
  safeFileName,
  zipFiles,
} from '@opencanvas/export';
import { collectFaceUsage, embeddedFontCss } from './font-embed';
import { buildPackage } from './package-io';
import type { EditorSession } from './session';

export type ExportType = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf' | 'pdfPrint' | 'opencanvas';

export interface ExportRequest {
  type: ExportType;
  pageIds: string[];
  scale: number;
  transparent: boolean;
  quality: number;
  /** Smaller files: palette PNG, lower JPEG/WebP quality, lighter PDF images. */
  compress?: boolean;
  /** Raster formats: largest file size in bytes (quality and size are lowered to fit). */
  maxBytes?: number;
}

/** Thrown when a file cannot be made small enough for the size limit. */
export class SizeLimitError extends Error {
  constructor() {
    super('size-limit');
  }
}

export interface ExportResult {
  data: Uint8Array | Blob;
  fileName: string;
  mimeType: string;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Design units are CSS pixels: 96 per inch. */
const DESIGN_DPI = 96;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function runExport(
  session: EditorSession,
  request: ExportRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const { editor, renderer, platform, images } = session;
  const store = editor.store;
  const title = safeFileName(store.getDocument()?.title ?? 'design');
  if (request.type === 'opencanvas') {
    const data = await buildPackage(serializeDocument(store), session.design.id);
    return { data, fileName: `${title}${PACKAGE_EXTENSION}`, mimeType: PACKAGE_MIME };
  }
  // Exports must not contain placeholders: wait for every image and font.
  await images.loadAll(store.getAssets());
  await document.fonts.ready;
  const ctx: ExportContext = { store, renderer, platform, encoder: createBrowserEncoder() };
  const total = request.pageIds.length;
  const allPages = store.getPageIds();
  const pageNumber = (id: string) => allPages.indexOf(id) + 1;

  if (request.type === 'pdf' || request.type === 'pdfPrint') {
    const data = await exportPdf(ctx, request.pageIds, {
      dpi: request.type === 'pdfPrint' ? 300 : request.compress ? 96 : 150,
      imageFormat: 'jpeg',
      quality: request.type === 'pdfPrint' ? 0.95 : request.compress ? 0.7 : 0.9,
    });
    onProgress?.(total, total);
    return { data, fileName: `${title}.pdf`, mimeType: 'application/pdf' };
  }

  const files: { name: string; data: Uint8Array; mime: string }[] = [];
  const fontCache = new Map<string, Promise<string | null>>();
  for (const [i, pageId] of request.pageIds.entries()) {
    if (request.type === 'svg') {
      const svg = await exportPageSvg(store, pageId, {
        measurer: renderer.getMeasurer(),
        background: !request.transparent,
        // Self-contained: the fonts used on the page travel with the file.
        css: await embeddedFontCss(collectFaceUsage(store, pageId), fontCache),
        resolveImage: async (node: ImageNode) => {
          const asset = store.getAsset(node.assetId);
          if (!asset) return null;
          const source = await images.load(asset);
          if (!source) return null;
          // Bake adjustments into the embedded pixels so the SVG matches the canvas.
          const adjusted = renderer.adjustedImages.get(source, node.adjustments, Number.POSITIVE_INFINITY);
          const canvas = platform.createCanvas(adjusted.width, adjusted.height);
          const c2d = (canvas as unknown as OffscreenCanvas).getContext(
            '2d',
          ) as OffscreenCanvasRenderingContext2D;
          c2d.drawImage(adjusted, 0, 0);
          const blob =
            'convertToBlob' in canvas
              ? await (canvas as unknown as OffscreenCanvas).convertToBlob({ type: 'image/png' })
              : await new Promise<Blob>((resolve) =>
                  (canvas as unknown as HTMLCanvasElement).toBlob((b) => resolve(b!), 'image/png'),
                );
          return blobToDataUrl(blob);
        },
      });
      files.push({
        name: `${title}-${pageNumber(pageId)}.svg`,
        data: new TextEncoder().encode(svg),
        mime: 'image/svg+xml',
      });
    } else {
      const format = request.type as RasterFormat;
      const r = await renderRaster(ctx, pageId, format, request);
      const ext = format === 'jpeg' ? 'jpg' : format;
      files.push({ name: `${title}-${pageNumber(pageId)}.${ext}`, data: r.data, mime: r.mimeType });
    }
    onProgress?.(i + 1, total);
    await tick();
  }
  if (files.length === 1) {
    const only = files[0]!;
    return { data: only.data, fileName: only.name.replace(/-\d+(\.\w+)$/, '$1'), mimeType: only.mime };
  }
  return { data: zipFiles(files), fileName: `${title}.zip`, mimeType: 'application/zip' };
}

/** One raster page, honoring compression and the size limit. */
async function renderRaster(
  ctx: ExportContext,
  pageId: string,
  format: RasterFormat,
  request: ExportRequest,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const render = (scale: number, quality: number, compress: boolean) =>
    exportPageRaster(ctx, pageId, {
      format,
      // DPI metadata keeps the printed size equal to the design size at any scale.
      ...(format === 'webp' ? { scale } : { dpi: DESIGN_DPI * scale }),
      transparent: request.transparent,
      quality,
      compress: format === 'png' && compress,
    });
  const quality = request.compress && format !== 'png' ? Math.min(request.quality, 0.7) : request.quality;
  const first = await render(request.scale, quality, request.compress === true);
  const limit = request.maxBytes;
  if (!limit || first.data.length <= limit) return first;

  // Lower the quality first (lossy formats), then the size, until the file fits.
  if (format !== 'png') {
    for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
      if (q >= quality) continue;
      const r = await render(request.scale, q, false);
      if (r.data.length <= limit) return r;
    }
  } else if (!request.compress) {
    const r = await render(request.scale, quality, true);
    if (r.data.length <= limit) return r;
  }
  let scale = request.scale;
  let size = first.data.length;
  for (let attempt = 0; attempt < 10; attempt++) {
    // File size grows roughly with the pixel count.
    scale *= Math.max(0.5, Math.min(0.95, Math.sqrt(limit / size) * 0.95));
    if (scale < 0.05) break;
    const r = await render(scale, format === 'png' ? quality : 0.6, true);
    if (r.data.length <= limit) return r;
    size = r.data.length;
  }
  throw new SizeLimitError();
}
