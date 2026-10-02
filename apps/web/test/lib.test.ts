import {
  createDocumentSnapshot,
  createNodeRecord,
  createSequentialIdGenerator,
  DEFAULT_TEXT_STYLE,
  DocumentStore,
} from '@opencanvas/core';
import { describe, expect, it } from 'vitest';
import { collectFaceUsage, parseUnicodeRange, selectSources } from '../src/lib/font-embed';
import { matchesQuery } from '../src/lib/search';
import { parseUserNumber } from '../src/lib/utils';

describe('parseUserNumber', () => {
  it.each([
    ['42', 42],
    ['-12.5', -12.5],
    ['12,5', 12.5],
    ['٤٢', 42],
    ['١٢٫٥', 12.5],
    ['۱۲۰', 120],
    ['١٬٢٠٠', 1200],
    ['−3', -3],
    [' 7 ', 7],
    ['.5', 0.5],
  ])('parses %s', (raw, expected) => {
    expect(parseUserNumber(raw)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '--1', '1e5x'])('rejects %s', (raw) => {
    expect(parseUserNumber(raw)).toBeNaN();
  });
});

describe('matchesQuery', () => {
  it.each([
    ['مُلصَق إعلاني', 'ملصق اعلاني'],
    ['أحمد', 'احمد'],
    ['آمنة', 'امنه'],
    ['مستشفى', 'مستشفي'],
    ['جـمـيـل', 'جميل'],
    ['مسؤول', 'مسوول'],
    ['تقرير ٢٠٢٦', '2026'],
    ['Café Menu', 'cafe'],
    ['Instagram Post', '  instagram '],
  ])('%s matches %s', (title, query) => {
    expect(matchesQuery(title, query)).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesQuery('بطاقة عمل', 'ملصق')).toBe(false);
    expect(matchesQuery('Poster', 'flyer')).toBe(false);
  });
});

describe('font embedding', () => {
  it('parses unicode ranges, including wildcards', () => {
    expect(parseUnicodeRange('U+0-FF, U+0131, u+0600-06ff, U+4??')).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x600, 0x6ff],
      [0x400, 0x4ff],
    ]);
    expect(parseUnicodeRange('')).toBeNull();
  });

  it('collects the faces and characters used on a page', () => {
    const createId = createSequentialIdGenerator();
    const snapshot = createDocumentSnapshot({ width: 500, height: 500, createId });
    const store = new DocumentStore(snapshot.records);
    const pageId = store.getPageIds()[0]!;
    store.transact((tx) => {
      tx.put(
        createNodeRecord('text', {
          id: createId('node'),
          parentId: pageId,
          index: 'a0',
          style: { ...DEFAULT_TEXT_STYLE, fontFamily: 'Cairo', fontWeight: 700 },
          content: {
            paragraphs: [
              {
                runs: [
                  { text: 'مرحبا ', style: {} },
                  { text: 'OK', style: { fontFamily: 'Inter', fontWeight: 400 } },
                ],
                list: 'bullet',
                indent: 0,
              },
            ],
          },
        }),
      );
    });
    const faces = collectFaceUsage(store, pageId);
    const cairo = faces.find((f) => f.family === 'Cairo')!;
    const inter = faces.find((f) => f.family === 'Inter')!;
    expect(cairo.weight).toBe(700);
    expect(cairo.codePoints.has('م'.codePointAt(0)!)).toBe(true);
    // List markers are drawn with the paragraph's first run.
    expect(cairo.codePoints.has('•'.codePointAt(0)!)).toBe(true);
    expect([...inter.codePoints].map((c) => String.fromCodePoint(c)).sort()).toEqual(['K', 'O', 'k', 'o']);
  });

  it('selects the closest weight and only the subsets the text needs', () => {
    const source = (family: string, weight: number, range: string, url: string) => ({
      name: family,
      family: family.toLowerCase(),
      style: 'normal',
      weight: [weight, weight] as [number, number],
      weightText: String(weight),
      ranges: parseUnicodeRange(range),
      rangeText: range,
      url,
      format: 'woff2',
    });
    const sources = [
      source('Cairo', 400, 'U+0600-06FF', 'cairo-arabic-400'),
      source('Cairo', 700, 'U+0600-06FF', 'cairo-arabic-700'),
      source('Cairo', 700, 'U+0000-00FF', 'cairo-latin-700'),
      source('Inter', 700, 'U+0000-00FF', 'inter-latin-700'),
    ];
    const face = { family: 'cairo', weight: 600, style: 'normal' as const, codePoints: new Set([0x645]) };
    expect(selectSources(sources, face).map((s) => s.url)).toEqual(['cairo-arabic-700']);
    expect(selectSources(sources, { ...face, family: 'Unknown' })).toEqual([]);
  });
});
