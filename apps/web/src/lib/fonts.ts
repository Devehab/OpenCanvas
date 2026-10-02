/**
 * Font catalog shown in the text inspector. Arabic-capable families are
 * flagged so the picker can filter them.
 */

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting';

export interface FontFamilyInfo {
  family: string;
  category: FontCategory;
  arabic: boolean;
  weights: number[];
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
];

/** Fallbacks appended to every font (must match the canvas measurer and the DOM text editor). */
export const FONT_FALLBACKS = ['Noto Sans Arabic', 'Inter', 'sans-serif'] as const;

export function fontInfo(family: string): FontFamilyInfo | undefined {
  return FONT_CATALOG.find((f) => f.family === family);
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
