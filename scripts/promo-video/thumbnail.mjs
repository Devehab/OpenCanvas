// Renders the video thumbnails (1920×1080, for LinkedIn and YouTube) and the
// link preview images of the landing page (1200×630) from the templates in
// thumbnail/, using the recorded footage.
//
//   node scripts/promo-video/thumbnail.mjs        # → .work/thumbnail-<lang>.png
//                                                 #   site/assets/img/og-<lang>.jpg
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const REPO = new URL('../../', import.meta.url).pathname;
const HERE = join(REPO, 'scripts/promo-video');
const WORK = join(HERE, '.work');
const PNPM = join(REPO, 'node_modules/.pnpm');

function fontsource(slug, file) {
  const dir = readdirSync(PNPM).find((d) => d.startsWith(`@fontsource+${slug}@`));
  if (!dir) throw new Error(`@fontsource/${slug} is not installed (pnpm install)`);
  return `file://${join(PNPM, dir, 'node_modules/@fontsource', slug, 'files', file)}`;
}

const FONTS = [
  `@font-face { font-family: "Inter"; font-weight: 100 900; src: url("file://${join(REPO, 'site/assets/fonts/inter-latin-wght-normal.woff2')}") format("woff2"); }`,
  ...[500, 600, 700].map(
    (w) =>
      `@font-face { font-family: "Readex"; font-weight: ${w}; src: url("${fontsource('readex-pro', `readex-pro-arabic-${w}-normal.woff2`)}") format("woff2"); }`,
  ),
].join('\n  ');

mkdirSync(WORK, { recursive: true });
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  const html = readFileSync(join(HERE, `thumbnail/thumbnail-${lang}.html`), 'utf8')
    .replace('/*FONTS*/', FONTS)
    .replaceAll('{{FOOTAGE}}', `file://${join(WORK, 'footage', lang)}`)
    .replaceAll('{{SITE}}', `file://${join(REPO, 'site')}`);
  const page_ = join(WORK, `thumbnail-${lang}.html`);
  writeFileSync(page_, html);

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`file://${page_}`);
  await page.evaluate(() => document.fonts.ready);
  const broken = await page.evaluate(() =>
    [...document.images].filter((img) => !img.naturalWidth).map((img) => img.src),
  );
  if (broken.length) throw new Error(`Missing footage (run footage.mjs first): ${broken.join(', ')}`);
  await page.screenshot({ path: join(WORK, `thumbnail-${lang}.png`) });
  await page.close();

  // The link preview: the same design, 1.91:1, trimmed top and bottom.
  const og = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.625 });
  await og.goto(`file://${page_}`);
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({
    path: join(REPO, `site/assets/img/og-${lang}.jpg`),
    type: 'jpeg',
    quality: 86,
    clip: { x: 0, y: 36, width: 1920, height: 1008 },
  });
  await og.close();
  console.log(`thumbnail-${lang}.png, og-${lang}.jpg`);
}
await browser.close();
