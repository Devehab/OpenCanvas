/**
 * The `.opencanvas` package: a ZIP container holding a design and its assets,
 * so a design can be saved, shared and re-opened anywhere (and is easy to
 * inspect with any unzip tool).
 *
 *   manifest.json      { format, version, document, assets[], createdWith }
 *   document.json      canonical opencanvas.document JSON
 *   assets/<hash>.<ext>
 *   thumbnail.png      optional preview
 *
 * Reading is defensive: size limits are checked before inflating (zip bombs),
 * paths are whitelisted (no traversal), every asset's SHA-256 must match the
 * hash recorded in the document, and the document goes through full schema
 * validation and integrity repair.
 */
import {
  type AssetRecord,
  type DocumentSnapshot,
  type IntegrityIssue,
  parseDocument,
  stringifyDocument,
} from '@opencanvas/core';
import { unzipSync, zipSync } from 'fflate';
import { detectImageType, extensionForMime, type ImageMimeType } from './assets';
import { contentHash, textDecoder, textEncoder } from './bytes';

export const PACKAGE_FORMAT = 'opencanvas.package';
export const PACKAGE_VERSION = 1;
export const PACKAGE_EXTENSION = '.opencanvas';
export const PACKAGE_MIME = 'application/vnd.opencanvas+zip';

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  version: number;
  createdWith: string;
  document: string;
  thumbnail: string | null;
  assets: { hash: string; path: string; mimeType: string; size: number }[];
}

export interface PackageLimits {
  maxPackageBytes: number;
  maxDocumentBytes: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
}

export const DEFAULT_PACKAGE_LIMITS: PackageLimits = {
  maxPackageBytes: 500 * 1024 * 1024,
  maxDocumentBytes: 50 * 1024 * 1024,
  maxAssetBytes: 50 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxFiles: 5_100,
};

export class PackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageError';
  }
}

const hashHex = (hash: string) => hash.replace(/^sha256-/, '');

export interface CreatePackageInput {
  snapshot: DocumentSnapshot;
  /** Binary data per asset content hash. */
  assets: ReadonlyMap<string, Uint8Array>;
  thumbnail?: Uint8Array | null;
  createdWith?: string;
}

/** Writes a `.opencanvas` package. Assets referenced by the document but missing from `assets` are an error. */
export function createPackage(input: CreatePackageInput): Uint8Array {
  const assetRecords = input.snapshot.records.filter((r): r is AssetRecord => r.typeName === 'asset');
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const manifestAssets: PackageManifest['assets'] = [];
  const seen = new Set<string>();
  for (const asset of assetRecords) {
    if (seen.has(asset.hash)) continue;
    seen.add(asset.hash);
    const data = input.assets.get(asset.hash);
    if (!data) throw new PackageError(`Missing data for asset ${asset.id} (${asset.hash})`);
    const path = `assets/${hashHex(asset.hash)}.${extensionForMime(asset.mimeType)}`;
    // Images are already compressed; store them as-is.
    files[path] = [data, { level: 0 }];
    manifestAssets.push({ hash: asset.hash, path, mimeType: asset.mimeType, size: data.length });
  }
  const documentJson = stringifyDocument(input.snapshot, { pretty: true });
  files['document.json'] = textEncoder.encode(documentJson);
  if (input.thumbnail) files['thumbnail.png'] = [input.thumbnail, { level: 0 }];
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdWith: input.createdWith ?? 'OpenCanvas',
    document: 'document.json',
    thumbnail: input.thumbnail ? 'thumbnail.png' : null,
    assets: manifestAssets,
  };
  files['manifest.json'] = textEncoder.encode(JSON.stringify(manifest, null, 2));
  // Fixed timestamps keep packages byte-for-byte reproducible.
  return zipSync(files as Parameters<typeof zipSync>[0], {
    level: 6,
    mtime: new Date('2000-01-01T00:00:00Z'),
  });
}

export interface ReadPackageResult {
  snapshot: DocumentSnapshot;
  assets: Map<string, { data: Uint8Array; mimeType: ImageMimeType }>;
  thumbnail: Uint8Array | null;
  issues: IntegrityIssue[];
  manifest: PackageManifest;
}

const SAFE_PATH = /^(manifest\.json|document\.json|thumbnail\.png|assets\/[0-9a-f]{64}\.[a-z0-9]{2,5})$/;

/** Reads and fully validates a `.opencanvas` package. Throws {@link PackageError} or ValidationError. */
export async function readPackage(
  bytes: Uint8Array,
  limits: PackageLimits = DEFAULT_PACKAGE_LIMITS,
): Promise<ReadPackageResult> {
  if (bytes.length > limits.maxPackageBytes) throw new PackageError('File is too large');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new PackageError('Not an OpenCanvas file (expected a ZIP container)');
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        count++;
        if (count > limits.maxFiles) throw new PackageError('Too many files in package');
        if (!SAFE_PATH.test(file.name)) return false; // ignore anything unexpected (incl. traversal paths)
        const max = file.name === 'document.json' ? limits.maxDocumentBytes : limits.maxAssetBytes;
        if (file.originalSize > max) throw new PackageError(`${file.name} is too large`);
        total += file.originalSize;
        if (total > limits.maxTotalBytes) throw new PackageError('Package content is too large');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PackageError) throw error;
    throw new PackageError(`Corrupt package: ${(error as Error).message}`);
  }
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new PackageError('Missing manifest.json');
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(textDecoder.decode(manifestBytes)) as PackageManifest;
  } catch {
    throw new PackageError('manifest.json is not valid JSON');
  }
  if (manifest.format !== PACKAGE_FORMAT) throw new PackageError('Not an OpenCanvas package');
  if (manifest.version > PACKAGE_VERSION)
    throw new PackageError('This file was created by a newer version of OpenCanvas');
  const documentBytes = files['document.json'];
  if (!documentBytes) throw new PackageError('Missing document.json');
  const { snapshot, issues } = parseDocument(textDecoder.decode(documentBytes));

  const assets = new Map<string, { data: Uint8Array; mimeType: ImageMimeType }>();
  const byHash = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith('assets/')) continue;
    byHash.set(`sha256-${name.slice(7, 71)}`, data);
  }
  for (const record of snapshot.records) {
    if (record.typeName !== 'asset' || assets.has(record.hash)) continue;
    const data = byHash.get(record.hash);
    if (!data) {
      issues.push({ id: record.id, message: `Asset file for ${record.id} is missing`, repaired: false });
      continue;
    }
    if ((await contentHash(data)) !== record.hash)
      throw new PackageError(`Asset ${record.id} failed its integrity check`);
    const mimeType = detectImageType(data);
    if (!mimeType) throw new PackageError(`Asset ${record.id} is not a supported image`);
    assets.set(record.hash, { data, mimeType });
  }
  const thumbnail =
    files['thumbnail.png'] && detectImageType(files['thumbnail.png']) === 'image/png'
      ? files['thumbnail.png']
      : null;
  return { snapshot, assets, thumbnail, issues, manifest };
}
