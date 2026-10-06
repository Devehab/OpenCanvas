/**
 * Compressed PNG export: reduces an RGBA image to at most 256 colors (median
 * cut over a 5-bit-per-channel histogram) and writes an indexed-color PNG
 * (palette + transparency), typically 3–5× smaller than a true-color PNG.
 */
import { concatBytes, crc32 } from './bytes';

export interface QuantizedImage {
  /** RGBA quadruplets, one per palette entry. */
  palette: Uint8Array;
  /** One palette index per pixel. */
  indices: Uint8Array;
}

interface Bucket {
  r: number;
  g: number;
  b: number;
  a: number;
  count: number;
}

const keyOf = (r: number, g: number, b: number, a: number) =>
  ((r >> 3) << 15) | ((g >> 3) << 10) | ((b >> 3) << 5) | (a >> 3);

/** Median-cut quantization to at most `maxColors` colors. */
export function quantizeRgba(data: Uint8Array | Uint8ClampedArray, maxColors = 256): QuantizedImage {
  const limit = Math.max(2, Math.min(256, Math.floor(maxColors)));
  // Histogram of 20-bit color keys with summed channels (for exact averages).
  const sums = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    // Fully transparent pixels are one color, whatever their RGB.
    const [r, g, b] = a === 0 ? [0, 0, 0] : [data[i]!, data[i + 1]!, data[i + 2]!];
    const key = keyOf(r, g, b, a);
    const bucket = sums.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.a += a;
      bucket.count++;
    } else sums.set(key, { r, g, b, a, count: 1 });
  }
  const colors = [...sums.values()].map((s) => ({
    r: s.r / s.count,
    g: s.g / s.count,
    b: s.b / s.count,
    a: s.a / s.count,
    count: s.count,
  }));

  // Median cut: repeatedly split the box with the widest (weighted) channel range.
  type Color = (typeof colors)[number];
  const channels = ['r', 'g', 'b', 'a'] as const;
  interface Box {
    colors: Color[];
    channel: (typeof channels)[number];
    score: number;
  }
  const makeBox = (list: Color[]): Box => {
    let channel: Box['channel'] = 'r';
    let spread = -1;
    let weight = 0;
    for (const c of list) weight += c.count;
    for (const ch of channels) {
      let min = 255;
      let max = 0;
      for (const c of list) {
        if (c[ch] < min) min = c[ch];
        if (c[ch] > max) max = c[ch];
      }
      const s = (max - min) * (ch === 'a' ? 1.5 : 1);
      if (s > spread) {
        spread = s;
        channel = ch;
      }
    }
    return { colors: list, channel, score: list.length < 2 ? 0 : spread * Math.sqrt(weight) };
  };
  const boxes: Box[] = [makeBox(colors)];
  while (boxes.length < limit) {
    let index = -1;
    let score = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i]!.score > score) {
        score = boxes[i]!.score;
        index = i;
      }
    }
    if (index < 0) break;
    const { colors: list, channel } = boxes[index]!;
    list.sort((x, y) => x[channel] - y[channel]);
    const total = list.reduce((sum, c) => sum + c.count, 0);
    let acc = 0;
    let cut = 1;
    for (; cut < list.length - 1; cut++) {
      acc += list[cut - 1]!.count;
      if (acc >= total / 2) break;
    }
    boxes.splice(index, 1, makeBox(list.slice(0, cut)), makeBox(list.slice(cut)));
  }

  const palette = new Uint8Array(boxes.length * 4);
  boxes.forEach(({ colors: box }, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;
    for (const c of box) {
      r += c.r * c.count;
      g += c.g * c.count;
      b += c.b * c.count;
      a += c.a * c.count;
      n += c.count;
    }
    palette.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)], i * 4);
  });

  // Map pixels to the nearest palette entry (cached per histogram key).
  const cache = new Map<number, number>();
  const nearest = (r: number, g: number, b: number, a: number) => {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let p = 0; p < palette.length; p += 4) {
      const dr = r - palette[p]!;
      const dg = g - palette[p + 1]!;
      const db = b - palette[p + 2]!;
      const da = a - palette[p + 3]!;
      const d = dr * dr + dg * dg + db * db + da * da * 2;
      if (d < bestD) {
        bestD = d;
        best = p / 4;
      }
    }
    return best;
  };
  const indices = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3]!;
    const [r, g, b] = a === 0 ? [0, 0, 0] : [data[i]!, data[i + 1]!, data[i + 2]!];
    const key = keyOf(r, g, b, a);
    let index = cache.get(key);
    if (index === undefined) {
      index = nearest(r, g, b, a);
      cache.set(key, index);
    }
    indices[p] = index;
  }
  return { palette, indices };
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  // "deflate" in the Compression Streams API is the zlib format PNG expects.
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const head = new Uint8Array(8);
  const view = new DataView(head.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
  const typed = concatBytes([head.subarray(4), body]);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(typed));
  return concatBytes([head, body, crc]);
}

/** Writes an indexed-color PNG (color type 3, 8 bits per index). */
export async function encodeIndexedPng(
  width: number,
  height: number,
  image: QuantizedImage,
): Promise<Uint8Array> {
  const { palette, indices } = image;
  const count = palette.length / 4;
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 3, 0, 0, 0], 8); // bit depth 8, palette, deflate, filter 0, no interlace
  const plte = new Uint8Array(count * 3);
  const alpha = new Uint8Array(count);
  let lastOpaque = -1;
  for (let i = 0; i < count; i++) {
    plte.set([palette[i * 4]!, palette[i * 4 + 1]!, palette[i * 4 + 2]!], i * 3);
    alpha[i] = palette[i * 4 + 3]!;
    if (alpha[i] !== 255) lastOpaque = i;
  }
  // Scanlines: filter byte 0 (none) + one index byte per pixel.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concatBytes([
    signature,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(lastOpaque >= 0 ? [chunk('tRNS', alpha.subarray(0, lastOpaque + 1))] : []),
    chunk('IDAT', await zlibDeflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
