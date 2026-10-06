import { context2d } from '@opencanvas/renderer';
import { decodeImage } from '@opencanvas/renderer/node';
import { describe, expect, it } from 'vitest';
import { encodeIndexedPng, exportPageRaster, quantizeRgba, readImageInfo, readPngDpi } from '../src';
import { createExportEnv, photo } from './setup';

describe('palette PNG (compress)', () => {
  it('keeps images with few colors exact', async () => {
    const data = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128, 0, 0, 0, 0, 255, 0, 0, 255]);
    const q = quantizeRgba(data);
    expect(q.palette.length / 4).toBe(3);
    const png = await encodeIndexedPng(2, 2, q);
    const img = await decodeImage(png);
    const env = createExportEnv(2, 2);
    const c = env.platform.createCanvas(2, 2);
    const ctx = context2d(c);
    ctx.drawImage(img, 0, 0);
    const out = ctx.getImageData(0, 0, 2, 2).data;
    expect([...out.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(out[7]).toBeGreaterThan(120); // semi-transparent blue stays semi-transparent
    expect(out[7]).toBeLessThan(136);
    expect(out[11]).toBe(0); // transparent
  });

  it('never uses more than 256 colors and stays close to the original', () => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) data.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
    const q = quantizeRgba(data);
    expect(q.palette.length / 4).toBeLessThanOrEqual(256);
    let error = 0;
    for (let i = 0; i < 64 * 64; i++) {
      const p = q.indices[i]! * 4;
      for (let k = 0; k < 3; k++) error += Math.abs(data[i * 4 + k]! - q.palette[p + k]!);
    }
    expect(error / (64 * 64 * 3)).toBeLessThan(24);
  });

  it('compressed PNG export is smaller, keeps size and DPI', async () => {
    const env = createExportEnv(300, 200);
    env.images.set('asset_p', photo(env.platform, 300, 200) as never);
    env.run('asset.add', {
      asset: {
        typeName: 'asset',
        id: 'asset_p',
        kind: 'image',
        name: 'p',
        mimeType: 'image/png',
        width: 300,
        height: 200,
        size: 1,
        hash: `sha256-${'d'.repeat(64)}`,
        src: null,
      },
    });
    env.add({ type: 'image', assetId: 'asset_p', x: 0, y: 0, width: 300, height: 200 } as never);
    const full = await exportPageRaster(env.ctx, env.pageId, { format: 'png', dpi: 192 });
    const small = await exportPageRaster(env.ctx, env.pageId, { format: 'png', dpi: 192, compress: true });
    expect(small.data.length).toBeLessThan(full.data.length);
    expect(readImageInfo(small.data)).toMatchObject({ mimeType: 'image/png', width: 600, height: 400 });
    expect(readPngDpi(small.data)).toBe(192);
  });
});
