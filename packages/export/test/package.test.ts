import { serializeDocument, stringifyDocument } from '@opencanvas/core';
import { encodeCanvas } from '@opencanvas/renderer/node';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { contentHash, createPackage, PackageError, readPackage } from '../src';
import { createExportEnv, photo } from './setup';

async function sample() {
  const env = createExportEnv();
  const png = await encodeCanvas(photo(env.platform), 'png');
  const hash = await contentHash(png);
  env.run('asset.add', {
    asset: {
      typeName: 'asset',
      id: 'asset_1',
      kind: 'image',
      name: 'photo.png',
      mimeType: 'image/png',
      width: 120,
      height: 80,
      size: png.length,
      hash,
      src: null,
    },
  });
  env.add({ type: 'image', assetId: 'asset_1', width: 120, height: 80 } as never);
  env.add({
    type: 'text',
    content: { paragraphs: [{ runs: [{ text: 'مرحبا', style: {} }], list: 'none', indent: 0 }] },
  } as never);
  return { env, png, hash, snapshot: serializeDocument(env.store) };
}

describe('.opencanvas package', () => {
  it('round-trips the document and assets', async () => {
    const { png, hash, snapshot } = await sample();
    const bytes = createPackage({ snapshot, assets: new Map([[hash, png]]), thumbnail: png });
    const read = await readPackage(bytes);
    expect(stringifyDocument(read.snapshot)).toBe(stringifyDocument(snapshot));
    expect(read.assets.get(hash)?.data).toEqual(png);
    expect(read.assets.get(hash)?.mimeType).toBe('image/png');
    expect(read.thumbnail).not.toBeNull();
    expect(read.issues).toEqual([]);
    // Reproducible bytes.
    expect(createPackage({ snapshot, assets: new Map([[hash, png]]), thumbnail: png })).toEqual(bytes);
  });

  it('refuses to write packages with missing asset data', async () => {
    const { snapshot } = await sample();
    expect(() => createPackage({ snapshot, assets: new Map() })).toThrow(PackageError);
  });

  it('detects tampered assets', async () => {
    const { png, hash, snapshot } = await sample();
    const files = unzipSync(createPackage({ snapshot, assets: new Map([[hash, png]]) }));
    const assetPath = Object.keys(files).find((k) => k.startsWith('assets/'))!;
    const tampered = files[assetPath]!.slice();
    tampered[tampered.length - 20] = tampered[tampered.length - 20]! ^ 0xff;
    files[assetPath] = tampered;
    await expect(readPackage(zipSync(files))).rejects.toThrow(/integrity/);
  });

  it('ignores path traversal entries and rejects oversized content', async () => {
    const { png, hash, snapshot } = await sample();
    const files = unzipSync(createPackage({ snapshot, assets: new Map([[hash, png]]) }));
    files['../../evil.sh'] = strToU8('rm -rf /');
    files['assets/../../x.png'] = new Uint8Array(png);
    const read = await readPackage(zipSync(files));
    expect(read.assets.size).toBe(1);
    const bomb = zipSync({ 'manifest.json': strToU8('{}'), 'document.json': new Uint8Array(2_000_000) });
    await expect(
      readPackage(bomb, {
        maxPackageBytes: 1e9,
        maxDocumentBytes: 1_000_000,
        maxAssetBytes: 1e9,
        maxTotalBytes: 1e9,
        maxFiles: 10,
      }),
    ).rejects.toThrow(/too large/);
  });

  it('rejects files that are not packages', async () => {
    await expect(readPackage(strToU8('hello'))).rejects.toThrow(PackageError);
    await expect(readPackage(zipSync({ 'document.json': strToU8('{}') }))).rejects.toThrow(/manifest/);
    await expect(readPackage(zipSync({ 'manifest.json': strToU8('{"format":"other"}') }))).rejects.toThrow(
      /Not an OpenCanvas/,
    );
  });

  it('reports referenced assets that are missing from the package', async () => {
    const { png, hash, snapshot } = await sample();
    const files = unzipSync(createPackage({ snapshot, assets: new Map([[hash, png]]) }));
    for (const k of Object.keys(files)) if (k.startsWith('assets/')) delete files[k];
    const read = await readPackage(zipSync(files));
    expect(read.issues.some((i) => i.message.includes('missing'))).toBe(true);
  });
});
