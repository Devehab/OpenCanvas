/**
 * Font catalog shown in the text inspector. Arabic-capable families are
 * flagged so the picker can filter them.
 */

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'custom';

export interface FontFamilyInfo {
  family: string;
  category: FontCategory;
  arabic: boolean;
  weights: number[];
  /** Uploaded by the person (see custom-fonts.ts). */
  custom?: boolean;
}

export const FONT_CATALOG: readonly FontFamilyInfo[] = [
  { family: 'Inter', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Roboto', category: 'sans', arabic: false, weights: [300, 400, 500, 700] },
  { family: 'Montserrat', category: 'sans', arabic: false, weights: [400, 500, 600, 700, 800] },
  { family: 'Poppins', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700] },
  { family: 'Space Grotesk', category: 'sans', arabic: false, weights: [400, 500, 700] },
  { family: 'Oswald', category: 'display', arabic: false, weights: [400, 500, 700] },
  { family: 'Bebas Neue', category: 'display', arabic: false, weights: [400] },
  { family: 'Playfair Display', category: 'serif', arabic: false, weights: [400, 700, 900] },
  { family: 'Lora', category: 'serif', arabic: false, weights: [400, 700] },
  { family: 'Merriweather', category: 'serif', arabic: false, weights: [300, 400, 700] },
  { family: 'DM Serif Display', category: 'serif', arabic: false, weights: [400] },
  { family: 'Pacifico', category: 'handwriting', arabic: false, weights: [400] },
  { family: 'Dancing Script', category: 'handwriting', arabic: false, weights: [400, 700] },
  { family: 'Open Sans', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Lato', category: 'sans', arabic: false, weights: [100, 300, 400, 700, 900] },
  { family: 'Raleway', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Nunito', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Work Sans', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'DM Sans', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Manrope', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Outfit', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Plus Jakarta Sans', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Sora', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Archivo', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Anton', category: 'sans', arabic: false, weights: [400] },
  { family: 'Barlow', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Josefin Sans', category: 'sans', arabic: false, weights: [200, 300, 400, 500, 600, 700] },
  { family: 'Abril Fatface', category: 'display', arabic: false, weights: [400] },
  { family: 'Lobster', category: 'display', arabic: false, weights: [400] },
  { family: 'Caveat', category: 'handwriting', arabic: false, weights: [400, 500, 600, 700] },
  { family: 'Great Vibes', category: 'handwriting', arabic: false, weights: [400] },
  { family: 'Libre Baskerville', category: 'serif', arabic: false, weights: [400, 500, 600, 700] },
  { family: 'Cormorant Garamond', category: 'serif', arabic: false, weights: [300, 400, 500, 600, 700] },
  { family: 'EB Garamond', category: 'serif', arabic: false, weights: [400, 500, 600, 700, 800] },
  { family: 'Quicksand', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700] },
  { family: 'Righteous', category: 'display', arabic: false, weights: [400] },
  { family: 'Permanent Marker', category: 'handwriting', arabic: false, weights: [400] },
  { family: 'Satisfy', category: 'handwriting', arabic: false, weights: [400] },
  { family: 'Fira Sans', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Source Sans 3', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Kanit', category: 'sans', arabic: false, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Cairo', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Tajawal', category: 'sans', arabic: true, weights: [300, 400, 500, 700, 800] },
  { family: 'Almarai', category: 'sans', arabic: true, weights: [300, 400, 700, 800] },
  { family: 'IBM Plex Sans Arabic', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700] },
  { family: 'Noto Sans Arabic', category: 'sans', arabic: true, weights: [400, 500, 600, 700, 800] },
  { family: 'Noto Kufi Arabic', category: 'display', arabic: true, weights: [400, 700, 900] },
  { family: 'Readex Pro', category: 'sans', arabic: true, weights: [300, 400, 600, 700] },
  { family: 'Noto Naskh Arabic', category: 'serif', arabic: true, weights: [400, 700] },
  { family: 'Amiri', category: 'serif', arabic: true, weights: [400, 700] },
  { family: 'Markazi Text', category: 'serif', arabic: true, weights: [400, 700] },
  { family: 'Changa', category: 'display', arabic: true, weights: [400, 600, 800] },
  { family: 'El Messiri', category: 'display', arabic: true, weights: [400, 700] },
  { family: 'Reem Kufi', category: 'display', arabic: true, weights: [400, 700] },
  { family: 'Lalezar', category: 'display', arabic: true, weights: [400] },
  { family: 'Rubik', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Vazirmatn', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Alexandria', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Lemonada', category: 'display', arabic: true, weights: [300, 400, 500, 600, 700] },
  { family: 'Harmattan', category: 'sans', arabic: true, weights: [400, 500, 600, 700] },
  { family: 'Lateef', category: 'serif', arabic: true, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Scheherazade New', category: 'serif', arabic: true, weights: [400, 500, 600, 700] },
  { family: 'Mada', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Baloo Bhaijaan 2', category: 'display', arabic: true, weights: [400, 500, 600, 700, 800] },
  { family: 'Aref Ruqaa', category: 'serif', arabic: true, weights: [400, 700] },
  { family: 'Rakkas', category: 'display', arabic: true, weights: [400] },
  { family: 'Marhey', category: 'display', arabic: true, weights: [300, 400, 500, 600, 700] },
  { family: 'Kufam', category: 'sans', arabic: true, weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Zain', category: 'sans', arabic: true, weights: [200, 300, 400, 700, 800, 900] },
  { family: 'Beiruti', category: 'sans', arabic: true, weights: [300, 400, 500, 600, 700, 800] },
  {
    family: 'Playpen Sans Arabic',
    category: 'handwriting',
    arabic: true,
    weights: [300, 400, 500, 600, 700, 800],
  },
];

/** Fallbacks appended to every font (must match the canvas measurer and the DOM text editor). */
export const FONT_FALLBACKS = ['Noto Sans Arabic', 'Inter', 'sans-serif'] as const;

let customFamilies: readonly FontFamilyInfo[] = [];

/** Uploaded font families, kept up to date by custom-fonts.ts. */
export function setCustomFontFamilies(families: readonly FontFamilyInfo[]): void {
  customFamilies = families;
}

/** Uploaded families first, then the bundled catalog. */
export function allFonts(): readonly FontFamilyInfo[] {
  return customFamilies.length ? [...customFamilies, ...FONT_CATALOG] : FONT_CATALOG;
}

export function fontInfo(family: string): FontFamilyInfo | undefined {
  return customFamilies.find((f) => f.family === family) ?? FONT_CATALOG.find((f) => f.family === family);
}

/** Closest available weight for a family. */
export function nearestWeight(family: string, weight: number): number {
  const info = fontInfo(family);
  if (!info) return weight;
  return info.weights.reduce(
    (best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best),
    info.weights[0]!,
  );
}
