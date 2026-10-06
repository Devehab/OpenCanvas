// Remove plain background: an example OpenCanvas plugin.
// Flood-fills from the image edges through pixels close to the background
// color (sampled at the corners) and makes them transparent, with a soft
// edge. No network, no AI model: it suits plain backgrounds only.

const TOLERANCE = 42; // color distance still counted as background
const FEATHER = 24; // distance over which the edge fades in

function distance(d, i, bg) {
  return Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
}

function backgroundColor(d, w, h) {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => p * 4);
  const sum = [0, 0, 0];
  for (const i of corners) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
  return sum.map((v) => v / corners.length);
}

opencanvas.commands.register('remove', async (context) => {
  const [nodeId] = context.selection;
  if (!nodeId) throw new Error('Select a photo first');
  const image = await opencanvas.images.get(nodeId);
  const bitmap = await createImageBitmap(image.blob);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h);
  const d = pixels.data;
  const bg = backgroundColor(d, w, h);

  // Breadth-first fill from every edge pixel that looks like background.
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (p) => {
    if (visited[p]) return;
    visited[p] = 1;
    if (distance(d, p * 4, bg) <= TOLERANCE + FEATHER) queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const i = p * 4;
    const dist = distance(d, i, bg);
    // Fully transparent inside the tolerance, fading out across the feather band.
    const alpha = dist <= TOLERANCE ? 0 : Math.round(((dist - TOLERANCE) / FEATHER) * 255);
    d[i + 3] = Math.min(d[i + 3], alpha);
    if (dist > TOLERANCE) continue; // edge pixels do not spread the fill
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < (h - 1) * w) push(p + w);
  }
  ctx.putImageData(pixels, 0, 0);
  await opencanvas.images.replace(nodeId, await canvas.convertToBlob({ type: 'image/png' }));
  await opencanvas.ui.toast(opencanvas.locale === 'ar' ? 'أُزيلت الخلفية' : 'Background removed', 'success');
});
