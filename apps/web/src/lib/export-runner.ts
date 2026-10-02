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
import { buildPackage } from './package-io';
import type { EditorSession } from './session';

export type ExportType = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf' | 'pdfPrint' | 'opencanvas';

export interface ExportRequest {
  type: ExportType;
  pageIds: string[];
  scale: number;
  transparent: boolean;
  quality: number;
}

export interface ExportResult {
  data: Uint8Array | Blob;
  fileName: string;
  mimeType: string;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
      dpi: request.type === 'pdfPrint' ? 300 : 150,
      imageFormat: 'jpeg',
      quality: request.type === 'pdfPrint' ? 0.95 : 0.9,
    });
    onProgress?.(total, total);
    return { data, fileName: `${title}.pdf`, mimeType: 'application/pdf' };
  }

  const files: { name: string; data: Uint8Array; mime: string }[] = [];
  for (const [i, pageId] of request.pageIds.entries()) {
    if (request.type === 'svg') {
      const svg = await exportPageSvg(store, pageId, {
        measurer: renderer.getMeasurer(),
        background: !request.transparent,
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
      const r = await exportPageRaster(ctx, pageId, {
        format,
        scale: request.scale,
        transparent: request.transparent,
        quality: request.quality,
      });
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
