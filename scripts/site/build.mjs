// Builds the landing page for GitHub Pages: site/index.html is a template
// with every text in English and Arabic; this makes one static page per
// language (/ in English, /ar/ in Arabic), each with its own title,
// description, canonical and hreflang links, social cards and structured
// data, the stylesheet inlined (no render-blocking request on a first
// visit), a sitemap and a 404 page. No dependencies: Node built-ins only.
//
//   node scripts/site/build.mjs                 # → _site/
//   node scripts/site/build.mjs --serve [port]  # build, then serve it like GitHub Pages
//   SITE_URL=https://example.org/ node scripts/site/build.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('../../', import.meta.url).pathname;
const SRC = join(REPO, 'site');
const OUT = join(REPO, '_site');
// The published address (the Pages workflow passes it in), always ending in "/".
const SITE_URL = `${(/^https?:\/\/[^/]/.test(process.env.SITE_URL ?? '') ? process.env.SITE_URL : 'https://devehab.github.io/OpenCanvas').replace(/\/+$/, '')}/`;
const BASE_PATH = new URL(SITE_URL).pathname;
const REPO_URL = 'https://github.com/Devehab/OpenCanvas';
const LANGS = ['en', 'ar'];

/** Everything that differs between the two pages' heads. */
const PAGES = {
  en: {
    path: '',
    dir: 'ltr',
    locale: 'en_US',
    title: 'OpenCanvas — Free, open-source design editor',
    description:
      'Create social media posts, presentations and print designs for free. Open-source design editor with templates, brand kits, 2,900 icons and Arabic support.',
    ogTitle: 'OpenCanvas — Pro designs. Zero cost.',
    ogDescription:
      'A free, open-source design editor: no subscription, no watermark, no account. Your designs stay on your device. In English and Arabic.',
    appDescription:
      'A free, open-source design editor you run yourself: templates, photo frames, crop, effects, layers, brand kits, about 2,900 icons, 70 design sizes, multi-page designs, professional exports and a full Arabic interface. Designs stay on your device, with optional sync to your own R2 or S3 storage.',
    author: 'Ehab Kahwati',
    video: {
      name: 'OpenCanvas in one minute',
      description:
        'A one-minute tour of OpenCanvas, the free, open-source design editor: templates, photo frames, crop, effects, brand kits, icons, Arabic support and sync to your own cloud.',
      duration: 'PT1M7S',
    },
  },
  ar: {
    path: 'ar/',
    dir: 'rtl',
    locale: 'ar_AR',
    title: 'OpenCanvas — محرّر تصاميم مجاني ومفتوح المصدر يدعم العربية',
    description:
      'صمّم منشورات التواصل الاجتماعي والعروض التقديمية وملفات الطباعة مجانًا. محرّر تصاميم مفتوح المصدر فيه قوالب وحزم هوية ونحو 2900 أيقونة و30 خطًا عربيًا.',
    ogTitle: 'OpenCanvas — تصاميم احترافية بلا أي تكلفة',
    ogDescription:
      'محرّر تصاميم مجاني ومفتوح المصدر: بلا اشتراك، وبلا علامة مائية، وبلا حساب. تبقى تصاميمك على جهازك، وواجهته عربية بالكامل.',
    appDescription:
      'محرّر تصاميم مجاني ومفتوح المصدر تشغّله بنفسك: قوالب، وإطارات للصور، وقصّ، وتأثيرات، وطبقات، وحزم هوية، ونحو 2900 أيقونة، و70 مقاسًا جاهزًا، وتصاميم متعددة الصفحات، وتصدير احترافي، وواجهة عربية كاملة. تبقى تصاميمك على جهازك، ويمكنك مزامنتها مع تخزينك الخاص على R2 أو S3.',
    author: 'إيهاب قهواتي',
    video: {
      name: 'OpenCanvas في دقيقة',
      description:
        'جولة مدتها دقيقة في OpenCanvas، محرّر التصاميم المجاني المفتوح المصدر: القوالب، وإطارات الصور، والقصّ، والتأثيرات، وحزم الهوية، والأيقونات، والعربية، والمزامنة مع سحابتك الخاصة.',
      duration: 'PT58S',
    },
  },
};
const VIDEO_UPLOADED = '2026-10-12T12:00:00+00:00';
/** Site verification codes from Google Search Console and Bing Webmaster Tools (HTML tag method). */
const VERIFICATION = { 'google-site-verification': '', 'msvalidate.01': '' };

// Arabic readers who arrive at the English page go to theirs: their earlier
// choice, then ?lang=ar, then the device languages, then the time zone (a
// privacy-friendly stand-in for the country; no location lookup). Search
// engines read each page as it is.
const REDIRECT_EN = `(() => {
  document.documentElement.classList.add('js');
  const ARAB_TIME_ZONES = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Kuwait', 'Asia/Muscat', 'Asia/Aden', 'Asia/Baghdad', 'Asia/Damascus', 'Asia/Amman', 'Asia/Beirut', 'Asia/Gaza', 'Asia/Hebron', 'Africa/Cairo', 'Africa/Tripoli', 'Africa/Tunis', 'Africa/Algiers', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Khartoum', 'Africa/Nouakchott', 'Africa/Mogadishu', 'Africa/Djibouti', 'Indian/Comoro'];
  const valid = (value) => (value === 'ar' || value === 'en' ? value : null);
  const attempt = (read) => { try { return read(); } catch { return null; } };
  const fromQuery = () => valid(new URLSearchParams(location.search).get('lang'));
  const fromStorage = () => valid(localStorage.getItem('oc-site-lang'));
  const fromDevice = () => {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
    for (const tag of list) {
      const match = valid(String(tag).slice(0, 2).toLowerCase());
      if (match) return match;
    }
    return null;
  };
  const fromTimeZone = () => (ARAB_TIME_ZONES.includes(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'ar' : null);
  const lang = attempt(fromQuery) || attempt(fromStorage) || attempt(fromDevice) || attempt(fromTimeZone) || 'en';
  if (lang === 'ar') location.replace('ar/' + location.hash);
})();`;
// The Arabic page only honours an explicit ?lang=en (old links used ?lang=).
const REDIRECT_AR = `(() => {
  document.documentElement.classList.add('js');
  try {
    if (new URLSearchParams(location.search).get('lang') === 'en') location.replace('../' + location.hash);
  } catch {}
})();`;

// ---------- A small HTML scanner (the template is our own, well-formed HTML) ----------
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** The tags of `html` from offset `from` on (comments and script bodies skipped). */
function* tags(html, from = 0) {
  const re = new RegExp(TAG.source, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].startsWith('<!--')) continue;
    const tag = {
      start: m.index,
      end: re.lastIndex,
      close: m[1] === '/',
      name: m[2].toLowerCase(),
      attrs: m[3],
      selfClosing: /\/\s*$/.test(m[3]),
    };
    yield tag;
    // Script and style bodies are text, not markup.
    if (!tag.close && (tag.name === 'script' || tag.name === 'style')) {
      const end = html.indexOf(`</${tag.name}`, re.lastIndex);
      if (end === -1) throw new Error(`Unclosed <${tag.name}>`);
      re.lastIndex = end;
    }
  }
}

const isLeaf = (tag) => VOID.has(tag.name) || tag.selfClosing;

/** The end offset of the element whose opening tag is `open`. */
function elementEnd(html, open) {
  if (isLeaf(open)) return open.end;
  let depth = 0;
  for (const tag of tags(html, open.start)) {
    if (tag.name !== open.name || isLeaf(tag)) continue;
    depth += tag.close ? -1 : 1;
    if (depth === 0) return tag.end;
  }
  throw new Error(`Unclosed <${open.name}> at ${open.start}`);
}

/** Removes [start, end), and the line it leaves empty. */
function cut(html, start, end) {
  const lineStart = html.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = html.indexOf('\n', end);
  if (
    /^\s*$/.test(html.slice(lineStart, start)) &&
    /^\s*$/.test(html.slice(end, lineEnd === -1 ? undefined : lineEnd))
  )
    return html.slice(0, lineStart) + html.slice(lineEnd === -1 ? html.length : lineEnd + 1);
  return html.slice(0, start) + html.slice(end);
}

const ATTR = /\s([\w:.-]+)(?:\s*=\s*"([^"]*)")?/g;
const escapeAttr = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/** Keeps one language: drops the other's elements, applies data-ar-* attributes. */
function localize(template, lang) {
  let html = template;
  // Remove the other language's elements, last first so offsets stay valid.
  const ranges = [];
  for (const tag of tags(html)) {
    if (tag.close) continue;
    const l = /\sdata-l="(\w+)"/.exec(tag.attrs)?.[1];
    if (l && l !== lang) ranges.push([tag.start, elementEnd(html, tag)]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const outer = ranges.filter(
    (r, i) => !ranges.some((o, j) => j !== i && o[0] <= r[0] && r[1] <= o[1] && o !== r),
  );
  for (const [start, end] of outer.reverse()) html = cut(html, start, end);

  // Rewrite the opening tags that carry language attributes.
  return html.replace(TAG, (whole, close, name, attrs) => {
    if (whole.startsWith('<!--') || close || !/\sdata-(l|ar-[\w-]+)=/.test(attrs)) return whole;
    const list = [...attrs.matchAll(ATTR)].map((m) => ({ name: m[1], value: m[2] }));
    const variants = new Map(
      list
        .filter((a) => a.name.startsWith('data-ar-'))
        .map((a) => [a.name.slice('data-ar-'.length), a.value]),
    );
    let kept = list.filter((a) => a.name !== 'data-l' && !a.name.startsWith('data-ar-'));
    if (lang === 'ar') {
      for (const [attr, value] of variants) {
        if (kept.some((a) => a.name === attr))
          kept = kept.map((a) => (a.name === attr ? { name: attr, value } : a));
        else kept.push({ name: attr, value });
      }
    }
    const tail = /\/\s*$/.test(attrs) ? ' /' : '';
    const text = kept.map((a) => (a.value === undefined ? ` ${a.name}` : ` ${a.name}="${a.value}"`)).join('');
    return `<${name}${text}${tail}>`;
  });
}

/** Points asset paths of a page in a sub-folder back to the shared assets. */
function rebase(html, prefix) {
  if (!prefix) return html;
  return html
    .replace(/(\s(?:src|href|poster|data-src|data-poster)=")assets\//g, `$1${prefix}assets/`)
    .replace(
      /(\ssrcset=")([^"]*)"/g,
      (_, attr, value) => `${attr}${value.replace(/(^|,\s*)assets\//g, `$1${prefix}assets/`)}"`,
    );
}

/** Drops the sprite's icons that neither the page nor its script uses. */
function pruneIcons(html, js) {
  const used = new Set([...(html + js).matchAll(/href="#(i-[\w-]+)"/g)].map((m) => m[1]));
  return html.replace(/\n\s*<symbol id="(i-[\w-]+)"[\s\S]*?<\/symbol>/g, (whole, id) =>
    used.has(id) ? whole : '',
  );
}

/** Comments out, whitespace collapsed; the CSS is ours and has no tricky strings. */
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** The questions and answers of the FAQ section, for FAQPage data. */
function faq(html) {
  return [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({
    '@type': 'Question',
    name: textOf(m[1]),
    acceptedAnswer: { '@type': 'Answer', text: textOf(m[2]) },
  }));
}

function head(lang, body) {
  const page = PAGES[lang];
  const url = SITE_URL + page.path;
  const prefix = lang === 'en' ? '' : '../';
  const og = `${SITE_URL}assets/img/og-${lang}.jpg`;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        url: SITE_URL,
        name: 'OpenCanvas',
        inLanguage: LANGS,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}#app`,
        name: 'OpenCanvas',
        url,
        description: page.appDescription,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Windows, macOS, Linux',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isAccessibleForFree: true,
        license: 'https://opensource.org/licenses/MIT',
        downloadUrl: `${REPO_URL}/releases`,
        codeRepository: REPO_URL,
        inLanguage: LANGS,
        image: og,
        screenshot: ['editor', 'dashboard', 'templates-page', 'brand-kit'].map(
          (name) => `${SITE_URL}assets/media/${name}-${lang}.webp`,
        ),
        author: { '@type': 'Person', name: page.author, url: 'https://github.com/Devehab' },
      },
      {
        '@type': 'VideoObject',
        name: page.video.name,
        description: page.video.description,
        thumbnailUrl: `${SITE_URL}assets/media/promo-${lang}.webp`,
        uploadDate: VIDEO_UPLOADED,
        duration: page.video.duration,
        contentUrl: `${SITE_URL}assets/media/opencanvas-${lang}.mp4`,
        inLanguage: lang,
      },
      { '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: lang, mainEntity: faq(body) },
    ],
  };
  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${SITE_URL + PAGES[l].path}" />`,
  ).join('\n    ');
  const fonts =
    lang === 'en'
      ? ['inter-latin-wght-normal']
      : [
          'ibm-plex-sans-arabic-arabic-400-normal',
          'ibm-plex-sans-arabic-arabic-600-normal',
          'ibm-plex-sans-arabic-arabic-700-normal',
          'inter-latin-wght-normal',
        ];
  return `<script>
      ${(lang === 'en' ? REDIRECT_EN : REDIRECT_AR).replaceAll('\n', '\n      ')}
    </script>
    <title>${page.title}</title>
    <meta name="description" content="${escapeAttr(page.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1" />${Object.entries(
      VERIFICATION,
    )
      .filter(([, code]) => code)
      .map(([name, code]) => `\n    <meta name="${name}" content="${escapeAttr(code)}" />`)
      .join('')}
    <link rel="canonical" href="${url}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="OpenCanvas" />
    <meta property="og:title" content="${escapeAttr(page.ogTitle)}" />
    <meta property="og:description" content="${escapeAttr(page.ogDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${og}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeAttr(page.ogTitle)}" />
    <meta property="og:locale" content="${page.locale}" />
    <meta property="og:locale:alternate" content="${PAGES[lang === 'en' ? 'ar' : 'en'].locale}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(page.ogTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(page.ogDescription)}" />
    <meta name="twitter:image" content="${og}" />
    ${fonts.map((f) => `<link rel="preload" href="${prefix}assets/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin />`).join('\n    ')}
    <script type="application/ld+json">${JSON.stringify(data).replaceAll('</', '<\\/')}</script>`;
}

// ---------- Checks: a broken page must not reach the site ----------
function check(html, lang, file) {
  const fail = (message) => {
    throw new Error(`${file}: ${message}`);
  };
  if (/\sdata-l="/.test(html)) fail('a data-l element is left');
  if (/\sdata-ar-[\w-]+="/.test(html)) fail('a data-ar-* attribute is left');
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) fail('there must be exactly one <h1>');
  // Balanced markup.
  const depth = new Map();
  for (const tag of tags(html)) {
    if (isLeaf(tag)) continue;
    depth.set(tag.name, (depth.get(tag.name) ?? 0) + (tag.close ? -1 : 1));
  }
  for (const [name, d] of depth) if (d !== 0) fail(`unbalanced <${name}> (${d})`);
  // Unique ids, and in-page links that land somewhere.
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) fail(`duplicate id "${dup}"`);
  for (const m of html.matchAll(/\s(?:href|aria-controls|aria-labelledby)="#?([^"]+)"/g)) {
    const [attr] = m[0].trim().split('=');
    if (attr === 'href' && !m[0].includes('"#')) continue;
    for (const id of m[1].split(/\s+/))
      if (id && !ids.includes(id)) fail(`${attr} points to a missing id "${id}"`);
  }
  // Every local file the page uses exists.
  const prefix = lang === 'en' ? '' : '../';
  const refs = [
    ...[...html.matchAll(/\s(?:src|href|poster|data-src|data-poster)="([^"#:]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) =>
      m[1].split(',').map((s) => s.trim().split(/\s+/)[0]),
    ),
    ...[...html.matchAll(/url\(([^)'"]+)\)/g)].map((m) => m[1]),
  ];
  for (const ref of refs) {
    if (ref === '../' || ref === 'ar/' || ref.startsWith('//') || ref.startsWith('data:')) continue;
    const local = ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
    if (!local || !existsSync(join(SRC, local.split('?')[0]))) fail(`missing file "${ref}"`);
  }
  // The other script on the page.
  const other = lang === 'en' ? /[؀-ۿ]/ : null;
  if (other) {
    // Arabic is allowed only where it is marked as Arabic (the language link).
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<(\w+)[^>]*\slang="ar"[^>]*>[\s\S]*?<\/\1>/g, '');
    const at = stripped.search(other);
    if (at !== -1) fail(`Arabic text on the English page: "${stripped.slice(at - 60, at + 40)}"`);
  }
  JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1].replaceAll('<\\/', '</'),
  );
}

// ---------- Build ----------
const template = readFileSync(join(SRC, 'index.html'), 'utf8');
if (!template.includes('<!-- build:head -->'))
  throw new Error('site/index.html: the <!-- build:head --> marker is missing');
const css = minifyCss(readFileSync(join(SRC, 'assets/css/site.css'), 'utf8'));
const script = readFileSync(join(SRC, 'assets/js/site.js'), 'utf8');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(SRC, 'assets'), join(OUT, 'assets'), {
  recursive: true,
  filter: (path) => !path.endsWith('.css'),
});

for (const lang of LANGS) {
  const page = PAGES[lang];
  const prefix = lang === 'en' ? '' : '../';
  let html = localize(template, lang);
  html = html.replace('<html lang="en" dir="ltr">', `<html lang="${lang}" dir="${page.dir}">`);
  // The template's explanatory comment stays in the template.
  html = html.replace(/\n\s*<!--\n\s*This is the template[\s\S]*?-->/, '');
  html = rebase(html, prefix);
  html = pruneIcons(html, script);
  html = html.replace('<!-- build:head -->', head(lang, html));
  const style = css.replace(/url\(\.\.\/fonts\//g, `url(${prefix}assets/fonts/`);
  html = html.replace(
    /<link rel="stylesheet" href="(?:\.\.\/)?assets\/css\/site\.css" \/>/,
    `<style>${style}</style>`,
  );
  const file = join(OUT, page.path, 'index.html');
  check(html, lang, `${page.path}index.html`);
  mkdirSync(join(OUT, page.path), { recursive: true });
  writeFileSync(file, html);
  console.log(`${page.path || '/'}index.html  ${(html.length / 1024).toFixed(0)} KB`);
}

// The sitemap, with each page's language versions.
const today = new Date().toISOString().slice(0, 10);
const links = LANGS.map(
  (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL + PAGES[l].path}" />`,
)
  .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}" />`)
  .join('\n');
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => `  <url>\n    <loc>${SITE_URL + PAGES[l].path}</loc>\n    <lastmod>${today}</lastmod>\n${links}\n  </url>`).join('\n')}
</urlset>
`,
);

// GitHub Pages shows 404.html for any missing address under the site.
writeFileSync(
  join(OUT, '404.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Page not found — OpenCanvas</title>
    <link rel="icon" href="${BASE_PATH}assets/img/logo.svg" type="image/svg+xml" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0a1f; color: #fff;
        font: 17px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; text-align: center; }
      main { padding: 24px; }
      img { width: 64px; height: 64px; }
      h1 { margin: 20px 0 8px; font-size: 28px; }
      p { margin: 0 0 4px; color: rgb(255 255 255 / 72%); }
      nav { display: flex; gap: 12px; justify-content: center; margin-top: 28px; flex-wrap: wrap; }
      a { padding: 10px 20px; border-radius: 999px; background: #fff; color: #1e1a4d; font-weight: 600; text-decoration: none; }
      a + a { background: rgb(255 255 255 / 10%); color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <img src="${BASE_PATH}assets/img/logo.svg" alt="" />
      <h1>Page not found</h1>
      <p>This page does not exist.</p>
      <p lang="ar" dir="rtl">هذه الصفحة غير موجودة.</p>
      <nav>
        <a href="${BASE_PATH}">OpenCanvas</a>
        <a href="${BASE_PATH}ar/" lang="ar" hreflang="ar">الصفحة العربية</a>
      </nav>
    </main>
  </body>
</html>
`,
);
console.log(`sitemap.xml, 404.html → ${OUT}`);

// ---------- Preview ----------
if (process.argv.includes('--serve')) {
  const { createServer } = await import('node:http');
  const { readFile, stat } = await import('node:fs/promises');
  const { extname, normalize } = await import('node:path');
  const { gzipSync } = await import('node:zlib');
  const port = Number(process.argv[process.argv.indexOf('--serve') + 1]) || 4800;
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.vtt': 'text/vtt',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
  };
  createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(BASE_PATH)) {
      if (url.pathname === '/') res.writeHead(302, { Location: BASE_PATH });
      else res.writeHead(404);
      return res.end();
    }
    let path = normalize(join(OUT, decodeURIComponent(url.pathname.slice(BASE_PATH.length))));
    if (!path.startsWith(OUT)) return res.writeHead(403).end();
    try {
      if ((await stat(path)).isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
          return res.end();
        }
        path = join(path, 'index.html');
      }
      let body = await readFile(path);
      const type = TYPES[extname(path)] ?? 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600' };
      // Like GitHub Pages: text is compressed.
      if (
        /^(text|application\/xml|image\/svg)/.test(type) &&
        /gzip/.test(req.headers['accept-encoding'] ?? '')
      ) {
        body = gzipSync(body);
        headers['Content-Encoding'] = 'gzip';
      }
      res.writeHead(200, headers).end(body);
    } catch {
      res
        .writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(await readFile(join(OUT, '404.html')));
    }
  }).listen(port, () => console.log(`Preview: http://localhost:${port}${BASE_PATH}`));
}
