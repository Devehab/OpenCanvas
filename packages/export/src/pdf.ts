/**
 * Minimal, dependency-free PDF writer.
 *
 * Phase 1 exports each page as a high-resolution image (JPEG or lossless
 * Flate-compressed RGB) on a page of the exact physical size, which keeps
 * output pixel-identical to the canvas (all effects, Arabic shaping, fonts).
 * Vector PDF with embedded, subset fonts is on the roadmap.
 */
import type { Id } from '@opencanvas/core';
import { context2d, rasterizePage } from '@opencanvas/renderer';
import { zlibSync } from 'fflate';
import { concatBytes, textEncoder } from './bytes';
import { type ExportContext, scaleForDpi } from './raster';

export interface PdfImage {
  /** Encoded image bytes: JPEG (DCTDecode) or zlib-compressed RGB (FlateDecode). */
  data: Uint8Array;
  filter: 'DCTDecode' | 'FlateDecode';
  width: number;
  height: number;
}

export interface PdfPage {
  /** Page size in PDF points (1/72 inch). */
  widthPt: number;
  heightPt: number;
  image: PdfImage;
}

export interface PdfInfo {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
}

/** PDF text string: ASCII as a literal, anything else as UTF-16BE hex with BOM (handles Arabic titles). */
export function pdfString(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return `(${value.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i++)
    hex += value.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const num = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function writePdf(pages: readonly PdfPage[], info: PdfInfo = {}): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? textEncoder.encode(data) : data;
    chunks.push(bytes);
    position += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = position;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  // Object numbering: 1 catalog, 2 pages, 3 info, then 3 objects per page.
  const pageObjectIds = pages.map((_, i) => 4 + i * 3);
  push('%PDF-1.7\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  const infoEntries = [
    info.title ? `/Title ${pdfString(info.title)}` : '',
    info.author ? `/Author ${pdfString(info.author)}` : '',
    info.subject ? `/Subject ${pdfString(info.subject)}` : '',
    `/Creator ${pdfString(info.creator ?? 'OpenCanvas')}`,
    `/Producer ${pdfString(info.producer ?? 'OpenCanvas')}`,
    info.creationDate ? `/CreationDate (${pdfDate(info.creationDate)})` : '',
  ].filter(Boolean);
  object(3, `<< ${infoEntries.join(' ')} >>`);

  pages.forEach((page, i) => {
    const pageId = pageObjectIds[i]!;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const w = num(page.widthPt);
    const h = num(page.heightPt);
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const img = page.image;
    object(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${img.filter} /Length ${img.data.length} >>`,
      img.data,
    );
    const content = textEncoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(contentId, `<< /Length ${content.length} >>`, content);
  });

  const count = 4 + pages.length * 3;
  const xrefStart = position;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return concatBytes(chunks);
}

export interface PdfExportOptions {
  /** Raster resolution; 150 = standard, 300 = print. */
  dpi?: number;
  /** JPEG is compact; lossless keeps sharp edges (text, flat colors). */
  imageFormat?: 'jpeg' | 'lossless';
  quality?: number;
  info?: PdfInfo;
}

/** Exports pages to a multi-page PDF. */
export async function exportPdf(
  ctx: ExportContext,
  pageIds: readonly Id[],
  options: PdfExportOptions = {},
): Promise<Uint8Array> {
  const dpi = options.dpi ?? 150;
  const pages: PdfPage[] = [];
  for (const pageId of pageIds) {
    const page = ctx.store.getPage(pageId);
    if (!page) continue;
    const raster = rasterizePage(ctx.renderer, ctx.platform, ctx.store, pageId, {
      scale: scaleForDpi(dpi),
      background: true,
      quality: 'export',
      placeholders: false,
      maxPixels: 120_000_000,
    });
    let image: PdfImage;
    if ((options.imageFormat ?? 'jpeg') === 'jpeg') {
      // PDF pages are opaque: composite onto white first so transparent backgrounds don't turn black.
      const flat = ctx.platform.createCanvas(raster.width, raster.height);
      const fctx = context2d(flat);
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, raster.width, raster.height);
      fctx.drawImage(raster.canvas as unknown as CanvasImageSource, 0, 0);
      image = {
        data: await ctx.encoder.encode(flat, 'jpeg', options.quality ?? 0.92),
        filter: 'DCTDecode',
        width: raster.width,
        height: raster.height,
      };
    } else {
      const rgba = context2d(raster.canvas).getImageData(0, 0, raster.width, raster.height).data;
      const rgb = new Uint8Array(raster.width * raster.height * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        const a = rgba[i + 3]! / 255;
        rgb[j] = Math.round(rgba[i]! * a + 255 * (1 - a));
        rgb[j + 1] = Math.round(rgba[i + 1]! * a + 255 * (1 - a));
        rgb[j + 2] = Math.round(rgba[i + 2]! * a + 255 * (1 - a));
      }
      image = {
        data: zlibSync(rgb, { level: 6 }),
        filter: 'FlateDecode',
        width: raster.width,
        height: raster.height,
      };
    }
    // 96 px per inch design units → 72 pt per inch.
    pages.push({ widthPt: page.width * 0.75, heightPt: page.height * 0.75, image });
  }
  const title = ctx.store.getDocument()?.title;
  return writePdf(pages, { title, ...options.info });
}
