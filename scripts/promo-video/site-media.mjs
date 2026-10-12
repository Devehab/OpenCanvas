#!/usr/bin/env node
/**
 * Turns the recorded footage into the landing page media: short silent MP4
 * loops of each feature and WebP screenshots, in English and Arabic.
 *
 *   node scripts/promo-video/footage.mjs           # record first (app running)
 *   node scripts/promo-video/site-media.mjs
 *
 * Output: site/assets/media/<clip>-<lang>.mp4 (+ .webp poster), screenshots
 * (full size and 1440 px wide for phones) and the video posters (from
 * make.sh, in 1920, 1280 and 960 px).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FOOTAGE = new URL('./.work/footage/', import.meta.url).pathname;
const OUT = new URL('../../site/assets/media/', import.meta.url).pathname;
const VIEW = { width: 1440, height: 900 };
const WIDTH = 1280;

/** Clips: footage sequence and the part of the window worth showing (CSS px, LTR; all 1152×900). */
const CLIPS = [
  { name: 'templates', seq: 'templates', crop: [288, 0, 1152, 900] },
  { name: 'frames', seq: 'frames', crop: [0, 0, 1152, 900] },
  { name: 'crop', seq: 'crop', crop: [0, 0, 1152, 900] },
  { name: 'elements', seq: 'elements', crop: [0, 0, 1152, 900] },
  { name: 'effects', seq: 'effects', crop: [288, 0, 1152, 900] },
  { name: 'pages', seq: 'pages', crop: [0, 0, 1152, 900] },
  { name: 'brand', seq: 'brand-apply', crop: [0, 0, 1152, 900] },
  { name: 'export', seq: 'export', crop: [144, 0, 1152, 900] },
  { name: 'guides', seq: 'guides', crop: [0, 0, 1152, 900] },
  { name: 'formats', seq: 'create', crop: [144, 0, 1152, 900] },
  // Arabic typing: recorded once, in the Arabic interface.
  { name: 'arabic', seq: 'arabic', crop: [288, 0, 1152, 900], langs: ['ar'] },
];

/** Screenshots for the gallery. */
const STILLS = [
  ['editor', 'editor.jpg'],
  ['dashboard', 'dashboard.jpg'],
  ['templates-page', 'templates.jpg'],
  ['brand-kit', 'brand-top.jpg'],
];

mkdirSync(OUT, { recursive: true });
const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;

/** An image as WebP, optionally scaled down to `width`. */
function webp(src, out, { width, quality = 82 } = {}) {
  const scale = width ? ['-vf', `scale=${width}:-1:flags=lanczos`] : [];
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    src,
    ...scale,
    '-c:v',
    'libwebp',
    '-quality',
    String(quality),
    out,
  ]);
  console.log(`  ${out.split('/').pop()}  ${kb(out)}`);
}

function clip(lang, c) {
  const dir = join(FOOTAGE, lang);
  const json = join(dir, `${c.seq}.json`);
  if (!existsSync(json)) {
    console.warn(`  skip ${c.name}-${lang}: no ${c.seq} footage`);
    return;
  }
  const seq = JSON.parse(readFileSync(json, 'utf8'));
  // The Arabic interface is mirrored: so is the interesting part.
  let [x, y, w, h] = c.crop;
  if (lang === 'ar') x = VIEW.width - x - w;
  const s = seq.scale;
  const list = join(tmpdir(), `oc-${lang}-${c.name}.txt`);
  const lines = [];
  for (const f of seq.frames) {
    lines.push(`file '${join(dir, f.file)}'`, `duration ${(f.hold / seq.fps).toFixed(4)}`);
  }
  // The concat demuxer needs the last file twice for its duration to count.
  lines.push(`file '${join(dir, seq.frames.at(-1).file)}'`);
  writeFileSync(list, lines.join('\n'));
  const out = join(OUT, `${c.name}-${lang}.mp4`);
  const vf = `crop=${w * s}:${h * s}:${x * s}:${y * s},scale=${WIDTH}:-2:flags=lanczos,fps=30,format=yuv420p`;
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '24',
    '-profile:v',
    'high',
    '-movflags',
    '+faststart',
    '-an',
    out,
  ]);
  // Poster: the last frame (the finished result).
  const poster = join(OUT, `${c.name}-${lang}.webp`);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-sseof',
    '-0.1',
    '-i',
    out,
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '80',
    poster,
  ]);
  rmSync(list);
  console.log(`  ${c.name}-${lang}.mp4  ${kb(out)}  poster ${kb(poster)}`);
}

for (const lang of ['en', 'ar']) {
  console.log(lang);
  for (const c of CLIPS) if (!c.langs || c.langs.includes(lang)) clip(lang, c);
  for (const [name, file] of STILLS) {
    const src = join(FOOTAGE, lang, file);
    if (!existsSync(src)) continue;
    webp(src, join(OUT, `${name}-${lang}.webp`));
    webp(src, join(OUT, `${name}-${lang}-1440.webp`), { width: 1440, quality: 80 });
  }
  // The video's poster (written by make.sh), in three sizes for srcset.
  const poster = new URL(`./.work/${lang}/poster-${lang}.jpg`, import.meta.url).pathname;
  if (existsSync(poster)) {
    webp(poster, join(OUT, `promo-${lang}.webp`), { quality: 80 });
    webp(poster, join(OUT, `promo-${lang}-1280.webp`), { width: 1280, quality: 78 });
    webp(poster, join(OUT, `promo-${lang}-960.webp`), { width: 960, quality: 78 });
  }
}
