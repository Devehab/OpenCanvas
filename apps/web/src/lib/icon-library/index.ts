/**
 * The icon library: ~2,900 open-source icons (Lucide outline, ISC; Tabler
 * filled, MIT) as single SVG paths, inserted as editable vector elements.
 * The data is code-split and loaded on first use.
 */
import type { AnyNodeProps } from '@opencanvas/core';
import { englishFor, hasArabic, normalizeArabic } from './arabic';

export const ICON_CATEGORIES = [
  'shapes',
  'arrows',
  'people',
  'communication',
  'business',
  'charts',
  'media',
  'design',
  'files',
  'devices',
  'nature',
  'food',
  'travel',
  'health',
  'sports',
  'time',
  'security',
  'symbols',
  'brands',
  'interface',
] as const;
export type IconCategory = (typeof ICON_CATEGORIES)[number];

export interface LibraryIcon {
  /** Unique across sets: `lucide/heart`, `tabler/heart`. */
  id: string;
  name: string;
  path: string;
  keywords: string;
  category: IconCategory;
  style: 'outline' | 'filled';
}

interface IconSetFile {
  name: string;
  license: string;
  url: string;
  style: 'outline' | 'filled';
  icons: [name: string, path: string, keywords: string, category: string][];
}

/** Hand-picked icons shown first (most used in social posts and presentations). */
export const POPULAR_ICONS = [
  'lucide/heart',
  'tabler/heart',
  'lucide/star',
  'tabler/star',
  'lucide/check',
  'lucide/circle-check',
  'tabler/circle-check',
  'lucide/x',
  'lucide/sparkles',
  'tabler/sparkles',
  'lucide/zap',
  'tabler/bolt',
  'lucide/flame',
  'lucide/sun',
  'lucide/moon',
  'tabler/moon',
  'lucide/cloud',
  'lucide/leaf',
  'lucide/flower',
  'lucide/map-pin',
  'tabler/map-pin',
  'lucide/phone',
  'tabler/phone',
  'lucide/mail',
  'tabler/mail',
  'lucide/message-circle',
  'tabler/message-circle',
  'lucide/send',
  'lucide/thumbs-up',
  'tabler/thumb-up',
  'tabler/mood-smile',
  'lucide/gift',
  'tabler/gift',
  'lucide/party-popper',
  'lucide/trophy',
  'tabler/trophy',
  'lucide/crown',
  'tabler/crown',
  'lucide/award',
  'lucide/shopping-bag',
  'tabler/shopping-cart',
  'lucide/tag',
  'lucide/lightbulb',
  'tabler/bulb',
  'lucide/rocket',
  'lucide/target',
  'lucide/chart-bar',
  'tabler/chart-pie',
  'lucide/calendar',
  'tabler/calendar',
  'lucide/clock',
  'lucide/camera',
  'tabler/camera',
  'lucide/music',
  'lucide/play',
  'tabler/player-play',
  'lucide/house',
  'tabler/home',
  'lucide/user',
  'tabler/user',
  'lucide/users',
  'lucide/globe',
  'lucide/plane',
  'tabler/plane',
  'lucide/coffee',
  'lucide/graduation-cap',
  'lucide/book-open',
  'lucide/quote',
  'tabler/quote',
  'lucide/arrow-right',
  'tabler/arrow-big-right',
  'lucide/megaphone',
  'lucide/bell',
  'tabler/bell',
  'tabler/brand-instagram',
  'tabler/brand-facebook',
  'tabler/brand-whatsapp',
  'tabler/brand-youtube',
  'tabler/brand-tiktok',
  'tabler/brand-linkedin',
  'tabler/brand-x',
];

let library: Promise<LibraryIcon[]> | null = null;

/** Loads both icon sets (once). */
export function loadIconLibrary(): Promise<LibraryIcon[]> {
  library ??= Promise.all([import('./lucide.json'), import('./tabler-filled.json')])
    .then((sets) =>
      sets.flatMap((module) => {
        const set = (module.default ?? module) as unknown as IconSetFile;
        const prefix = set.style === 'filled' ? 'tabler' : 'lucide';
        return set.icons.map(([name, path, keywords, category]) => ({
          id: `${prefix}/${name}`,
          name,
          path,
          keywords: ` ${keywords} `,
          category: (ICON_CATEGORIES as readonly string[]).includes(category)
            ? (category as IconCategory)
            : 'interface',
          style: set.style,
        }));
      }),
    )
    .catch((error) => {
      library = null; // retry on next use
      throw error;
    });
  return library;
}

/**
 * Searches icons by English or Arabic words. Every word of the query must
 * match (an English word as a keyword prefix; an Arabic word through the
 * dictionary). Exact name matches rank first.
 */
export function searchIcons(
  icons: readonly LibraryIcon[],
  query: string,
  options: { category?: IconCategory | null; style?: 'outline' | 'filled' | null } = {},
): LibraryIcon[] {
  const pool = icons.filter(
    (i) =>
      (!options.category || i.category === options.category) && (!options.style || i.style === options.style),
  );
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return pool;
  const matchers = terms.map((term) => {
    if (hasArabic(term)) {
      const english = englishFor(normalizeArabic(term));
      return (i: LibraryIcon) => english.some((w) => i.keywords.includes(` ${w}`));
    }
    return (i: LibraryIcon) => i.keywords.includes(` ${term}`);
  });
  const hits = pool.filter((i) => matchers.every((m) => m(i)));
  const first = terms[0]!;
  const rank = (i: LibraryIcon) => (i.name === first ? 0 : i.name.startsWith(first) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b));
}

/** Node props for inserting an icon: stroked outline or filled shape. */
export function iconProps(
  icon: Pick<LibraryIcon, 'name' | 'path' | 'style'>,
  color = '#111827',
): AnyNodeProps {
  return {
    type: 'path',
    name: icon.name.replace(/-/g, ' '),
    width: 160,
    height: 160,
    path: icon.path,
    viewBox: { x: 0, y: 0, width: 24, height: 24 },
    fill: icon.style === 'filled' ? { type: 'solid', color } : null,
    stroke:
      icon.style === 'outline' ? { color, width: 2, style: 'solid', cap: 'round', join: 'round' } : null,
    semantic: { role: 'icon', description: icon.name, slot: null },
  } as AnyNodeProps;
}
