import { loadDocument, type TextNode } from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { FONT_CATALOG } from '../src/lib/fonts';
import { buildStarter, STARTER_TEMPLATES } from '../src/lib/templates/starters';

describe('starter templates', () => {
  const fonts = new Set(FONT_CATALOG.map((f) => f.family));

  for (const starter of STARTER_TEMPLATES) {
    for (const lang of ['en', 'ar'] as const) {
      it(`${starter.id} (${lang}) is a valid document that fits its page`, () => {
        const { store, issues } = loadDocument(buildStarter(starter, lang));
        expect(issues).toEqual([]);
        expect(store.getDocument()!.title).toBe(starter.title[lang]);
        expect(store.getDocument()!.formatId).toBe(starter.formatId);
        const pages = store.getPages();
        expect(pages.length).toBe(starter.pages(lang).length);
        for (const page of pages) {
          expect([page.width, page.height]).toEqual([starter.width, starter.height]);
          expect(store.getChildIds(page.id).length).toBeGreaterThan(0);
        }
        for (const node of store.getNodes()) {
          // Every text uses a font of the catalog (so it loads everywhere).
          if (node.type === 'text') expect(fonts.has((node as TextNode).style.fontFamily)).toBe(true);
        }
      });
    }

    it(`${starter.id}: the Arabic version is the English one mirrored`, () => {
      // Elements in layer order, page by page.
      const nodes = (lang: 'en' | 'ar') => {
        const { store } = loadDocument(buildStarter(starter, lang));
        return store.getPageIds().flatMap((id) => store.getChildren(id));
      };
      const en = nodes('en');
      const ar = nodes('ar');
      expect(ar.length).toBe(en.length);
      en.forEach((node, i) => {
        const other = ar[i]!;
        expect(other.x).toBeCloseTo(starter.width - node.x - node.width, 5);
        if (node.type === 'text' && (node as TextNode).align === 'left')
          expect((other as TextNode).align).toBe('right');
      });
    });
  }

  it('builds a fresh document each time (new ids, nothing shared)', () => {
    const a = buildStarter(STARTER_TEMPLATES[0]!, 'en');
    const b = buildStarter(STARTER_TEMPLATES[0]!, 'en');
    const ids = (s: typeof a) => new Set(s.records.map((r) => r.id));
    for (const id of ids(a)) if (!id.startsWith('document')) expect(ids(b).has(id)).toBe(false);
  });
});
