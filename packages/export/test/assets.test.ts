import { encodeCanvas } from '@opencanvas/renderer/node';
import { describe, expect, it } from 'vitest';
import {
  checkImageUpload,
  concatBytes,
  contentHash,
  detectImageType,
  readImageInfo,
  readJpegDpi,
  readPngDpi,
  setJpegDpi,
  setPngDpi,
} from '../src';
import { createExportEnv, photo } from './setup';

describe('image sniffing', () => {
  it('detects types by content and reads header dimensions', async () => {
    const { platform } = createExportEnv();
    const canvas = photo(platform, 123, 45);
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const data = await encodeCanvas(canvas, format, 0.8);
      const info = readImageInfo(data);
      expect(info, format).toMatchObject({ mimeType: `image/${format}`, width: 123, height: 45 });
    }
  });

  it('recognizes GIF and SVG, and rejects disguised files', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 20, 0, 0, 0, 0]);
    expect(readImageInfo(gif)).toEqual({ mimeType: 'image/gif', width: 10, height: 20 });
    const svg = new TextEncoder().encode(
      '﻿<?xml version="1.0"?>\n<!-- c --><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    expect(detectImageType(svg)).toBe('image/svg+xml');
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect(detectImageType(html)).toBeNull();
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff]);
    expect(checkImageUpload(exe)).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('applies EXIF orientation to JPEG dimensions', async () => {
    const { platform } = createExportEnv();
    const jpeg = await encodeCanvas(photo(platform, 200, 100), 'jpeg', 0.8);
    // Build an APP1 Exif segment with Orientation = 6 (rotate 90°).
    const tiff = new Uint8Array([
      0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const payload = concatBytes([new TextEncoder().encode('Exif\0\0'), tiff]);
    const app1 = concatBytes([
      new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
      payload,
    ]);
    const rotated = concatBytes([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
    expect(readImageInfo(rotated)).toMatchObject({ width: 100, height: 200 });
  });

  it('enforces upload policy before decoding', async () => {
    const { platform } = createExportEnv();
    const png = await encodeCanvas(photo(platform, 300, 200), 'png');
    expect(checkImageUpload(png).ok).toBe(true);
    expect(
      checkImageUpload(png, { maxBytes: 10, maxPixels: 1e9, maxDimension: 1e5, allowed: ['image/png'] }),
    ).toEqual({ ok: false, reason: 'too-large' });
    expect(
      checkImageUpload(png, { maxBytes: 1e9, maxPixels: 1000, maxDimension: 1e5, allowed: ['image/png'] }),
    ).toEqual({ ok: false, reason: 'too-many-pixels' });
    expect(checkImageUpload(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
    // Forged PNG header claiming 100k × 100k pixels (decompression bomb).
    const forged = png.slice();
    forged.set([0, 1, 0x86, 0xa0, 0, 1, 0x86, 0xa0], 16);
    expect(checkImageUpload(forged)).toEqual({ ok: false, reason: 'too-many-pixels' });
  });

  it('hashes content', async () => {
    expect(await contentHash(new TextEncoder().encode('abc'))).toBe(
      'sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('DPI metadata', () => {
  it('writes and reads PNG pHYs and JPEG JFIF density', async () => {
    const { platform } = createExportEnv();
    const png = await encodeCanvas(photo(platform), 'png');
    const png300 = setPngDpi(png, 300);
    expect(readPngDpi(png300)).toBe(300);
    expect(readPngDpi(setPngDpi(png300, 150))).toBe(150); // replaces, not duplicates
    expect(readImageInfo(png300)).toMatchObject({ width: 120, height: 80 });
    const jpeg = await encodeCanvas(photo(platform), 'jpeg', 0.9);
    expect(readJpegDpi(setJpegDpi(jpeg, 300))).toBe(300);
  });
});
