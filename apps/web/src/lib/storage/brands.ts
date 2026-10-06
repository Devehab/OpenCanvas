/**
 * Brand kits: logos, color palettes, fonts, brand voice, photos, graphics,
 * icons and brand templates. Several kits can exist (one per brand or client).
 * Images live in the shared, content-addressed asset store.
 */
import { createRandomIdGenerator } from '@opencanvas/core';
import { type BrandFont, type BrandImage, type BrandPalette, type BrandRecord, getDB } from './db';

export type { BrandFont, BrandImage, BrandPalette, BrandRecord };

const newId = createRandomIdGenerator();

export type BrandImageSection = 'logos' | 'photos' | 'graphics' | 'icons';
export const BRAND_IMAGE_SECTIONS: readonly BrandImageSection[] = ['logos', 'photos', 'graphics', 'icons'];
export const MAX_BRAND_IMAGES = 200;
export const MAX_PALETTE_COLORS = 24;

export function defaultBrand(name: string): Omit<BrandRecord, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: name.trim().slice(0, 100) || 'Brand kit',
    palettes: [{ id: newId('palette'), name: 'Brand colors', colors: ['#7c6cf8', '#111827', '#f8fafc'] }],
    fonts: {
      heading: { family: 'Inter', weight: 700, size: 64 },
      subheading: { family: 'Inter', weight: 600, size: 36 },
      body: { family: 'Inter', weight: 400, size: 22 },
    },
    logos: [],
    photos: [],
    graphics: [],
    icons: [],
    voice: { description: '', tone: [], dos: '', donts: '' },
    templateIds: [],
  };
}

export async function listBrands(): Promise<BrandRecord[]> {
  const all = await (await getDB()).getAll('brands');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getBrand(id: string): Promise<BrandRecord | undefined> {
  return (await getDB()).get('brands', id);
}

export async function createBrand(name: string): Promise<BrandRecord> {
  const now = Date.now();
  const brand: BrandRecord = { id: newId('brand'), ...defaultBrand(name), createdAt: now, updatedAt: now };
  await (await getDB()).put('brands', brand);
  return brand;
}

/** Applies a change to a brand kit in one transaction (read, modify, write). */
export async function updateBrand(
  id: string,
  change: (brand: BrandRecord) => BrandRecord,
): Promise<BrandRecord | null> {
  const db = await getDB();
  const tx = db.transaction('brands', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return null;
  }
  const next = sanitizeBrand({
    ...change(structuredClone(current)),
    id,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  });
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function deleteBrand(id: string): Promise<void> {
  await (await getDB()).delete('brands', id);
}

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/** Keeps stored kits within limits whatever the UI sends. */
export function sanitizeBrand(brand: BrandRecord): BrandRecord {
  const font = (f: BrandFont): BrandFont => ({
    family: String(f.family).slice(0, 128) || 'Inter',
    weight: Math.min(900, Math.max(100, Math.round(Number(f.weight) / 100) * 100 || 400)),
    size: Math.min(400, Math.max(6, Number(f.size) || 24)),
  });
  const images = (list: BrandImage[]) =>
    list.filter((i) => /^sha256-[0-9a-f]{64}$/.test(i.hash)).slice(0, MAX_BRAND_IMAGES);
  return {
    ...brand,
    name: brand.name.trim().slice(0, 100) || 'Brand kit',
    palettes: brand.palettes.slice(0, 20).map((p) => ({
      id: p.id,
      name: p.name.slice(0, 60),
      colors: [...new Set(p.colors.map((c) => c.toLowerCase()).filter((c) => HEX.test(c)))].slice(
        0,
        MAX_PALETTE_COLORS,
      ),
    })),
    fonts: {
      heading: font(brand.fonts.heading),
      subheading: font(brand.fonts.subheading),
      body: font(brand.fonts.body),
    },
    logos: images(brand.logos),
    photos: images(brand.photos),
    graphics: images(brand.graphics),
    icons: images(brand.icons),
    voice: {
      description: brand.voice.description.slice(0, 2000),
      tone: [...new Set(brand.voice.tone.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 12),
      dos: brand.voice.dos.slice(0, 2000),
      donts: brand.voice.donts.slice(0, 2000),
    },
    templateIds: [...new Set(brand.templateIds)].slice(0, 100),
  };
}

/** All colors of a kit, palette by palette. */
export function brandColors(brand: BrandRecord | null | undefined): string[] {
  return brand ? [...new Set(brand.palettes.flatMap((p) => p.colors))] : [];
}

const ACTIVE_KEY = 'opencanvas.activeBrand';

/** The kit the editor shows (remembered per browser). */
export function getActiveBrandId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveBrandId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // preference only
  }
}
