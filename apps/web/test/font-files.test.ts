import { describe, expect, it } from 'vitest';
import { guessFontInfo, sniffFontFormat } from '@/lib/font-files';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe('sniffFontFormat', () => {
  it('detects formats from the signature, not the name', () => {
    expect(sniffFontFormat(bytes('wOF2', 0, 1))).toBe('woff2');
    expect(sniffFontFormat(bytes('wOFF', 0, 1))).toBe('woff');
    expect(sniffFontFormat(bytes('OTTO', 0, 1))).toBe('opentype');
    expect(sniffFontFormat(bytes(0, 1, 0, 0, 0, 12))).toBe('truetype');
    expect(sniffFontFormat(bytes('true', 0))).toBe('truetype');
  });

  it('rejects anything else', () => {
    expect(sniffFontFormat(bytes('%PDF-1.7'))).toBeNull();
    expect(sniffFontFormat(bytes(0x89, 'PNG'))).toBeNull();
    expect(sniffFontFormat(bytes('wO'))).toBeNull();
  });
});

describe('guessFontInfo', () => {
  it.each([
    ['Cairo-Bold.ttf', { family: 'Cairo', weight: 700, style: 'normal' }],
    ['Cairo-SemiBold.woff2', { family: 'Cairo', weight: 600, style: 'normal' }],
    ['OpenSans-ExtraBoldItalic.ttf', { family: 'OpenSans', weight: 800, style: 'italic' }],
    ['Open Sans Light.otf', { family: 'Open Sans', weight: 300, style: 'normal' }],
    ['my_brand_font_700.woff', { family: 'my brand font', weight: 700, style: 'normal' }],
    ['LatoBoldItalic.ttf', { family: 'Lato', weight: 700, style: 'italic' }],
    ['Roboto[wght].ttf', { family: 'Roboto', weight: 400, style: 'normal' }],
    ['Inter-Italic.woff2', { family: 'Inter', weight: 400, style: 'italic' }],
    ['خط-عربي-Regular.ttf', { family: 'خط عربي', weight: 400, style: 'normal' }],
    ['Black.ttf', { family: 'Black', weight: 400, style: 'normal' }],
  ])('%s', (name, expected) => {
    expect(guessFontInfo(name)).toEqual(expected);
  });
});
