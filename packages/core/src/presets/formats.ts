/**
 * Design format presets ("What do you want to create?").
 *
 * Sizes are CSS pixels at 96 DPI. Print formats are defined in millimetres or
 * inches and converted, so a 300 DPI export of an A4 page is exactly 2480×3508.
 */

export type FormatCategory =
  | 'social'
  | 'presentation'
  | 'video'
  | 'print'
  | 'document'
  | 'marketing'
  | 'custom';

export interface DesignFormat {
  id: string;
  /** English display name (UI translates by id). */
  name: string;
  category: FormatCategory;
  width: number;
  height: number;
  /** Physical size, for print formats. */
  physical?: { width: number; height: number; unit: 'mm' | 'in' };
}

const MM_PER_INCH = 25.4;
export const CSS_DPI = 96;

export const mmToPx = (mm: number): number => Math.round((mm / MM_PER_INCH) * CSS_DPI);
export const inToPx = (inches: number): number => Math.round(inches * CSS_DPI);
export const pxToMm = (px: number): number => (px / CSS_DPI) * MM_PER_INCH;

const print = (
  id: string,
  name: string,
  category: FormatCategory,
  w: number,
  h: number,
  unit: 'mm' | 'in',
): DesignFormat => ({
  id,
  name,
  category,
  width: unit === 'mm' ? mmToPx(w) : inToPx(w),
  height: unit === 'mm' ? mmToPx(h) : inToPx(h),
  physical: { width: w, height: h, unit },
});

export const DESIGN_FORMATS: readonly DesignFormat[] = [
  { id: 'instagram-post', name: 'Instagram Post', category: 'social', width: 1080, height: 1080 },
  { id: 'instagram-portrait', name: 'Instagram Portrait', category: 'social', width: 1080, height: 1350 },
  { id: 'instagram-story', name: 'Instagram Story', category: 'social', width: 1080, height: 1920 },
  { id: 'facebook-post', name: 'Facebook Post', category: 'social', width: 1200, height: 630 },
  { id: 'facebook-cover', name: 'Facebook Cover', category: 'social', width: 1640, height: 624 },
  { id: 'x-post', name: 'X (Twitter) Post', category: 'social', width: 1600, height: 900 },
  { id: 'linkedin-post', name: 'LinkedIn Post', category: 'social', width: 1200, height: 1200 },
  { id: 'youtube-thumbnail', name: 'YouTube Thumbnail', category: 'video', width: 1280, height: 720 },
  { id: 'youtube-banner', name: 'YouTube Banner', category: 'video', width: 2560, height: 1440 },
  { id: 'presentation', name: 'Presentation (16:9)', category: 'presentation', width: 1920, height: 1080 },
  { id: 'presentation-4-3', name: 'Presentation (4:3)', category: 'presentation', width: 1024, height: 768 },
  print('a4', 'A4 Document', 'document', 210, 297, 'mm'),
  print('a4-landscape', 'A4 Landscape', 'document', 297, 210, 'mm'),
  print('us-letter', 'US Letter', 'document', 8.5, 11, 'in'),
  print('resume', 'Resume', 'document', 210, 297, 'mm'),
  print('poster', 'Poster (18×24 in)', 'print', 18, 24, 'in'),
  print('flyer', 'Flyer (A5)', 'print', 148, 210, 'mm'),
  print('business-card', 'Business Card', 'print', 3.5, 2, 'in'),
  print('invitation', 'Invitation (5×7 in)', 'print', 5, 7, 'in'),
  print('certificate', 'Certificate', 'print', 297, 210, 'mm'),
  { id: 'logo', name: 'Logo', category: 'marketing', width: 500, height: 500 },
  { id: 'infographic', name: 'Infographic', category: 'marketing', width: 800, height: 2000 },
  { id: 'desktop-wallpaper', name: 'Desktop Wallpaper', category: 'marketing', width: 1920, height: 1080 },
  { id: 'phone-wallpaper', name: 'Phone Wallpaper', category: 'marketing', width: 1080, height: 1920 },
];

export function getDesignFormat(id: string | null | undefined): DesignFormat | undefined {
  return DESIGN_FORMATS.find((f) => f.id === id);
}
