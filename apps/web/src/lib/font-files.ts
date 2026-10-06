/**
 * Font files people upload: format detection from the file's first bytes
 * (never trusting the extension) and a best guess of family, weight and
 * style from the file name ("Cairo-SemiBold.ttf" → Cairo, 600, normal).
 */

export type FontFormat = 'woff2' | 'woff' | 'truetype' | 'opentype';

/** Uploaded fonts larger than this are refused. */
export const MAX_FONT_BYTES = 15 * 1024 * 1024;

export const FONT_MIME: Record<FontFormat, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  truetype: 'font/ttf',
  opentype: 'font/otf',
};

export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';

/** The font format from the file signature, or null if it is not a font. */
export function sniffFontFormat(bytes: Uint8Array): FontFormat | null {
  if (bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'opentype';
  if (tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    return 'truetype';
  }
  return null;
}

/** Style words in font file names, longest first so "ExtraBold" wins over "Bold". */
const WEIGHT_WORDS: [string, number][] = [
  ['extralight', 200],
  ['ultralight', 200],
  ['extrabold', 800],
  ['ultrabold', 800],
  ['semibold', 600],
  ['demibold', 600],
  ['hairline', 100],
  ['regular', 400],
  ['normal', 400],
  ['medium', 500],
  ['light', 300],
  ['heavy', 900],
  ['black', 900],
  ['thin', 100],
  ['book', 400],
  ['bold', 700],
];

export interface FontNameGuess {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

const GLUED_STYLE =
  /^(.+?)(ExtraLight|UltraLight|ExtraBold|UltraBold|SemiBold|DemiBold|Hairline|Regular|Normal|Medium|Light|Heavy|Black|Thin|Book|Bold)?(Italic|Oblique)?$/;

/** Reads a style word such as "SemiBoldItalic" or "700"; null if it is not one. */
function readStyleWord(word: string): { weight?: number; italic: boolean } | null {
  let w = word.toLowerCase();
  const italic = /(italic|oblique)$/.test(w);
  if (italic) w = w.replace(/(italic|oblique)$/, '');
  if (w === '') return { italic };
  const named = WEIGHT_WORDS.find(([name]) => name === w);
  if (named) return { weight: named[1], italic };
  if (/^[1-9]00$/.test(w)) return { weight: Number(w), italic };
  return null;
}

export function guessFontInfo(fileName: string): FontNameGuess {
  const base = fileName.replace(/\.(ttf|otf|woff2?)$/i, '').trim();
  // "Cairo-Bold", "Cairo_Bold", "Cairo Bold", "Open Sans-SemiBoldItalic", "Cairo[wght]".
  const parts = base
    .replace(/\[[^\]]*\]/g, '')
    .split(/[-_\s]+/)
    .filter(Boolean);
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  const family: string[] = [];
  for (const [i, part] of parts.entries()) {
    const read = i > 0 ? readStyleWord(part) : null;
    if (!read) {
      family.push(part);
      continue;
    }
    if (read.weight) weight = read.weight;
    if (read.italic) style = 'italic';
  }
  // A style glued to the family ("CairoBold", "LatoBoldItalic").
  if (parts.length === 1) {
    const m = GLUED_STYLE.exec(parts[0]!);
    if (m && (m[2] || m[3])) {
      family.splice(0, family.length, m[1]!);
      const read = readStyleWord(`${m[2] ?? ''}${m[3] ?? ''}`);
      if (read?.weight) weight = read.weight;
      if (read?.italic) style = 'italic';
    }
  }
  const name = family.join(' ').trim() || base || 'Custom font';
  return { family: name.slice(0, 64), weight, style };
}
