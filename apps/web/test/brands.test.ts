import { describe, expect, it } from 'vitest';
import { brandColors, defaultBrand, sanitizeBrand } from '../src/lib/storage/brands';
import type { BrandRecord } from '../src/lib/storage/db';

const brand = (patch: Partial<BrandRecord> = {}): BrandRecord => ({
  id: 'brand_1',
  createdAt: 1,
  updatedAt: 1,
  ...defaultBrand('Acme'),
  ...patch,
});

describe('brand kits', () => {
  it('starts with a palette and heading/subheading/body fonts', () => {
    const b = brand();
    expect(b.name).toBe('Acme');
    expect(b.palettes[0]!.colors.length).toBeGreaterThan(0);
    expect(b.fonts.heading.weight).toBeGreaterThan(b.fonts.body.weight);
  });

  it('sanitizes colors, fonts, images and voice', () => {
    const b = sanitizeBrand(
      brand({
        name: '   ',
        palettes: [
          { id: 'p', name: 'Main', colors: ['#FF0000', '#ff0000', 'red', 'javascript:x', '#00ff0080'] },
        ],
        fonts: {
          heading: { family: 'Cairo', weight: 1234, size: 9999 },
          subheading: { family: '', weight: 0, size: -4 },
          body: { family: 'Inter', weight: 450, size: 16 },
        },
        logos: [
          { hash: 'not-a-hash', mimeType: 'image/png', width: 1, height: 1, name: 'x' },
          { hash: `sha256-${'a'.repeat(64)}`, mimeType: 'image/png', width: 1, height: 1, name: 'logo' },
        ],
        voice: { description: 'Friendly', tone: ['warm', ' warm ', '', 'bold'], dos: '', donts: '' },
      }),
    );
    expect(b.name).toBe('Brand kit');
    expect(b.palettes[0]!.colors).toEqual(['#ff0000', '#00ff0080']);
    expect(b.fonts.heading).toEqual({ family: 'Cairo', weight: 900, size: 400 });
    expect(b.fonts.subheading).toEqual({ family: 'Inter', weight: 400, size: 6 });
    expect(b.fonts.body.weight).toBe(500);
    expect(b.logos.map((l) => l.name)).toEqual(['logo']);
    expect(b.voice.tone).toEqual(['warm', 'bold']);
  });

  it('lists colors across palettes without duplicates', () => {
    const b = brand({
      palettes: [
        { id: 'a', name: 'A', colors: ['#111111', '#222222'] },
        { id: 'b', name: 'B', colors: ['#222222', '#333333'] },
      ],
    });
    expect(brandColors(b)).toEqual(['#111111', '#222222', '#333333']);
    expect(brandColors(null)).toEqual([]);
  });
});
