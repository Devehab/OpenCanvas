import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AnyNodeProps,
  createDefaultCommandRegistry,
  createDocumentSnapshot,
  createSequentialIdGenerator,
  createTextAutosizeFinalizer,
  DocumentStore,
  executeCommand,
  type Fill,
  type Id,
  normalizeGroupsFinalizer,
} from '@opencanvas/core';
import {
  type CanvasLike,
  context2d,
  createCanvasMeasurer,
  MapImageResolver,
  SceneRenderer,
} from '@opencanvas/renderer';
import { createNodePlatform, encodeCanvas, registerFont } from '@opencanvas/renderer/node';
import type { CanvasEncoder, ExportContext } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const fonts = join(here, '../node_modules/@fontsource');
let registered = false;

export function createExportEnv(
  width = 400,
  height = 300,
  background: Fill = { type: 'solid', color: '#ffffff' },
) {
  if (!registered) {
    registered = true;
    for (const w of [400, 700]) {
      registerFont(join(fonts, `inter/files/inter-latin-${w}-normal.woff2`), 'Inter');
      registerFont(join(fonts, `cairo/files/cairo-arabic-${w}-normal.woff2`), 'Cairo');
      registerFont(join(fonts, `cairo/files/cairo-latin-${w}-normal.woff2`), 'Cairo Latin');
    }
  }
  const platform = createNodePlatform();
  const measurer = createCanvasMeasurer(platform, ['Cairo Latin', 'Cairo']);
  const images = new MapImageResolver();
  const renderer = new SceneRenderer(platform, images, measurer);
  const createId = createSequentialIdGenerator();
  const store = new DocumentStore(
    createDocumentSnapshot({ width, height, background, createId, title: 'تصميم Test' }).records,
  );
  store.addFinalizer(createTextAutosizeFinalizer(measurer));
  store.addFinalizer(normalizeGroupsFinalizer);
  const registry = createDefaultCommandRegistry();
  const run = (id: string, payload: unknown) =>
    executeCommand(store, registry, id, payload, { createId, measurer }).result;
  const pageId = store.getPageIds()[0]!;
  const add = (props: AnyNodeProps, parentId: Id = pageId): Id =>
    run('node.create', { parentId, nodes: [props] }).select![0]!;
  const encoder: CanvasEncoder = {
    encode: (canvas, format, quality) => encodeCanvas(canvas, format, quality),
  };
  const ctx: ExportContext = { store, renderer, platform, encoder };
  return { platform, measurer, images, renderer, store, run, add, pageId, ctx, createId };
}

export function pixels(canvas: CanvasLike): Uint8ClampedArray {
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
}

export function photo(platform: ReturnType<typeof createNodePlatform>, w = 120, h = 80): CanvasLike {
  const c = platform.createCanvas(w, h);
  const ctx = context2d(c);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0ea5e9');
  g.addColorStop(1, '#f43f5e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(w * 0.6, h * 0.2, w * 0.25, h * 0.4);
  return c;
}
