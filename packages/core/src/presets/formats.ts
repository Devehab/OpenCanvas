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
  | 'whiteboard'
  | 'website'
  | 'email'
  | 'marketing'
  | 'custom';

/** Platforms for filtering social and video formats. */
export type FormatPlatform =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'pinterest'
  | 'tiktok'
  | 'x'
  | 'whatsapp'
  | 'youtube'
  | 'snapchat';

export interface DesignFormat {
  id: string;
  /** English display name (UI translates by id). */
  name: string;
  category: FormatCategory;
  width: number;
  height: number;
  /** Physical size, for print formats. */
  physical?: { width: number; height: number; unit: 'mm' | 'in' };
  platform?: FormatPlatform;
  /** Shown first ("Popular"). */
  popular?: boolean;
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
  // Social media
  { id: 'instagram-post', name: 'Instagram Post', category: 'social', platform: 'instagram', popular: true, width: 1080, height: 1080 },
  { id: 'instagram-portrait', name: 'Instagram Portrait', category: 'social', platform: 'instagram', popular: true, width: 1080, height: 1350 },
  { id: 'instagram-story', name: 'Instagram Story', category: 'social', platform: 'instagram', popular: true, width: 1080, height: 1920 },
  { id: 'facebook-post', name: 'Facebook Post', category: 'social', platform: 'facebook', popular: true, width: 1200, height: 630 },
  { id: 'facebook-story', name: 'Facebook Story', category: 'social', platform: 'facebook', width: 1080, height: 1920 },
  { id: 'facebook-cover', name: 'Facebook Cover', category: 'social', platform: 'facebook', width: 1640, height: 624 },
  { id: 'facebook-event-cover', name: 'Facebook Event Cover', category: 'social', platform: 'facebook', width: 1920, height: 1005 },
  { id: 'facebook-ad', name: 'Facebook Ad', category: 'social', platform: 'facebook', width: 1080, height: 1080 },
  { id: 'x-post', name: 'X (Twitter) Post', category: 'social', platform: 'x', popular: true, width: 1600, height: 900 },
  { id: 'x-header', name: 'X (Twitter) Header', category: 'social', platform: 'x', width: 1500, height: 500 },
  { id: 'linkedin-post', name: 'LinkedIn Post', category: 'social', platform: 'linkedin', popular: true, width: 1200, height: 1200 },
  { id: 'linkedin-banner', name: 'LinkedIn Banner', category: 'social', platform: 'linkedin', width: 1584, height: 396 },
  { id: 'linkedin-carousel', name: 'LinkedIn Carousel', category: 'social', platform: 'linkedin', width: 1080, height: 1350 },
  { id: 'pinterest-pin', name: 'Pinterest Pin', category: 'social', platform: 'pinterest', popular: true, width: 1000, height: 1500 },
  { id: 'pinterest-idea-pin', name: 'Pinterest Idea Pin', category: 'social', platform: 'pinterest', width: 1080, height: 1920 },
  { id: 'tiktok-photo', name: 'TikTok Photo Post', category: 'social', platform: 'tiktok', width: 1080, height: 1920 },
  { id: 'whatsapp-status', name: 'WhatsApp Status', category: 'social', platform: 'whatsapp', width: 1080, height: 1920 },
  { id: 'whatsapp-profile', name: 'WhatsApp Profile Picture', category: 'social', platform: 'whatsapp', width: 500, height: 500 },
  { id: 'snapchat-story', name: 'Snapchat Story', category: 'social', platform: 'snapchat', width: 1080, height: 1920 },
  { id: 'youtube-thumbnail', name: 'YouTube Thumbnail', category: 'social', platform: 'youtube', popular: true, width: 1280, height: 720 },
  { id: 'youtube-banner', name: 'YouTube Banner', category: 'social', platform: 'youtube', width: 2560, height: 1440 },
  // Video
  { id: 'video', name: 'Video', category: 'video', popular: true, width: 1920, height: 1080 },
  { id: 'youtube-video', name: 'YouTube Video', category: 'video', platform: 'youtube', width: 1920, height: 1080 },
  { id: 'youtube-short', name: 'YouTube Short', category: 'video', platform: 'youtube', width: 1080, height: 1920 },
  { id: 'tiktok-video', name: 'TikTok Video', category: 'video', platform: 'tiktok', popular: true, width: 1080, height: 1920 },
  { id: 'instagram-reel', name: 'Instagram Reel', category: 'video', platform: 'instagram', popular: true, width: 1080, height: 1920 },
  { id: 'facebook-video', name: 'Facebook Video', category: 'video', platform: 'facebook', width: 1080, height: 1080 },
  { id: 'mobile-video', name: 'Mobile Video', category: 'video', width: 1080, height: 1920 },
  // Presentations
  { id: 'presentation', name: 'Presentation (16:9)', category: 'presentation', popular: true, width: 1920, height: 1080 },
  { id: 'presentation-4-3', name: 'Presentation (4:3)', category: 'presentation', width: 1024, height: 768 },
  { id: 'presentation-mobile', name: 'Mobile-First Presentation', category: 'presentation', width: 1080, height: 1920 },
  { id: 'pitch-deck', name: 'Pitch Deck', category: 'presentation', width: 1920, height: 1080 },
  // Documents
  print('a4', 'A4 Document', 'document', 210, 297, 'mm'),
  print('a4-landscape', 'A4 Landscape', 'document', 297, 210, 'mm'),
  print('us-letter', 'US Letter', 'document', 8.5, 11, 'in'),
  print('resume', 'Resume', 'document', 210, 297, 'mm'),
  print('report', 'Report', 'document', 210, 297, 'mm'),
  print('letterhead', 'Letterhead', 'document', 210, 297, 'mm'),
  // Print
  print('poster', 'Poster (18×24 in)', 'print', 18, 24, 'in'),
  print('a3-poster', 'Poster (A3)', 'print', 297, 420, 'mm'),
  print('flyer', 'Flyer (A5)', 'print', 148, 210, 'mm'),
  print('flyer-letter', 'Flyer (Letter)', 'print', 8.5, 11, 'in'),
  print('brochure', 'Brochure', 'print', 297, 210, 'mm'),
  print('business-card', 'Business Card', 'print', 3.5, 2, 'in'),
  print('postcard', 'Postcard', 'print', 6, 4, 'in'),
  print('invitation', 'Invitation (5×7 in)', 'print', 5, 7, 'in'),
  print('card', 'Greeting Card', 'print', 5, 7, 'in'),
  print('certificate', 'Certificate', 'print', 297, 210, 'mm'),
  print('menu', 'Menu', 'print', 210, 297, 'mm'),
  print('sticker', 'Sticker', 'print', 3, 3, 'in'),
  print('bookmark', 'Bookmark', 'print', 2, 6, 'in'),
  print('label', 'Label', 'print', 4, 3, 'in'),
  // Whiteboards
  { id: 'whiteboard', name: 'Whiteboard', category: 'whiteboard', popular: true, width: 3840, height: 2160 },
  { id: 'brainstorm', name: 'Brainstorm', category: 'whiteboard', width: 3840, height: 2160 },
  { id: 'mind-map', name: 'Mind Map', category: 'whiteboard', width: 3000, height: 2000 },
  { id: 'flowchart', name: 'Flowchart', category: 'whiteboard', width: 3000, height: 2000 },
  // Websites
  { id: 'website', name: 'Website', category: 'website', popular: true, width: 1366, height: 768 },
  { id: 'landing-page', name: 'Landing Page', category: 'website', width: 1440, height: 3200 },
  { id: 'website-mobile', name: 'Mobile Website', category: 'website', width: 390, height: 844 },
  { id: 'blog-banner', name: 'Blog Banner', category: 'website', width: 2240, height: 1260 },
  // Emails
  { id: 'email-header', name: 'Email Header', category: 'email', width: 600, height: 200 },
  { id: 'newsletter', name: 'Email Newsletter', category: 'email', popular: true, width: 600, height: 1500 },
  { id: 'email-signature', name: 'Email Signature', category: 'email', width: 600, height: 150 },
  // Marketing
  { id: 'logo', name: 'Logo', category: 'marketing', popular: true, width: 500, height: 500 },
  { id: 'infographic', name: 'Infographic', category: 'marketing', width: 800, height: 2000 },
  { id: 'banner-ad', name: 'Banner Ad (728×90)', category: 'marketing', width: 728, height: 90 },
  { id: 'medium-rectangle', name: 'Ad (300×250)', category: 'marketing', width: 300, height: 250 },
  { id: 'zoom-background', name: 'Zoom Background', category: 'marketing', width: 1920, height: 1080 },
  { id: 'desktop-wallpaper', name: 'Desktop Wallpaper', category: 'marketing', width: 1920, height: 1080 },
  { id: 'phone-wallpaper', name: 'Phone Wallpaper', category: 'marketing', width: 1080, height: 1920 },
];

export function getDesignFormat(id: string | null | undefined): DesignFormat | undefined {
  return DESIGN_FORMATS.find((f) => f.id === id);
}
