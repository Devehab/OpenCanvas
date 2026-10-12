#!/usr/bin/env node
/**
 * Records the app footage used by the promo videos: high resolution
 * screenshots and step-by-step interaction sequences (a screenshot after
 * every mouse step, so playback is smooth and sharp), in English and Arabic.
 *
 *   pnpm build && pnpm start -- --port 3200      # or any running instance
 *   BASE_URL=http://localhost:3200 node scripts/promo-video/footage.mjs [en|ar] [shot…]
 *
 * Output: scripts/promo-video/.work/footage/<lang>/ — JPEG frames plus one
 * <sequence>.json per sequence (frames, how long each is held, the cursor).
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { desertSunset, logo, mountainLake, nightCity } from '../site-media/photos.mjs';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const ROOT = new URL('./.work/footage/', import.meta.url).pathname;
const VIEW = { width: 1440, height: 900 };
const SCALE = 2;
/** Playback rate of the sequences. */
const FPS = 30;

const PHOTOS = {
  desert: { name: 'desert.jpg', mimeType: 'image/jpeg', buffer: desertSunset() },
  lake: { name: 'lake.jpg', mimeType: 'image/jpeg', buffer: mountainLake() },
  city: { name: 'city.jpg', mimeType: 'image/jpeg', buffer: nightCity() },
  logo: { name: 'nakhla-logo.png', mimeType: 'image/png', buffer: logo() },
};

const COPY = {
  en: {
    headline: 'Design without limits',
    sub: 'Free · Open source · Private',
    brand: 'Nakhla Studio',
    search: 'rocket',
    search2: 'heart',
    tone: ['Warm', 'Confident'],
    slides: ['Explore', 'Create', 'Share', 'Repeat'],
    view: 'View',
  },
  ar: {
    headline: 'صمّم بلا حدود',
    sub: 'مجاني · مفتوح المصدر · خاص',
    brand: 'استوديو نخلة',
    search: 'صاروخ',
    search2: 'قلب',
    tone: ['دافئ', 'واثق'],
    slides: ['استكشف', 'اصنع', 'شارك', 'كرّر'],
    view: 'عرض',
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

async function frames(page, n = 2) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

async function waitIdle(page) {
  await page.waitForFunction(() => {
    const oc = window.__opencanvas;
    return !!oc && oc.view.idle && oc.session.images.pending === 0 && document.fonts.status === 'loaded';
  });
  await frames(page, 3);
}

/**
 * A step-by-step recording: every snap() is one screenshot, held for a number
 * of playback frames. The cursor is stored separately so the video draws it.
 */
class Sequence {
  constructor(page, dir, name) {
    this.page = page;
    this.dir = dir;
    this.name = name;
    this.frames = [];
    this.cursor = null;
    this.mouse = { x: VIEW.width * 0.6, y: VIEW.height * 0.7 };
  }

  async snap(hold = 1, extra = {}) {
    await frames(this.page, 2);
    const file = `${this.name}-${String(this.frames.length).padStart(4, '0')}.jpg`;
    await this.page.screenshot({ path: join(this.dir, file), type: 'jpeg', quality: 90 });
    this.frames.push({ file, hold, cursor: this.cursor ? { ...this.cursor } : null, ...extra });
  }

  /** Holds the current picture for `ms` (one screenshot). */
  async hold(ms) {
    await this.snap(Math.max(1, Math.round((ms / 1000) * FPS)));
  }

  /** Glides the mouse, one screenshot per step (eased, like a hand). */
  async move(to, steps = 16, { drag = false } = {}) {
    const from = { ...this.mouse };
    for (let i = 1; i <= steps; i++) {
      const k = easeInOut(i / steps);
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      await this.page.mouse.move(x, y);
      this.mouse = { x, y };
      this.cursor = { x, y, down: drag };
      await this.snap(1);
    }
  }

  async click(to, { steps = 14, after = 400 } = {}) {
    await this.move(to, steps);
    await this.page.mouse.down();
    this.cursor = { ...this.mouse, down: true };
    await this.snap(2, { click: true });
    await this.page.mouse.up();
    this.cursor = { ...this.mouse, down: false };
    await sleep(after);
    await this.snap(Math.round((after / 1000) * FPS));
  }

  async drag(from, to, steps = 26) {
    await this.move(from, 14);
    await this.page.mouse.down();
    this.cursor = { ...this.mouse, down: true };
    await this.snap(4, { click: true });
    await this.move(to, steps, { drag: true });
    await sleep(250);
    await this.snap(6);
    await this.page.mouse.up();
    this.cursor = { ...this.mouse, down: false };
    await sleep(350);
    await this.snap(8);
  }

  /** Types text one character at a time (a screenshot per character). */
  async type(text, hold = 3) {
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await sleep(60);
      await this.snap(hold);
    }
  }

  /** Scrolls with the wheel, one screenshot per notch. */
  async wheel(dy, notches) {
    for (let i = 0; i < notches; i++) {
      await this.page.mouse.wheel(0, dy);
      await sleep(80);
      await this.snap(2);
    }
  }

  save() {
    writeFileSync(
      join(this.dir, `${this.name}.json`),
      JSON.stringify({ fps: FPS, view: VIEW, scale: SCALE, frames: this.frames }, null, 1),
    );
    const total = this.frames.reduce((s, f) => s + f.hold, 0);
    console.log(`  ${this.name}: ${this.frames.length} shots, ${(total / FPS).toFixed(1)} s`);
  }
}

async function openPage(browser, lang) {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: SCALE,
    locale: lang === 'ar' ? 'ar' : 'en-US',
    timezoneId: 'UTC',
    acceptDownloads: true,
  });
  await context.addCookies([{ name: 'oc-locale', value: lang, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.warn('  page error:', e.message));
  return { context, page };
}

async function newDesign(page, format = 'instagram-post') {
  await page.goto(`${BASE}/`);
  await page.getByTestId(`format-${format}`).click();
  await page.waitForURL(/\/design\//);
  await page.waitForFunction(() => !!window.__opencanvas?.editor);
  await waitIdle(page);
}

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

/** Shows a side panel (clicking the open tab would close it). */
async function openPanel(page, id) {
  const tab = page.getByTestId(`panel-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

async function toScreen(page, p) {
  return page.evaluate((pt) => {
    const { editor } = window.__opencanvas;
    const c = editor.state.get().camera;
    const r = document.querySelector('[data-testid="canvas"]').getBoundingClientRect();
    return { x: r.left + c.x + pt.x * c.zoom, y: r.top + c.y + pt.y * c.zoom };
  }, p);
}

async function center(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const textNode = (content, style, extra = {}) => ({
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

/** The showcase poster: gradient, a photo in a heart frame, headline, sparkles. */
async function buildPoster(page, lang) {
  const copy = COPY[lang];
  const [photo] = await uploadPhotos(page, [PHOTOS.desert]);
  const arabic = lang === 'ar';
  await run(
    page,
    ({ photo, nodes }) => {
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
      editor.select([]);
    },
    {
      photo,
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
          textNode(
            copy.headline,
            arabic
              ? { fontFamily: 'Cairo', fontSize: 104, fontWeight: 800 }
              : { fontFamily: 'Poppins', fontSize: 92, fontWeight: 800 },
            { x: 40, y: arabic ? 50 : 70, width: 1000, align: 'center' },
          ),
          textNode(
            copy.sub,
            arabic
              ? { fontFamily: 'Cairo', fontSize: 40, fontWeight: 600, color: '#fce7f3' }
              : { fontFamily: 'Inter', fontSize: 36, fontWeight: 600, color: '#fce7f3' },
            { x: 40, y: 760, width: 1000, align: 'center' },
          ),
          {
            type: 'shape',
            shape: 'rect',
            x: 360,
            y: 880,
            width: 360,
            height: 96,
            cornerRadius: 48,
            fill: { type: 'solid', color: '#ffffff' },
          },
          textNode(
            'OpenCanvas',
            { fontFamily: 'Inter', fontSize: 42, fontWeight: 800, color: '#7c3aed' },
            { x: 360, y: 902, width: 360, align: 'center' },
          ),
          {
            type: 'shape',
            shape: 'star',
            sides: 5,
            innerRatio: 0.45,
            x: 130,
            y: 330,
            width: 100,
            height: 100,
            fill: { type: 'solid', color: '#fde68a' },
          },
          {
            type: 'shape',
            shape: 'ellipse',
            x: 880,
            y: 560,
            width: 70,
            height: 70,
            fill: { type: 'solid', color: '#fbcfe8' },
          },
        ],
      },
    },
  );
  await waitIdle(page);
}

/** Exports the open design's first page(s) as PNG files. */
async function exportPng(page, outBase) {
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-dialog').waitFor();
  // The dialog suggests PDF for print formats; these are pictures.
  await page.getByTestId('export-type').click();
  await page.getByTestId('export-type-png').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId('export-start').click();
  const download = await pending;
  const tmp = mkdtempSync(join(tmpdir(), 'oc-export-'));
  const path = join(tmp, download.suggestedFilename());
  await download.saveAs(path);
  const zip = readFileSync(path).subarray(0, 2).toString() === 'PK';
  if (zip) {
    execFileSync('python3', [
      '-I',
      '-c',
      'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
      path,
      tmp,
    ]);
    const pngs = readdirSync(tmp)
      .filter((f) => f.endsWith('.png'))
      .sort();
    pngs.forEach((f, i) => renameSync(join(tmp, f), `${outBase}-${i + 1}.png`));
  } else {
    renameSync(path, `${outBase}.png`);
  }
  rmSync(tmp, { recursive: true, force: true });
  await page.keyboard.press('Escape');
}

const STARTERS = [
  'summer-sale',
  'gala-invitation',
  'quote-story',
  'company-strategy',
  'video-thumbnail',
  'business-card',
];

// ---------------------------------------------------------------------------

const SHOTS = {
  /** PNG renders of the starter templates (the designs the video shows off). */
  async starters({ page, dir }) {
    for (const id of STARTERS) {
      await page.goto(`${BASE}/templates/use?starter=${id}`);
      await page.waitForURL(/\/design\/design_/);
      await page.waitForFunction(() => !!window.__opencanvas?.editor);
      await waitIdle(page);
      await exportPng(page, join(dir, `starter-${id}`));
      console.log(`  starter-${id}`);
    }
  },

  /** The editor with the poster, the dashboard and the templates page. */
  async stills({ page, dir, lang }) {
    await newDesign(page);
    await buildPoster(page, lang);
    await page.getByTestId('panel-tab-elements').click();
    await page.mouse.move(-10, -10);
    await sleep(500);
    await waitIdle(page);
    await page.screenshot({ path: join(dir, 'editor.jpg'), type: 'jpeg', quality: 92 });

    await page.getByTestId('panel-tab-layers').click();
    await sleep(400);
    await page.screenshot({ path: join(dir, 'layers.jpg'), type: 'jpeg', quality: 92 });

    await page.goto(`${BASE}/`);
    await sleep(2500);
    await page.mouse.move(-10, -10);
    await page.screenshot({ path: join(dir, 'dashboard.jpg'), type: 'jpeg', quality: 92 });

    await page.goto(`${BASE}/templates`);
    await page.getByTestId('starter-grid').locator('img').nth(5).waitFor({ timeout: 30_000 });
    await sleep(800);
    await page.mouse.move(-10, -10);
    await page.screenshot({ path: join(dir, 'templates.jpg'), type: 'jpeg', quality: 92 });
  },

  /** The create dialog, browsing categories. */
  async create({ page, dir }) {
    await page.goto(`${BASE}/`);
    await sleep(1500);
    const seq = new Sequence(page, dir, 'create');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(300);
    await seq.click(await center(page.getByTestId('create-design')), { after: 700 });
    for (const tab of ['social', 'presentation', 'print']) {
      await seq.click(await center(page.getByTestId(`create-tab-${tab}`)), { steps: 12, after: 900 });
    }
    seq.save();
  },

  async crop({ page, dir }) {
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
    await page.getByTestId('panel-tab-uploads').click(); // collapse the panel
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'crop');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    const mid = await toScreen(page, { x: 540, y: 540 });
    await seq.move(mid, 14);
    await page.mouse.dblclick(mid.x, mid.y);
    seq.cursor = { ...seq.mouse, down: false };
    await sleep(700);
    await seq.snap(3, { click: true });
    await seq.hold(500);
    await seq.drag(mid, await toScreen(page, { x: 650, y: 570 }), 24);
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
    await seq.drag(
      await toScreen(page, corner),
      await toScreen(page, { x: corner.x + 90, y: corner.y + 60 }),
      20,
    );
    await seq.click(await center(page.getByTestId('crop-done')), { after: 700 });
    seq.save();
  },

  async frames({ page, dir }) {
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
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'frames');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    await seq.drag(await toScreen(page, { x: 225, y: 840 }), await toScreen(page, { x: 290, y: 320 }), 26);
    await seq.hold(400);
    await seq.drag(await toScreen(page, { x: 855, y: 840 }), await toScreen(page, { x: 790, y: 350 }), 26);
    await seq.move({ x: seq.mouse.x + 60, y: seq.mouse.y + 260 }, 12);
    await seq.hold(500);
    seq.save();
  },

  /** Image adjustments: a slider dragged live. */
  async effects({ page, dir }) {
    await newDesign(page);
    const [id] = await uploadPhotos(page, [PHOTOS.lake]);
    await run(
      page,
      (id) => {
        const { editor } = window.__opencanvas;
        editor.execute('node.update', { ids: [id], patch: { x: 90, y: 90, width: 900, height: 900 } });
        editor.select([id]);
      },
      id,
    );
    await page.getByTestId('panel-tab-uploads').click(); // collapse the panel
    await waitIdle(page);
    const inspector = page.getByTestId('inspector');
    const sliders = inspector.getByRole('slider');
    const seq = new Sequence(page, dir, 'effects');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    // Hue, then vignette (index follows the adjust list).
    for (const index of [3, 7]) {
      const slider = sliders.nth(index);
      await slider.scrollIntoViewIfNeeded();
      const box = await slider.boundingBox();
      const y = box.y + box.height / 2;
      const from = { x: box.x + box.width / 2, y };
      await seq.drag(from, { x: box.x + box.width * 0.92, y }, 22);
      await seq.hold(250);
    }
    seq.save();
  },

  async layers({ page, dir, lang }) {
    await newDesign(page);
    await buildPoster(page, lang);
    await page.getByTestId('panel-tab-layers').click();
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'layers');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    const rows = page.getByTestId('layer-row');
    await seq.click(await center(rows.nth(1)), { after: 500 });
    await seq.click(await center(rows.nth(0)), { after: 500 });
    const eye = rows.nth(0).getByTestId('layer-visibility');
    await rows.nth(0).hover();
    await seq.click(await center(eye), { after: 600 });
    await seq.click(await center(eye), { after: 600 });
    seq.save();
  },

  async brand({ page, dir, lang }) {
    const copy = COPY[lang];
    await page.goto(`${BASE}/brand`);
    await page.getByTestId('new-brand').first().click();
    await page.getByTestId('brand-kit-name').fill(copy.brand);
    await page.getByTestId('create-brand').click();
    await page.waitForURL(/\/brand\?id=/);
    await page.getByTestId('brand-input-logos').setInputFiles([PHOTOS.logo]);
    await page.getByTestId('brand-input-photos').setInputFiles([PHOTOS.desert, PHOTOS.lake, PHOTOS.city]);
    for (let i = 0; i < 3; i++) await page.getByTestId('brand-add-color').click();
    await page.getByTestId('brand-font-heading-family').selectOption(lang === 'ar' ? 'Cairo' : 'Poppins');
    for (const tone of copy.tone) {
      await page.getByTestId('brand-voice-tone').fill(tone);
      await page.getByTestId('brand-voice-tone').press('Enter');
    }
    await sleep(900);
    await page.mouse.move(-10, -10);
    // Adding colors scrolls to the palette: colors and fonts in one picture.
    await page.screenshot({ path: join(dir, 'brand.jpg'), type: 'jpeg', quality: 92 });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) if (el.scrollTop) el.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await sleep(400);
    await page.screenshot({ path: join(dir, 'brand-top.jpg'), type: 'jpeg', quality: 92 });
  },

  /** Searching the icon library (in the language of the interface). */
  async icons({ page, dir, lang }) {
    await newDesign(page);
    await openPanel(page, 'elements');
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'icons');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    await seq.click(await center(page.getByTestId('elements-search')), { after: 300 });
    for (const ch of COPY[lang].search) {
      await page.keyboard.type(ch);
      await sleep(120);
      await seq.snap(4);
    }
    await sleep(900);
    await seq.hold(500);
    const first = page.getByTestId('elements-results').locator('button').first();
    await seq.click(await center(first), { after: 700 });
    seq.save();
  },

  /** Shapes, lines and icons from the elements panel. */
  async elements({ page, dir, lang }) {
    await newDesign(page);
    await openPanel(page, 'elements');
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'elements');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    for (const id of ['element-shape-star-5', 'element-shape-burst-12', 'element-line-dashed']) {
      await seq.click(await center(page.getByTestId(id).first()), { after: 450 });
    }
    await seq.click(await center(page.getByTestId('elements-search')), { after: 250 });
    await seq.type(COPY[lang].search);
    await sleep(800);
    await seq.hold(400);
    const icons = page.locator('[data-testid^="icon-"]');
    await seq.click(await center(icons.first()), { after: 450 });
    await page.getByTestId('elements-search').fill('');
    await seq.click(await center(page.getByTestId('elements-search')), { after: 250 });
    await seq.type(COPY[lang].search2);
    await sleep(900);
    await seq.hold(500);
    await seq.click(await center(icons.nth(1)), { after: 700 });
    seq.save();
  },

  /** A presentation: pages strip, a new page, then the grid of every page. */
  async pages({ page, dir, lang }) {
    await newDesign(page, 'presentation');
    const photos = [PHOTOS.lake, PHOTOS.city, PHOTOS.desert];
    for (const [i, photo] of photos.entries()) {
      if (i > 0) await run(page, () => window.__opencanvas.editor.addPage());
      const [id] = await uploadPhotos(page, [photo]);
      await run(
        page,
        ({ id, title, arabic }) => {
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
                align: arabic ? 'right' : 'left',
                content: { paragraphs: [{ runs: [{ text: title, style: {} }], list: 'none', indent: 0 }] },
                style: {
                  fontFamily: arabic ? 'Cairo' : 'Inter',
                  fontSize: 120,
                  fontWeight: 800,
                  color: '#ffffff',
                },
              },
            ],
            { center: false },
          );
          editor.select([]);
        },
        { id, title: COPY[lang].slides[i], arabic: lang === 'ar' },
      );
    }
    await run(page, () =>
      window.__opencanvas.editor.setCurrentPage(window.__opencanvas.editor.store.getPageIds()[0]),
    );
    await page.getByTestId('panel-tab-uploads').click(); // collapse the panel
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'pages');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(300);
    const thumbs = page.getByTestId('page-thumb');
    await seq.click(await center(thumbs.nth(1)), { after: 500 });
    await seq.click(await center(thumbs.nth(2)), { after: 500 });
    await seq.click(await center(page.getByTestId('add-page')), { after: 600 });
    await seq.click(await center(page.getByTestId('grid-view')), { after: 1300 });
    seq.save();
  },

  /** The download dialog: file types, size and quality. */
  async export({ page, dir, lang }) {
    await newDesign(page);
    await buildPoster(page, lang);
    await openPanel(page, 'elements');
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'export');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(200);
    await seq.click(await center(page.getByTestId('open-export')), { after: 700 });
    await seq.click(await center(page.getByTestId('export-type')), { after: 600 });
    for (const ty of ['jpeg', 'pdf']) await seq.move(await center(page.getByTestId(`export-type-${ty}`)), 10);
    await seq.hold(300);
    await seq.click(await center(page.getByTestId('export-type-png')), { after: 500 });
    const slider = await page.getByTestId('export-scale').locator('input[type=range]').boundingBox();
    const y = slider.y + slider.height / 2;
    await seq.drag({ x: slider.x + slider.width * 0.2, y }, { x: slider.x + slider.width * 0.5, y }, 16);
    await seq.click(await center(page.getByTestId('export-quality-compress')), { after: 500 });
    await seq.click(await center(page.getByTestId('export-quality-limit')), { after: 700 });
    seq.save();
  },

  /** Applying a brand kit in the editor: logo, colors, heading font. */
  async brandApply({ page, dir }) {
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
    await openPanel(page, 'brand');
    await sleep(600);
    const seq = new Sequence(page, dir, 'brand-apply');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(300);
    await seq.click(await center(page.getByTestId('brand-panel-image').first()), { after: 700 });
    await run(page, () => {
      const { editor } = window.__opencanvas;
      const [logoId] = editor.selectedIds;
      editor.execute('node.update', { ids: [logoId], patch: { x: 240, y: 90, width: 600, height: 200 } });
      editor.select([]);
    });
    await waitIdle(page);
    await seq.hold(300);
    const shapes = await run(page, () =>
      window.__opencanvas.editor.store
        .getChildren(window.__opencanvas.editor.pageId)
        .filter((n) => n.type === 'shape')
        .map((n) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })),
    );
    for (const [i, sh] of shapes.entries()) {
      await seq.click(await toScreen(page, sh), { after: 350 });
      await seq.click(await center(page.getByTestId('brand-panel-color').nth(i === 0 ? 0 : 4)), {
        after: 500,
      });
    }
    await seq.click(await center(page.getByTestId('brand-panel-font-heading')), { after: 900 });
    seq.save();
  },

  /** Rulers, a 3×3 grid of guides and snapping. */
  async guides({ page, dir, lang }) {
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
        { center: false },
      );
      editor.select([]);
    });
    await openPanel(page, 'elements');
    await waitIdle(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Shift+R');
    await sleep(500);
    const seq = new Sequence(page, dir, 'guides');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(300);
    await seq.click(await center(page.getByRole('button', { name: COPY[lang].view, exact: true })), {
      after: 500,
    });
    await seq.click(await center(page.getByTestId('menu-add-guides')), { after: 700 });
    await seq.click(await center(page.getByTestId('guides-3x3').locator('xpath=..')), { after: 600 });
    await seq.click(await center(page.getByTestId('apply-guides')), { after: 700 });
    await seq.drag(await toScreen(page, { x: 250, y: 690 }), await toScreen(page, { x: 228, y: 708 }), 24);
    const ruler = await page.getByTestId('ruler-x').boundingBox();
    await seq.drag({ x: ruler.x + 380, y: ruler.y + 10 }, { x: ruler.x + 380, y: ruler.y + 300 }, 20);
    seq.save();
  },

  /** Typing Arabic in the Arabic interface. */
  async arabic({ page, dir, lang }) {
    if (lang !== 'ar') return;
    await newDesign(page);
    await openPanel(page, 'text');
    await waitIdle(page);
    const seq = new Sequence(page, dir, 'arabic');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(300);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('t');
    const at = await toScreen(page, { x: 140, y: 380 });
    await seq.click(at, { after: 300 });
    await seq.type('تصميم عربي أصيل', 2);
    await page.keyboard.press('Enter');
    await seq.type('مع OpenCanvas بلا اشتراك', 2);
    await page.keyboard.press('Escape');
    await sleep(400);
    await seq.hold(300);
    await run(page, () => {
      const { editor } = window.__opencanvas;
      editor.execute('text.set-style', {
        ids: editor.selectedIds,
        style: { fontFamily: 'Cairo', fontSize: 64, fontWeight: 700, color: '#7c3aed' },
      });
    });
    await waitIdle(page);
    await seq.hold(1200);
    seq.save();
  },

  /** Templates: browse, then start a design from a starter (new tab). */
  async templates({ page, dir }) {
    await page.goto(`${BASE}/templates`);
    await page.getByTestId('starter-grid').locator('img').nth(5).waitFor({ timeout: 30_000 });
    await sleep(600);
    const seq = new Sequence(page, dir, 'templates');
    await page.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(400);
    const card = page.getByTestId('starter-card').first();
    await seq.move(await center(card), 16);
    await seq.hold(300);
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      seq.click(await center(card.getByTestId('use-starter')), { after: 200 }),
    ]);
    await tab.waitForURL(/\/design\/design_/);
    await tab.waitForFunction(() => !!window.__opencanvas?.editor);
    await waitIdle(tab);
    seq.page = tab;
    await tab.mouse.move(seq.mouse.x, seq.mouse.y);
    await seq.hold(1400);
    await tab.close();
    seq.page = page;
    seq.save();
  },
};

const args = process.argv.slice(2);
const langs = args.filter((a) => a === 'en' || a === 'ar');
const wanted = args.filter((a) => !langs.includes(a));
const browser = await chromium.launch();
try {
  for (const lang of langs.length ? langs : ['en', 'ar']) {
    const dir = join(ROOT, lang);
    mkdirSync(dir, { recursive: true });
    // One profile per language, so the dashboard shows the designs made before.
    const { context, page } = await openPage(browser, lang);
    try {
      for (const [name, shot] of Object.entries(SHOTS)) {
        if (wanted.length && !wanted.includes(name)) continue;
        console.log(`${lang} · ${name}`);
        await shot({ page, dir, lang });
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
