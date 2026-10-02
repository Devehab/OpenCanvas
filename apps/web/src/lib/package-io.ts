/**
 * Saving and opening `.opencanvas` files in the browser.
 */
import type { DocumentSnapshot } from '@opencanvas/core';
import {
  createPackage,
  PACKAGE_EXTENSION,
  PACKAGE_MIME,
  readPackage,
  safeFileName,
} from '@opencanvas/export';
import { getAssetBlob, putAssetBlob } from './storage/assets';
import { createDesign, type DesignRecord } from './storage/designs';
import { getThumbnail } from './storage/thumbnails';
import { downloadBytes } from './utils';

export async function buildPackage(snapshot: DocumentSnapshot, thumbnailFor?: string): Promise<Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  for (const record of snapshot.records) {
    if (record.typeName !== 'asset' || assets.has(record.hash)) continue;
    const blob = await getAssetBlob(record.hash);
    if (blob) assets.set(record.hash, new Uint8Array(await blob.arrayBuffer()));
  }
  // Drop asset records whose bytes are unavailable so the package stays valid.
  const usable: DocumentSnapshot = {
    ...snapshot,
    records: snapshot.records.filter((r) => r.typeName !== 'asset' || assets.has(r.hash)),
  };
  let thumbnail: Uint8Array | null = null;
  if (thumbnailFor) {
    const blob = await getThumbnail(thumbnailFor);
    if (blob?.type === 'image/png') thumbnail = new Uint8Array(await blob.arrayBuffer());
  }
  return createPackage({ snapshot: usable, assets, thumbnail, createdWith: 'OpenCanvas web' });
}

export async function downloadDesignPackage(
  design: Pick<DesignRecord, 'id' | 'title' | 'snapshot'>,
): Promise<void> {
  const bytes = await buildPackage(design.snapshot, design.id);
  downloadBytes(bytes, `${safeFileName(design.title)}${PACKAGE_EXTENSION}`, PACKAGE_MIME);
}

/** Opens a `.opencanvas` file: stores its assets and creates a new design. */
export async function importPackageFile(file: File): Promise<DesignRecord> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pkg = await readPackage(bytes);
  for (const [hash, asset] of pkg.assets) {
    const record = pkg.snapshot.records.find((r) => r.typeName === 'asset' && r.hash === hash);
    await putAssetBlob({
      hash,
      blob: new Blob([asset.data as Uint8Array<ArrayBuffer>], { type: asset.mimeType }),
      mimeType: asset.mimeType,
      width: record?.typeName === 'asset' ? record.width : 1,
      height: record?.typeName === 'asset' ? record.height : 1,
      name: record?.typeName === 'asset' ? record.name : '',
    });
  }
  const doc = pkg.snapshot.records.find((r) => r.typeName === 'document');
  const page = pkg.snapshot.records.find((r) => r.typeName === 'page');
  return createDesign({
    title: doc?.typeName === 'document' ? doc.title : file.name.replace(/\.opencanvas$/i, ''),
    width: page?.typeName === 'page' ? page.width : 1080,
    height: page?.typeName === 'page' ? page.height : 1080,
    snapshot: pkg.snapshot,
  });
}
