#!/usr/bin/env node
/**
 * Records the landing page media (site/assets/media) from the real app:
 * animated GIFs of features being used, and screenshots in English and Arabic.
 *
 *   pnpm build && pnpm start            # or any running instance
 *   BASE_URL=http://localhost:3000 node scripts/capture-site-media.mjs [scenario…]
 *
 * Needs Playwright's Chromium and ffmpeg. Scenarios: see SCENARIOS below.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bokeh, desertSunset, logo, mountainLake, nightCity } from './site-media/photos.mjs';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const OUT = new URL('../site/assets/media/', import.meta.url).pathname;
const WORK = mkdtempSync(join(tmpdir(), 'oc-media-'));
const VIEW = { width: 1280, height: 800 };
/** Editor GIFs: everything but the properties panel on the right. */
const EDITOR_CROP = { crop: { x: 0, y: 0, w: 992, h: 800 }, width: 800 };
mkdirSync(OUT, { recursive: true });

const PHOTOS = {
  desert: { name: 'desert.jpg', mimeType: 'image/jpeg', buffer: desertSunset() },
  lake: { name: 'lake.jpg', mimeType: 'image/jpeg', buffer: mountainLake() },
  city: { name: 'city.jpg', mimeType: 'image/jpeg', buffer: nightCity() },
  bokeh: { name: 'bokeh.jpg', mimeType: 'image/jpeg', buffer: bokeh() },
  logo: { name: 'nakhla-logo.png', mimeType: 'image/png', buffer: logo() },
};
const LUCIDE = JSON.parse(
  readFileSync(new URL('../apps/web/src/lib/icon-library/lucide.json', import.meta.url), 'utf8'),
);
const iconPath = (name) => LUCIDE.icons.find((i) => i[0] === name)[1];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A visible cursor (Playwright videos have none) with a click ripple. */
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__oc_cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = '__oc_cursor';
    cursor.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2.5l14 9.2-6.3 1.3-3.4 6.5z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: 'translate(-200px,-200px)',
      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))',
    });
    document.documentElement.appendChild(cursor);
    const move = (e) => {
      cursor.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`;
    };
    for (const type of ['mousemove', 'pointermove', 'dragover', 'drag'])
      document.addEventListener(type, move, { capture: true, passive: true });
    document.addEventListener(
      'mousedown',
      (e) => {
        const ring = document.createElement('div');
        Object.assign(ring.style, {
          position: 'fixed',
          left: `${e.clientX - 18}px`,
          top: `${e.clientY - 18}px`,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '3px solid rgba(124,108,248,.9)',
          zIndex: '2147483646',
          pointerEvents: 'none',
          transition: 'transform .45s ease-out, opacity .45s ease-out',
        });
        document.documentElement.appendChild(ring);
        requestAnimationFrame(() => {
          ring.style.transform = 'scale(1.8)';
          ring.style.opacity = '0';
        });
        setTimeout(() => ring.remove(), 500);
      },
      { capture: true },
    );
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

/** A page in a fresh browser profile; `record` keeps a video. */
async function openPage(browser, { locale = 'en', record = false, scale = 1, viewport = VIEW } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    locale: locale === 'ar' ? 'ar' : 'en-US',
    timezoneId: 'UTC',
    ...(record ? { recordVideo: { dir: WORK, size: viewport } } : {}),
  });
  if (locale === 'ar') await context.addCookies([{ name: 'oc-locale', value: 'ar', url: BASE }]);
  await context.addInitScript(CURSOR_SCRIPT);
  // Keep the "page view" and other preferences at their defaults.
  const page = await context.newPage();
  const t0 = Date.now();
  page.on('pageerror', (e) => console.warn('  page error:', e.message));
  return { context, page, mark: () => (Date.now() - t0) / 1000 };
}

async function waitIdle(page) {
  await page.waitForFunction(async () => {
    const oc = window.__opencanvas;
    if (!oc) return false;
    const ready = () => oc.view.idle && oc.session.images.pending === 0 && document.fonts.status === 'loaded';
    if (!ready()) return false;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return ready();
  });
}

async function newDesign(page, format = 'instagram-post') {
  await page.goto(`${BASE}/`);
  await page.getByTestId(`format-${format}`).click();
  await page.waitForURL(/\/design\//);
  await page.waitForFunction(() => !!window.__opencanvas?.editor);
  await waitIdle(page);
}

/** Uploads photos through the Uploads panel; returns the new image ids (in order). */
async function uploadPhotos(page, photos) {
  const tab = page.getByTestId('panel-tab-uploads');
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  const ids = [];
  for (const photo of photos) {
    const before = await page.evaluate(() => window.__opencanvas.editor.store.getAssets().length);
    await page.getByTestId('upload-input').setInputFiles([photo]);
    await page.waitForFunction((n) => window.__opencanvas.editor.store.getAssets().length > n, before);
    ids.push(await page.evaluate(() => window.__opencanvas.editor.selectedIds[0]));
  }
  await waitIdle(page);
  return ids;
}

const run = (page, fn, arg) => page.evaluate(fn, arg);

/** Screen position of a page point. */
async function toScreen(page, p) {
  return page.evaluate((pt) => {
    const { editor } = window.__opencanvas;
    const c = editor.state.get().camera;
    const r = document.querySelector('[data-testid="canvas"]').getBoundingClientRect();
    return { x: r.left + c.x + pt.x * c.zoom, y: r.top + c.y + pt.y * c.zoom };
  }, p);
}

async function glide(page, to, steps = 18) {
  await page.mouse.move(to.x, to.y, { steps });
}

async function dragOnCanvas(page, from, to, steps = 28) {
  const a = await toScreen(page, from);
  const b = await toScreen(page, to);
  await glide(page, a, 14);
  await sleep(200);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await sleep(450);
  await page.mouse.up();
}

async function clickTestId(page, id, pause = 350) {
  const box = await page.getByTestId(id).first().boundingBox();
  await glide(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await sleep(150);
  await page.getByTestId(id).first().click();
  await sleep(pause);
}

async function clickLocator(page, locator, pause = 350) {
  const box = await locator.boundingBox();
  await glide(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await sleep(150);
  await locator.click();
  await sleep(pause);
}

/** Converts part of a recorded video into an optimized GIF. */
function toGif(video, name, { start, end, width = 800, fps = 10, crop } = {}) {
  const out = join(OUT, `${name}.gif`);
  const prefix = [
    ...(crop ? [`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`] : []),
    `fps=${fps}`,
    `scale=${width}:-1:flags=lanczos`,
  ];
  const graph = `${prefix.join(',')},split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    String(Math.max(0, start)),
    ...(end ? ['-to', String(end)] : []),
    '-i',
    video,
    '-vf',
    graph,
    '-loop',
    '0',
    out,
  ]);
  console.log(`  ${name}.gif  ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

async function finishRecording(context, page) {
  const video = page.video();
  await page.close();
  await context.close();
  return video.path();
}

async function shot(page, name, options = {}) {
  const png = join(WORK, `${name}.png`);
  await page.screenshot({ path: png, ...options });
  const out = join(OUT, `${name}.webp`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '86', out]);
  console.log(`  ${name}.webp  ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------------------
// Design builders

const text = (content, style, extra = {}) => ({
  type: 'text',
  sizing: 'auto-height',
  content: {
    paragraphs: content
      .split('\n')
      .map((line) => ({ runs: [{ text: line, style: {} }], list: 'none', indent: 0 })),
  },
  style: { color: '#ffffff', ...style },
  ...extra,
});

/** The showcase poster: gradient, a photo in a heart frame, bilingual headline, icons. */
async function buildPoster(page) {
  const [photo] = await uploadPhotos(page, [PHOTOS.desert]);
  await run(
    page,
    ({ photo, nodes, sparkles }) => {
      const { editor } = window.__opencanvas;
      editor.execute('page.update', {
        id: editor.pageId,
        patch: {
          background: {
            type: 'linear-gradient',
            angle: 135,
            stops: [
              { offset: 0, color: '#2b1055' },
              { offset: 0.55, color: '#7c3aed' },
              { offset: 1, color: '#db2777' },
            ],
          },
        },
      });
      const [frame] = editor.insertNodes([nodes.frame], { center: false });
      editor.execute('frame.fill', { frameId: frame, imageId: photo });
      editor.insertNodes(nodes.rest, { center: false });
      editor.insertNodes(
        sparkles.map((s) => ({
          type: 'path',
          path: s.path,
          viewBox: { x: 0, y: 0, width: 24, height: 24 },
          x: s.x,
          y: s.y,
          width: s.size,
          height: s.size,
          fill: null,
          stroke: { color: s.color, width: 1.6, style: 'solid', cap: 'round', join: 'round' },
        })),
        { center: false },
      );
      editor.select([]);
    },
    {
      photo,
      sparkles: [
        { path: iconPath('sparkles'), x: 120, y: 330, size: 110, color: '#fde68a' },
        { path: iconPath('sparkles'), x: 860, y: 560, size: 90, color: '#ffffff' },
        { path: iconPath('heart'), x: 880, y: 300, size: 70, color: '#fbcfe8' },
      ],
      nodes: {
        frame: {
          type: 'frame',
          shape: 'heart',
          x: 290,
          y: 250,
          width: 500,
          height: 450,
          fill: { type: 'solid', color: '#e5e7eb' },
          clipContent: true,
          shadow: { color: '#0f172a66', offsetX: 0, offsetY: 18, blur: 40 },
        },
        rest: [
          text(
            'صمّم بلا حدود',
            { fontFamily: 'Cairo', fontSize: 104, fontWeight: 800 },
            { x: 40, y: 50, width: 1000, align: 'center' },
          ),
          text(
            'Design without limits',
            { fontFamily: 'Inter', fontSize: 46, fontWeight: 700 },
            { x: 40, y: 735, width: 1000, align: 'center' },
          ),
          text(
            'Free · Open source · Private',
            { fontFamily: 'Inter', fontSize: 30, fontWeight: 500, color: '#fce7f3' },
            { x: 40, y: 805, width: 1000, align: 'center' },
          ),
          {
            type: 'shape',
            shape: 'rect',
            x: 360,
            y: 900,
            width: 360,
            height: 86,
            cornerRadius: 43,
            fill: { type: 'solid', color: '#ffffff' },
          },
          text(
            'OpenCanvas',
            { fontFamily: 'Inter', fontSize: 40, fontWeight: 800, color: '#7c3aed' },
            { x: 360, y: 918, width: 360, align: 'center' },
          ),
        ],
      },
    },
  );
  await waitIdle(page);
}

// ---------------------------------------------------------------------------
// Scenarios

const SCENARIOS = {
  /** Screenshots for the hero, the gallery and the Arabic section. */
  async screenshots(browser) {
    for (const locale of ['en', 'ar']) {
      const { context, page } = await openPage(browser, {
        locale,
        scale: 2,
        viewport: { width: 1440, height: 900 },
      });
      await newDesign(page);
      await buildPoster(page);
      await page.getByTestId('panel-tab-elements').click();
      await page.mouse.move(-10, -10);
      await sleep(600);
      await waitIdle(page);
      await shot(page, `editor-${locale}`);

      // A few more designs for the dashboard and projects.
      for (const [format, photo] of [
        ['presentation', PHOTOS.lake],
        ['youtube-thumbnail', PHOTOS.city],
        ['instagram-story', PHOTOS.bokeh],
      ]) {
        await newDesign(page, format);
        await uploadPhotos(page, [photo]);
        await run(page, () => {
          const { editor } = window.__opencanvas;
          const page0 = editor.store.getPage(editor.pageId);
          const [id] = editor.selectedIds;
          editor.execute('node.update', {
            ids: [id],
            patch: { x: 0, y: 0, width: page0.width, height: page0.height },
          });
          editor.select([]);
        });
        await waitIdle(page);
        await sleep(800);
      }
      await page.goto(`${BASE}/`);
      await sleep(2500);
      await page.mouse.move(-10, -10);
      await shot(page, `dashboard-${locale}`);
      if (locale === 'en') {
        await page.getByTestId('create-design').click();
        await sleep(700);
        await shot(page, 'create-dialog-en');
      }
      await context.close();
    }
  },

  async brand(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    // Set up a brand kit through the UI.
    await page.goto(`${BASE}/brand`);
    await page.getByTestId('new-brand').first().click();
    await page.getByTestId('brand-kit-name').fill('Nakhla');
    await page.getByTestId('create-brand').click();
    await page.waitForURL(/\/brand\?id=/);
    await page.getByTestId('brand-input-logos').setInputFiles([PHOTOS.logo]);
    await page.getByTestId('brand-input-photos').setInputFiles([PHOTOS.desert, PHOTOS.lake]);
    await page.getByTestId('brand-add-color').click();
    await page.getByTestId('brand-add-color').click();
    await page.getByTestId('brand-font-heading-family').selectOption('Cairo');
    await page.getByTestId('brand-voice-tone').fill('Warm');
    await page.getByTestId('brand-voice-tone').press('Enter');
    await page.getByTestId('brand-voice-tone').fill('Confident');
    await page.getByTestId('brand-voice-tone').press('Enter');
    await sleep(800);
    await page.mouse.move(-10, -10);
    await shot(page, 'brand-kit-en');

    await newDesign(page);
    await run(page, () => {
      const { editor } = window.__opencanvas;
      editor.insertNodes(
        [
          {
            type: 'shape',
            shape: 'rect',
            x: 80,
            y: 560,
            width: 420,
            height: 420,
            cornerRadius: 40,
            fill: { type: 'solid', color: '#e2e8f0' },
          },
          {
            type: 'shape',
            shape: 'ellipse',
            x: 580,
            y: 560,
            width: 420,
            height: 420,
            fill: { type: 'solid', color: '#e2e8f0' },
          },
        ],
        { center: false },
      );
      editor.select([]);
    });
    await waitIdle(page);
    const start = mark();
    await clickTestId(page, 'panel-tab-brand', 700);
    await clickTestId(page, 'brand-panel-image', 900); // logo
    await run(page, () => {
      const { editor } = window.__opencanvas;
      const logoId = editor.selectedIds[0];
      editor.execute('node.update', { ids: [logoId], patch: { x: 240, y: 90, width: 600, height: 200 } });
      editor.select([]);
    });
    await waitIdle(page);
    await sleep(300);
    const shapes = await run(page, () =>
      window.__opencanvas.editor.store
        .getChildren(window.__opencanvas.editor.pageId)
        .filter((n) => n.type === 'shape')
        .map((n) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })),
    );
    for (const [i, s] of shapes.entries()) {
      const p = await toScreen(page, s);
      await glide(page, p);
      await page.mouse.click(p.x, p.y);
      await sleep(350);
      await clickLocator(page, page.getByTestId('brand-panel-color').nth(i === 0 ? 0 : 4), 600);
    }
    await clickTestId(page, 'brand-panel-font-heading', 900);
    await sleep(800);
    const video = await finishRecording(context, page);
    toGif(video, 'brand', { start, end: mark() + 0.3, ...EDITOR_CROP });
  },

  async frames(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await newDesign(page);
    const [a, b] = await uploadPhotos(page, [PHOTOS.desert, PHOTOS.lake]);
    await run(
      page,
      ({ a, b }) => {
        const { editor } = window.__opencanvas;
        editor.execute('page.update', {
          id: editor.pageId,
          patch: { background: { type: 'solid', color: '#fdf2f8' } },
        });
        editor.execute('node.update', { ids: [a], patch: { x: 60, y: 730, width: 330, height: 220 } });
        editor.execute('node.update', { ids: [b], patch: { x: 690, y: 730, width: 330, height: 220 } });
        editor.insertNodes(
          [
            {
              type: 'frame',
              shape: 'heart',
              x: 60,
              y: 120,
              width: 460,
              height: 420,
              fill: { type: 'solid', color: '#e5e7eb' },
              clipContent: true,
            },
            {
              type: 'frame',
              shape: 'ellipse',
              x: 580,
              y: 140,
              width: 420,
              height: 420,
              fill: { type: 'solid', color: '#e5e7eb' },
              clipContent: true,
            },
          ],
          { center: false },
        );
        editor.select([]);
      },
      { a, b },
    );
    await page.getByTestId('panel-tab-elements').click();
    await page.getByRole('button', { name: /See all · Frames/ }).click();
    await waitIdle(page);
    await page.mouse.move(700, 700);
    const start = mark();
    await sleep(400);
    await dragOnCanvas(page, { x: 225, y: 840 }, { x: 290, y: 320 });
    await sleep(900);
    await dragOnCanvas(page, { x: 855, y: 840 }, { x: 790, y: 350 });
    await sleep(900);
    // A Polaroid from the gallery, then another photo into it.
    await clickTestId(page, 'element-frame-polaroid', 900);
    await page.mouse.move(700, 760, { steps: 10 });
    await sleep(800);
    const video = await finishRecording(context, page);
    toGif(video, 'frames', { start, end: mark() + 0.2, ...EDITOR_CROP });
  },

  async crop(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await newDesign(page);
    const [id] = await uploadPhotos(page, [PHOTOS.desert]);
    await run(
      page,
      (id) => {
        const { editor } = window.__opencanvas;
        editor.execute('node.update', {
          ids: [id],
          patch: {
            x: 190,
            y: 290,
            width: 700,
            height: 500,
            crop: { x: 0.18, y: 0.08, width: 0.64, height: 0.85 },
          },
        });
        editor.select([]);
      },
      id,
    );
    await page.getByTestId('panel-tab-uploads').click(); // collapse the panel for a bigger canvas
    await waitIdle(page);
    const start = mark();
    const center = await toScreen(page, { x: 540, y: 540 });
    await glide(page, center);
    await sleep(300);
    await page.mouse.dblclick(center.x, center.y);
    await sleep(900);
    await dragOnCanvas(page, { x: 540, y: 540 }, { x: 640, y: 560 }, 30);
    await sleep(500);
    // Scale the photo from its bottom-right corner.
    const corner = await run(
      page,
      (id) => {
        const n = window.__opencanvas.editor.store.getNode(id);
        const fw = n.width / n.crop.width;
        const fh = n.height / n.crop.height;
        return { x: n.x - n.crop.x * fw + fw, y: n.y - n.crop.y * fh + fh };
      },
      id,
    );
    await dragOnCanvas(page, corner, { x: corner.x + 90, y: corner.y + 60 }, 24);
    await sleep(400);
    await clickTestId(page, 'crop-done', 1100);
    const video = await finishRecording(context, page);
    toGif(video, 'crop', { start, end: mark(), ...EDITOR_CROP });
  },

  async elements(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await newDesign(page);
    await page.mouse.move(600, 500);
    const start = mark();
    await sleep(300);
    await clickTestId(page, 'element-shape-star-5', 500);
    await clickTestId(page, 'element-shape-burst-12', 500);
    await clickTestId(page, 'element-line-dashed', 500);
    // Scroll through the sections.
    const panel = await page.locator('[role=tabpanel] .overflow-y-auto').boundingBox();
    await glide(page, { x: panel.x + panel.width / 2, y: panel.y + 400 });
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 120);
      await sleep(90);
    }
    await sleep(500);
    await clickTestId(page, 'elements-search', 200);
    await page.keyboard.type('rocket', { delay: 110 });
    await sleep(900);
    await clickLocator(page, page.locator('[data-testid^="icon-"]').first(), 600);
    await clickLocator(page, page.locator('[data-testid^="icon-"]').nth(1), 600);
    await page.getByTestId('elements-search').fill('');
    await clickTestId(page, 'elements-search', 200);
    await page.keyboard.type('heart', { delay: 110 });
    await sleep(1100);
    const video = await finishRecording(context, page);
    toGif(video, 'elements', { start, end: mark(), ...EDITOR_CROP });
  },

  async pages(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await newDesign(page, 'presentation');
    const photos = [PHOTOS.lake, PHOTOS.city, PHOTOS.desert, PHOTOS.bokeh];
    for (const [i, photo] of photos.entries()) {
      if (i > 0) await run(page, () => window.__opencanvas.editor.addPage());
      const [id] = await uploadPhotos(page, [photo]);
      await run(
        page,
        ({ id, title }) => {
          const { editor } = window.__opencanvas;
          editor.execute('node.update', { ids: [id], patch: { x: 0, y: 0, width: 1920, height: 1080 } });
          editor.insertNodes(
            [
              {
                type: 'text',
                sizing: 'auto-height',
                x: 120,
                y: 760,
                width: 1680,
                content: { paragraphs: [{ runs: [{ text: title, style: {} }], list: 'none', indent: 0 }] },
                style: { fontFamily: 'Inter', fontSize: 110, fontWeight: 800, color: '#ffffff' },
              },
            ],
            { center: false },
          );
          editor.select([]);
        },
        { id, title: ['Explore', 'Create', 'Share', 'Repeat'][i] },
      );
    }
    await run(page, () =>
      window.__opencanvas.editor.setCurrentPage(window.__opencanvas.editor.store.getPageIds()[0]),
    );
    await page.getByTestId('panel-tab-uploads').click();
    await waitIdle(page);
    const start = mark();
    await clickLocator(page, page.getByRole('button', { name: 'File', exact: true }), 400);
    await page.getByRole('menuitem', { name: /Page view/ }).hover();
    await sleep(500);
    await clickTestId(page, 'page-view-scroll', 700);
    await page.keyboard.press('Control+-');
    await sleep(300);
    await page.keyboard.press('Control+-');
    await sleep(500);
    await glide(page, { x: 760, y: 420 });
    for (let i = 0; i < 16; i++) {
      await page.mouse.wheel(0, 90);
      await sleep(70);
    }
    await sleep(500);
    await clickTestId(page, 'grid-view', 2000);
    const video = await finishRecording(context, page);
    toGif(video, 'pages', { start, end: mark(), ...EDITOR_CROP });
  },

  async download(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await newDesign(page);
    await buildPoster(page);
    await page.getByTestId('panel-tab-elements').click();
    await waitIdle(page);
    const start = mark();
    await clickTestId(page, 'open-export', 800);
    await clickTestId(page, 'export-type', 700);
    await glide(
      page,
      await page
        .getByTestId('export-type-jpeg')
        .boundingBox()
        .then((b) => ({ x: b.x + 120, y: b.y + 20 })),
    );
    await sleep(400);
    await glide(
      page,
      await page
        .getByTestId('export-type-pdf')
        .boundingBox()
        .then((b) => ({ x: b.x + 120, y: b.y + 20 })),
    );
    await sleep(400);
    await clickTestId(page, 'export-type-png', 600);
    const slider = await page.getByTestId('export-scale').locator('input[type=range]').boundingBox();
    await glide(page, { x: slider.x + slider.width * 0.2, y: slider.y + slider.height / 2 });
    await page.mouse.down();
    await page.mouse.move(slider.x + slider.width * 0.45, slider.y + slider.height / 2, { steps: 14 });
    await page.mouse.up();
    await sleep(500);
    await clickTestId(page, 'export-quality-compress', 700);
    await clickTestId(page, 'export-quality-limit', 900);
    await clickTestId(page, 'export-pages-current', 500);
    await clickTestId(page, 'export-remember', 900);
    const video = await finishRecording(context, page);
    toGif(video, 'download', { start, end: mark(), crop: { x: 200, y: 0, w: 880, h: 800 }, width: 720 });
  },

  async arabic(browser) {
    const { context, page, mark } = await openPage(browser, { record: true, locale: 'ar' });
    await newDesign(page);
    await page.getByTestId('panel-tab-text').click();
    await waitIdle(page);
    const start = mark();
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('t');
    const at = await toScreen(page, { x: 140, y: 380 });
    await glide(page, at);
    await page.mouse.click(at.x, at.y);
    await sleep(300);
    await page.keyboard.type('تصميم عربي أصيل', { delay: 90 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('مع OpenCanvas بسعر 0 ريال!', { delay: 80 });
    await sleep(500);
    await page.keyboard.press('Escape');
    await sleep(500);
    await run(page, () => {
      const { editor } = window.__opencanvas;
      editor.execute('text.set-style', {
        ids: editor.selectedIds,
        style: { fontFamily: 'Cairo', fontSize: 64, fontWeight: 700, color: '#7c3aed' },
      });
    });
    await sleep(1400);
    const video = await finishRecording(context, page);
    toGif(video, 'arabic', { start, end: mark(), crop: { x: 288, y: 0, w: 992, h: 800 }, width: 800 }); // RTL: properties on the left
  },

  async guides(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await newDesign(page);
    await run(page, () => {
      const { editor } = window.__opencanvas;
      editor.insertNodes(
        [
          {
            type: 'shape',
            shape: 'ellipse',
            x: 120,
            y: 560,
            width: 260,
            height: 260,
            fill: { type: 'solid', color: '#f59e0b' },
          },
        ],
        {
          center: false,
        },
      );
      editor.select([]);
    });
    await page.getByTestId('panel-tab-elements').click();
    await waitIdle(page);
    const start = mark();
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Shift+R');
    await sleep(600);
    await clickLocator(page, page.getByRole('button', { name: 'View', exact: true }), 500);
    await clickTestId(page, 'menu-add-guides', 700);
    await clickLocator(page, page.getByText('3×3 grid'), 600);
    await clickTestId(page, 'apply-guides', 800);
    // Drag the circle until it snaps to the guides.
    await dragOnCanvas(page, { x: 250, y: 690 }, { x: 228, y: 708 }, 30);
    await sleep(500);
    // A new guide straight from the ruler.
    const ruler = await page.getByTestId('ruler-x').boundingBox();
    await glide(page, { x: ruler.x + 380, y: ruler.y + 10 });
    await page.mouse.down();
    await page.mouse.move(ruler.x + 380, ruler.y + 300, { steps: 24 });
    await sleep(300);
    await page.mouse.up();
    await sleep(1000);
    const video = await finishRecording(context, page);
    toGif(video, 'guides', { start, end: mark(), ...EDITOR_CROP });
  },

  async create(browser) {
    const { context, page, mark } = await openPage(browser, { record: true });
    await page.goto(`${BASE}/`);
    await sleep(800);
    await page.mouse.move(640, 600);
    const start = mark();
    await clickTestId(page, 'create-design', 900);
    await clickTestId(page, 'create-tab-social', 600);
    await clickTestId(page, 'platform-instagram', 600);
    await clickTestId(page, 'platform-tiktok', 600);
    await clickTestId(page, 'create-tab-print', 700);
    await clickTestId(page, 'create-tab-whiteboard', 600);
    await clickTestId(page, 'create-search', 200);
    await page.keyboard.type('youtube', { delay: 110 });
    await sleep(1200);
    const video = await finishRecording(context, page);
    toGif(video, 'create', { start, end: mark() });
  },
};

const wanted = process.argv.slice(2);
const browser = await chromium.launch();
try {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (wanted.length && !wanted.includes(name)) continue;
    console.log(name);
    await scenario(browser);
  }
} finally {
  await browser.close();
  rmSync(WORK, { recursive: true, force: true });
}
