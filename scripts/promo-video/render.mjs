#!/usr/bin/env node
/**
 * Renders the promo video composition frame by frame (Playwright + ffmpeg).
 *
 *   node scripts/promo-video/render.mjs en              # full video (no audio)
 *   node scripts/promo-video/render.mjs ar --fps 60
 *   node scripts/promo-video/render.mjs en --stills 3.2,9,14.5   # PNG frames to review
 *   node scripts/promo-video/render.mjs en --serve      # open the composition in a browser
 *
 * Writes scripts/promo-video/.work/<lang>/: video.mp4 (silent) and cues.json
 * (the sound effects the scenes ask for; see sound.py).
 */
import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const REPO = new URL('../../', import.meta.url).pathname;
const args = process.argv.slice(2);
const lang = args.find((a) => a === 'en' || a === 'ar') ?? 'en';
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const FPS = Number(opt('fps', 30));
const WORKERS = Number(opt('workers', 4));
const OUT = join(REPO, 'scripts/promo-video/.work', lang);
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Fonts from @fontsource (the same files the app ships).

const PNPM = join(REPO, 'node_modules/.pnpm');
function fontFiles(family) {
  const slug = family.toLowerCase().replace(/ /g, '-');
  const dir = readdirSync(PNPM).find((d) => d.startsWith(`@fontsource+${slug}@`));
  if (!dir) throw new Error(`font package for ${family}`);
  return { slug, base: join(PNPM, dir, 'node_modules/@fontsource', slug) };
}

/** @font-face entries for a family: subsets × weights, with unicode ranges. */
function faces(family, subsets, weights) {
  const { slug, base } = fontFiles(family);
  const out = [];
  for (const weight of weights) {
    const css = join(base, `${weight}.css`);
    if (!existsSync(css)) continue;
    const text = readFileSync(css, 'utf8');
    for (const block of text.split('@font-face').slice(1)) {
      const file = block.match(new RegExp(`files/(${slug}-([\\w-]+?)-\\d+-normal\\.woff2)`));
      if (!file) continue;
      const subset = file[2];
      if (!subsets.includes(subset)) continue;
      const range = block.match(/unicode-range:\s*([^;]+);/);
      out.push({
        family,
        weight,
        url: `/${join('node_modules/.pnpm', base.slice(PNPM.length + 1), 'files', file[1])}`,
        unicodeRange: range ? range[1].trim() : undefined,
      });
    }
  }
  if (!out.length) console.warn(`no faces for ${family} (${slug})`);
  return out;
}

/** The boldest available weight up to `max`. */
function bestWeight(family, max = 700) {
  const { base } = fontFiles(family);
  const weights = readdirSync(base)
    .map((f) => f.match(/^(\d+)\.css$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  return weights.filter((w) => w <= max).pop() ?? weights[0];
}

const ARABIC_FONTS = [
  'Cairo',
  'Tajawal',
  'Almarai',
  'IBM Plex Sans Arabic',
  'Noto Sans Arabic',
  'Noto Kufi Arabic',
  'Readex Pro',
  'Noto Naskh Arabic',
  'Amiri',
  'Markazi Text',
  'Changa',
  'El Messiri',
  'Reem Kufi',
  'Lalezar',
  'Rubik',
  'Vazirmatn',
  'Alexandria',
  'Lemonada',
  'Harmattan',
  'Lateef',
  'Scheherazade New',
  'Mada',
  'Baloo Bhaijaan 2',
  'Aref Ruqaa',
  'Rakkas',
  'Marhey',
  'Kufam',
  'Zain',
  'Beiruti',
  'Playpen Sans Arabic',
];

function fontManifest() {
  const list = [
    ...faces('Inter', ['latin', 'latin-ext'], [400, 500, 600, 700, 800]),
    ...faces('Readex Pro', ['arabic', 'latin'], [400, 500, 600, 700]),
    ...faces('IBM Plex Sans Arabic', ['arabic', 'latin'], [400, 500, 600, 700]),
    ...faces('Poppins', ['latin'], [700]),
    ...faces('Cairo', ['arabic', 'latin'], [700]),
  ];
  for (const family of ARABIC_FONTS) {
    if (['Readex Pro', 'IBM Plex Sans Arabic', 'Cairo'].includes(family)) continue;
    list.push(...faces(family, ['arabic'], [bestWeight(family)]));
  }
  return list;
}

// ---------------------------------------------------------------------------
// Static server rooted at the repository.

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function serve() {
  const manifest = JSON.stringify(fontManifest());
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__fonts.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(manifest);
    }
    const file = normalize(join(REPO, path));
    if (!file.startsWith(REPO) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openComposition(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/scripts/promo-video/composition/index.html?lang=${lang}`);
  await page.waitForFunction(() => window.ready !== undefined);
  await page.evaluate(() => window.ready);
  if (errors.length) console.warn('composition errors:\n ', errors.join('\n  '));
  return page;
}

function ffmpeg(argv) {
  const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  const done = new Promise((resolve, reject) =>
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))),
  );
  return { proc, done };
}

async function renderRange(browser, port, from, to, file, onFrame) {
  const page = await openComposition(browser, port);
  const enc = ffmpeg([
    '-f',
    'image2pipe',
    '-framerate',
    String(FPS),
    '-c:v',
    'mjpeg',
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
    file,
  ]);
  for (let i = from; i < to; i++) {
    await page.evaluate((t) => window.renderAt(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!enc.proc.stdin.write(jpg)) await new Promise((r) => enc.proc.stdin.once('drain', r));
    onFrame();
  }
  enc.proc.stdin.end();
  await enc.done;
  await page.close();
}

const server = await serve();
const { port } = server.address();
if (args.includes('--serve')) {
  console.log(`http://127.0.0.1:${port}/scripts/promo-video/composition/index.html?lang=${lang}`);
} else {
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  try {
    const page = await openComposition(browser, port);
    const duration = await page.evaluate(() => window.DURATION);
    const cues = await page.evaluate(() => window.CUES);
    const beats = await page.evaluate(() => window.BEATS);
    writeFileSync(join(OUT, 'cues.json'), JSON.stringify({ duration, beats, cues }, null, 1));
    const stills = opt('stills');
    if (stills) {
      for (const t of stills.split(',').map(Number)) {
        await page.evaluate((x) => window.renderAt(x), t);
        const file = join(OUT, `still-${t.toFixed(2)}.png`);
        await page.screenshot({ path: file });
        console.log(file);
      }
      await page.close();
    } else {
      await page.close();
      const total = Math.ceil(duration * FPS);
      const from = Math.round(Number(opt('from', 0)) * FPS);
      const to = Math.min(total, Math.round(Number(opt('to', duration)) * FPS));
      const per = Math.ceil((to - from) / WORKERS);
      let done = 0;
      const started = Date.now();
      const tick = () => {
        done++;
        if (done % 100 === 0) {
          const rate = done / ((Date.now() - started) / 1000);
          console.log(
            `  ${done}/${to - from} frames · ${rate.toFixed(1)} fps · eta ${((to - from - done) / rate).toFixed(0)} s`,
          );
        }
      };
      const parts = [];
      for (let w = 0; w < WORKERS; w++) {
        const a = from + w * per;
        const b = Math.min(to, a + per);
        if (a >= b) continue;
        parts.push({ a, b, file: join(OUT, `part-${w}.mp4`) });
      }
      await Promise.all(parts.map((p) => renderRange(browser, port, p.a, p.b, p.file, tick)));
      writeFileSync(join(OUT, 'parts.txt'), parts.map((p) => `file '${p.file}'`).join('\n'));
      const cat = ffmpeg([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        join(OUT, 'parts.txt'),
        '-c',
        'copy',
        join(OUT, 'video.mp4'),
      ]);
      cat.proc.stdin.end();
      await cat.done;
      console.log(
        `${join(OUT, 'video.mp4')} · ${to - from} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
}
