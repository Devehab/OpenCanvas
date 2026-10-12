# The landing page

`index.html` is a template with every text in English and Arabic
(`data-l="en"` / `data-l="ar"` elements, and `data-ar-<attribute>` for an
attribute's Arabic value). `scripts/site/build.mjs` turns it into two static
pages, so each language has its own address for people and search engines:

| Page | Address |
| --- | --- |
| English | `https://devehab.github.io/OpenCanvas/` |
| Arabic | `https://devehab.github.io/OpenCanvas/ar/` |

```bash
node scripts/site/build.mjs           # → _site/ (what GitHub Pages serves)
node scripts/site/build.mjs --serve   # → http://localhost:4800/OpenCanvas/
```

The build adds what each page needs on its own: the title and description in
its language, canonical and `hreflang` links between the two pages, social
cards (`assets/img/og-<lang>.jpg`), structured data (the app, the video and the
FAQ), the stylesheet inlined so a first visit makes no render-blocking request,
font preloads, `sitemap.xml` and a 404 page. It checks the result and stops on
a problem (text of the other language left over, a broken link or file, a
duplicate id, unbalanced markup).

Visitors whose browser prefers Arabic, or who chose Arabic before, are sent
from the English page to the Arabic one; `?lang=ar` and `?lang=en` still work
for old links. Search engines are not redirected.

The `Landing page` workflow builds and publishes the site on every push to the
default branch that touches `site/` or the build script.

## Search engines

After the first deploy, once:

1. In [Google Search Console](https://search.google.com/search-console), add
   a **URL prefix** property for `https://devehab.github.io/OpenCanvas/`,
   verify it with the **HTML tag** method (copy the `content` code into
   `VERIFICATION` in `scripts/site/build.mjs` and push), then submit
   `https://devehab.github.io/OpenCanvas/sitemap.xml` under **Sitemaps**.
2. In [Bing Webmaster Tools](https://www.bing.com/webmasters), import the
   property from Google Search Console (or verify it the same way, with the
   `msvalidate.01` code). Bing also feeds DuckDuckGo and others.

A project site cannot have its own `robots.txt` (only the account's
`devehab.github.io` site can); nothing is blocked, so none is needed.
