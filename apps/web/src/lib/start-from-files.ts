/**
 * Start a design from files dropped on the dashboard (or chosen with "Open a
 * file"): an .opencanvas file opens as it was saved; images become pages the
 * size of each image; a PDF becomes one page per PDF page, its content locked
 * in place so new elements can go on top.
 */
import { createDocumentFromImages, type ImagePage } from '@opencanvas/core';
import { broadcast, TAB_ID } from './channel';
import { importPackageFile } from './package-io';
import { renderPdfPages } from './pdf-import';
import { createDesign, type DesignRecord } from './storage/designs';
import { prepareImage } from './upload';

export interface StartFailure {
  name: string;
  reason: string;
}

export interface StartProgress {
  /** Name of the file being read. */
  name: string;
  done: number;
  total: number;
}

export interface StartResult {
  design: DesignRecord | null;
  failures: StartFailure[];
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim() || name;

async function startsWith(file: Blob, signature: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  return String.fromCharCode(...head) === signature;
}

export const isPackageFile = (file: File) =>
  /\.opencanvas$/i.test(file.name) || file.type === 'application/vnd.opencanvas+zip';

/** Files this flow understands (others are reported, not imported). */
export const START_FILE_ACCEPT =
  '.opencanvas,application/vnd.opencanvas+zip,application/zip,application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif';

export async function designFromFiles(
  files: readonly File[],
  onProgress?: (progress: StartProgress) => void,
): Promise<StartResult> {
  const failures: StartFailure[] = [];
  const pkg = files.find(isPackageFile);
  if (pkg) {
    const design = await importPackageFile(pkg);
    broadcast({ type: 'designs-changed', tabId: TAB_ID });
    return { design, failures };
  }
  const pages: ImagePage[] = [];
  for (const [i, file] of files.entries()) {
    onProgress?.({ name: file.name, done: i, total: files.length });
    if (file.type === 'application/pdf' || (await startsWith(file, '%PDF-'))) {
      try {
        const rendered = await renderPdfPages(file, (done, total) =>
          onProgress?.({ name: `${file.name} (${done}/${total})`, done: i, total: files.length }),
        );
        for (const page of rendered) {
          const prepared = await prepareImage(page.image, `${baseName(file.name)} – ${page.pageNumber}`);
          if (!prepared.ok) {
            failures.push({ name: file.name, reason: prepared.reason });
            continue;
          }
          pages.push({ asset: prepared.asset, width: page.width, height: page.height, locked: true });
        }
      } catch (error) {
        failures.push({ name: file.name, reason: (error as Error).message || 'unreadable' });
      }
      continue;
    }
    const prepared = await prepareImage(file, file.name);
    if (prepared.ok) pages.push({ asset: prepared.asset, locked: false });
    else failures.push({ name: file.name, reason: prepared.reason });
  }
  if (pages.length === 0) return { design: null, failures };
  const snapshot = createDocumentFromImages(pages, { title: baseName(files[0]!.name) });
  // Records are in canonical order: the first page is the one with the lowest index.
  const first = snapshot.records
    .filter((r): r is Extract<typeof r, { typeName: 'page' }> => r.typeName === 'page')
    .sort((a, b) => (a.index < b.index ? -1 : 1))[0]!;
  const design = await createDesign({
    title: baseName(files[0]!.name),
    width: first.width,
    height: first.height,
    snapshot,
  });
  broadcast({ type: 'designs-changed', tabId: TAB_ID });
  return { design, failures };
}
