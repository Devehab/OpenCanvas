// Image effects: an example OpenCanvas plugin.
// Reads the selected photo, changes its pixels on an OffscreenCanvas and
// replaces it. Runs in the plugin sandbox; `opencanvas` is the plugin API.

const effects = {
  grayscale(r, g, b) {
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [y, y, y];
  },
  sepia(r, g, b) {
    return [
      0.393 * r + 0.769 * g + 0.189 * b,
      0.349 * r + 0.686 * g + 0.168 * b,
      0.272 * r + 0.534 * g + 0.131 * b,
    ];
  },
  invert(r, g, b) {
    return [255 - r, 255 - g, 255 - b];
  },
  warm(r, g, b) {
    return [r * 1.08 + 10, g * 1.02 + 4, b * 0.88];
  },
};

async function apply(name, context) {
  const [nodeId] = context.selection;
  if (!nodeId) throw new Error('Select a photo first');
  const image = await opencanvas.images.get(nodeId);
  const bitmap = await createImageBitmap(image.blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  const fn = effects[name];
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(pixels, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  await opencanvas.images.replace(nodeId, blob);
}

for (const name of Object.keys(effects)) {
  opencanvas.commands.register(name, (context) => apply(name, context));
}
