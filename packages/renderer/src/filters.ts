/**
 * Deterministic pixel filters (image adjustments and blur).
 *
 * Implemented in plain JS over RGBA buffers so results are identical in every
 * browser and in Node — CSS/canvas filters differ between engines and Safari
 * does not support `ctx.filter` at all.
 */
import type { ImageAdjustments } from '@opencanvas/core';

export function hasAdjustments(a: ImageAdjustments): boolean {
  return (
    a.brightness !== 0 ||
    a.contrast !== 0 ||
    a.saturation !== 0 ||
    a.hue !== 0 ||
    a.temperature !== 0 ||
    a.grayscale !== 0 ||
    a.sepia !== 0 ||
    a.vignette !== 0
  );
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Applies image adjustments in place to non-premultiplied RGBA data. */
export function applyAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adj: ImageAdjustments,
): void {
  const brightness = 1 + adj.brightness / 100;
  const contrast = 1 + adj.contrast / 100;
  const saturation = 1 + adj.saturation / 100;
  const temp = adj.temperature * 0.6;
  const gray = adj.grayscale / 100;
  const sepia = adj.sepia / 100;
  const vignette = adj.vignette / 100;

  // Hue rotation matrix (same as the CSS hue-rotate() filter).
  const h = (adj.hue * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const hueM = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ] as const;
  const doHue = adj.hue !== 0;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i]!;
      let g = data[i + 1]!;
      let b = data[i + 2]!;
      if (brightness !== 1) {
        r *= brightness;
        g *= brightness;
        b *= brightness;
      }
      if (contrast !== 1) {
        r = (r - 128) * contrast + 128;
        g = (g - 128) * contrast + 128;
        b = (b - 128) * contrast + 128;
      }
      if (saturation !== 1) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = l + (r - l) * saturation;
        g = l + (g - l) * saturation;
        b = l + (b - l) * saturation;
      }
      if (doHue) {
        const nr = r * hueM[0] + g * hueM[1] + b * hueM[2];
        const ng = r * hueM[3] + g * hueM[4] + b * hueM[5];
        const nb = r * hueM[6] + g * hueM[7] + b * hueM[8];
        r = nr;
        g = ng;
        b = nb;
      }
      if (temp !== 0) {
        r += temp;
        b -= temp;
      }
      if (gray > 0) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r += (l - r) * gray;
        g += (l - g) * gray;
        b += (l - b) * gray;
      }
      if (sepia > 0) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r += (sr - r) * sepia;
        g += (sg - g) * sepia;
        b += (sb - b) * sepia;
      }
      if (vignette > 0) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxDist;
        const t = Math.min(1, Math.max(0, (d - 0.45) / 0.55));
        const f = 1 - vignette * t * t * (3 - 2 * t);
        r *= f;
        g *= f;
        b *= f;
      }
      data[i] = clamp255(r);
      data[i + 1] = clamp255(g);
      data[i + 2] = clamp255(b);
    }
  }
}

function boxBlurHorizontal(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      let ti = y * w;
      let li = ti;
      let ri = ti + r;
      const fv = src[ti * 4 + c]!;
      const lv = src[(ti + w - 1) * 4 + c]!;
      let val = (r + 1) * fv;
      for (let j = 0; j < r; j++) val += src[(ti + Math.min(j, w - 1)) * 4 + c]!;
      for (let j = 0; j <= r; j++) {
        val += (ri < y * w + w ? src[ri * 4 + c]! : lv) - fv;
        dst[ti * 4 + c] = val * iarr;
        ri++;
        ti++;
      }
      for (let j = r + 1; j < w - r; j++) {
        val += src[ri * 4 + c]! - src[li * 4 + c]!;
        dst[ti * 4 + c] = val * iarr;
        ri++;
        li++;
        ti++;
      }
      for (let j = Math.max(w - r, r + 1); j < w; j++) {
        val += lv - src[li * 4 + c]!;
        dst[ti * 4 + c] = val * iarr;
        li++;
        ti++;
      }
    }
  }
}

function transpose(src: Float32Array, dst: Float32Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (x * h + y) * 4;
      dst[d] = src[s]!;
      dst[d + 1] = src[s + 1]!;
      dst[d + 2] = src[s + 2]!;
      dst[d + 3] = src[s + 3]!;
    }
  }
}

/** Box sizes for a 3-pass box blur approximating a gaussian with std-dev `sigma`. */
function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

/**
 * Gaussian-like blur (3 box passes, premultiplied alpha so transparent edges
 * don't darken). `radius` follows the CSS blur() convention (std-deviation).
 */
export function blurRGBA(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  if (radius <= 0 || width === 0 || height === 0) return;
  const n = width * height * 4;
  let a = new Float32Array(n);
  let b = new Float32Array(n);
  // a holds the current image, b is scratch space.
  for (let i = 0; i < n; i += 4) {
    const alpha = data[i + 3]! / 255;
    a[i] = data[i]! * alpha;
    a[i + 1] = data[i + 1]! * alpha;
    a[i + 2] = data[i + 2]! * alpha;
    a[i + 3] = data[i + 3]!;
  }
  const boxes = boxesForGauss(radius);
  for (const size of boxes) {
    const r = Math.max(0, (size - 1) / 2);
    // The sliding window needs rows longer than the window; clamp the radius for tiny images.
    const rh = Math.min(r, Math.floor((width - 1) / 2));
    const rv = Math.min(r, Math.floor((height - 1) / 2));
    if (rh > 0) {
      boxBlurHorizontal(a, b, width, height, rh);
      [a, b] = [b, a];
    }
    if (rv > 0) {
      transpose(a, b, width, height);
      boxBlurHorizontal(b, a, height, width, rv);
      transpose(a, b, height, width);
      [a, b] = [b, a];
    }
  }
  for (let i = 0; i < n; i += 4) {
    const alpha = a[i + 3]!;
    if (alpha > 0) {
      const inv = 255 / alpha;
      data[i] = a[i]! * inv;
      data[i + 1] = a[i + 1]! * inv;
      data[i + 2] = a[i + 2]! * inv;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    data[i + 3] = alpha;
  }
}
