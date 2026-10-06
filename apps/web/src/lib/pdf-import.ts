/**
 * Renders the pages of a PDF to images with pdf.js (loaded only when a PDF is
 * opened). Each page keeps its size: 1 PDF point = 1/72 in, 96 px per inch.
 *
 * PDFs are untrusted input: XFA forms are off and nothing in the PDF runs
 * (pdf.js only executes PDF scripts when its scripting sandbox is enabled,
 * which it is not here; pdf.js 6 has no eval-based code path, and the CSP
 * forbids eval anyway).
 */

/** PDF points to CSS pixels. */
const PX_PER_PT = 96 / 72;
/** Pages are rendered at up to 2× their size for sharp text, within this many pixels per side. */
const MAX_RENDER_SIDE = 4096;
export const MAX_PDF_BYTES = 200 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;

export interface RenderedPdfPage {
  pageNumber: number;
  /** Page size in CSS pixels. */
  width: number;
  height: number;
  image: Blob;
}

export class PdfImportError extends Error {
  constructor(readonly reason: 'too-large' | 'unreadable' | 'encrypted') {
    super(reason);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the page'))),
      'image/png',
    ),
  );
}

export async function renderPdfPages(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<RenderedPdfPage[]> {
  if (file.size > MAX_PDF_BYTES) throw new PdfImportError('too-large');
  // The legacy build includes polyfills for JavaScript features that current
  // browsers (Safari, older Chrome) do not have yet.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), enableXfa: false });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy();
    throw new PdfImportError((error as Error)?.name === 'PasswordException' ? 'encrypted' : 'unreadable');
  }
  const total = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages: RenderedPdfPage[] = [];
  try {
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const size = page.getViewport({ scale: PX_PER_PT });
      const scale = PX_PER_PT * Math.min(2, MAX_RENDER_SIDE / Math.max(size.width, size.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new PdfImportError('unreadable');
      // PDF pages are drawn on white paper.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push({
        pageNumber: n,
        width: Math.round(size.width),
        height: Math.round(size.height),
        image: await canvasToBlob(canvas),
      });
      page.cleanup();
      onProgress?.(n, total);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
