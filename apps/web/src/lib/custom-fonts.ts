/**
 * Makes uploaded fonts usable everywhere: each stored file becomes an
 * @font-face rule (pointing at an object URL), so the canvas, the text
 * editor, thumbnails and SVG export (which reads @font-face rules) see it
 * like any bundled font.
 */
import { onChannelMessage } from './channel';
import { type FontFamilyInfo, setCustomFontFamilies } from './fonts';
import { type CustomFontRecord, listCustomFonts } from './storage/fonts';
import { disabledPluginIds } from './storage/plugins';

export const CUSTOM_FONTS_EVENT = 'opencanvas:custom-fonts';

let styleElement: HTMLStyleElement | null = null;
const objectUrls = new Map<string, string>();
let families: FontFamilyInfo[] = [];
let syncing: Promise<void> | null = null;
let started = false;

const cssString = (value: string) => value.replace(/[\\"\n\r]/g, ' ');

function toFamilies(fonts: CustomFontRecord[]): FontFamilyInfo[] {
  const byFamily = new Map<string, Set<number>>();
  for (const f of fonts) {
    const weights = byFamily.get(f.family) ?? new Set<number>();
    weights.add(f.weight);
    byFamily.set(f.family, weights);
  }
  return [...byFamily.entries()].map(([family, weights]) => ({
    family,
    category: 'custom',
    // Unknown until measured; uploaded fonts are offered in every filter.
    arabic: true,
    custom: true,
    weights: [...weights].sort((a, b) => a - b),
  }));
}

async function sync(): Promise<void> {
  // Fonts of plugins that are turned off are not offered.
  const disabled = await disabledPluginIds();
  const fonts = (await listCustomFonts()).filter((f) => !f.pluginId || !disabled.has(f.pluginId));
  const keep = new Set(fonts.map((f) => f.id));
  for (const [id, url] of objectUrls)
    if (!keep.has(id)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(id);
    }
  const rules = fonts.map((f) => {
    let url = objectUrls.get(f.id);
    if (!url) {
      url = URL.createObjectURL(f.data);
      objectUrls.set(f.id, url);
    }
    return `@font-face{font-family:"${cssString(f.family)}";font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(${url}) format("${f.format}");}`;
  });
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.dataset.opencanvas = 'custom-fonts';
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = rules.join('\n');
  families = toFamilies(fonts);
  setCustomFontFamilies(families);
  window.dispatchEvent(new Event(CUSTOM_FONTS_EVENT));
}

/** Registers the stored fonts (again). Resolves when the rules are in place. */
export function syncCustomFonts(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  syncing = (syncing ?? Promise.resolve()).then(sync, sync).catch(() => undefined);
  return syncing;
}

/** Loads uploaded fonts once per page and follows changes from any tab. */
export function startCustomFonts(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!started) {
    started = true;
    onChannelMessage((m) => {
      if (m.type === 'fonts-changed' || m.type === 'plugins-changed') void syncCustomFonts();
    });
    return syncCustomFonts();
  }
  return syncing ?? Promise.resolve();
}

export function customFontFamilies(): readonly FontFamilyInfo[] {
  return families;
}
