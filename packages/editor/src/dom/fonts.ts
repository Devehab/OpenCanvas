/**
 * Web font loading. Canvas text only uses a font after it has loaded, so the
 * view waits for the fonts a document uses, then re-measures text.
 */
import { cssFont, type DocumentStore, type TextNode } from '@opencanvas/core';

export interface FontRequest {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  sample: string;
}

/** Collects every font face (family/weight/style) used by text in the document. */
export function collectFontRequests(store: DocumentStore): FontRequest[] {
  const map = new Map<string, FontRequest>();
  const add = (family: string, weight: number, style: 'normal' | 'italic', text: string) => {
    const key = `${family}|${weight}|${style}`;
    const existing = map.get(key);
    if (existing) {
      if (existing.sample.length < 200) existing.sample += text.slice(0, 200);
    } else {
      map.set(key, { family, weight, style, sample: text.slice(0, 200) });
    }
  };
  for (const node of store.getNodes()) {
    if (node.type !== 'text') continue;
    const t = node as TextNode;
    for (const p of t.content.paragraphs) {
      for (const r of p.runs) {
        const s = { ...t.style, ...r.style };
        add(s.fontFamily, s.fontWeight, s.fontStyle, r.text);
      }
    }
  }
  return [...map.values()];
}

/**
 * Loads the requested faces via the CSS Font Loading API. `sample` text makes
 * the browser fetch the right unicode-range subsets (e.g. Arabic).
 */
export async function loadFonts(requests: readonly FontRequest[], timeoutMs = 8000): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const pending = requests.map((r) =>
    document.fonts
      .load(cssFont({ family: r.family, size: 16, weight: r.weight, style: r.style }), r.sample || 'Aa ءا')
      .catch(() => []),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const result = await Promise.race([Promise.all(pending).then(() => 'ok' as const), timeout]);
  clearTimeout(timer);
  return result === 'ok';
}

/**
 * Watches the document for fonts that are not loaded yet and calls
 * `onLoaded` whenever new faces finish loading.
 */
export class FontWatcher {
  private readonly loaded = new Set<string>();
  private running = false;

  constructor(
    private readonly store: DocumentStore,
    private readonly onLoaded: () => void,
  ) {}

  async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const missing = collectFontRequests(this.store).filter(
        (r) => !this.loaded.has(`${r.family}|${r.weight}|${r.style}`),
      );
      if (missing.length === 0) return;
      await loadFonts(missing);
      for (const r of missing) this.loaded.add(`${r.family}|${r.weight}|${r.style}`);
      this.onLoaded();
    } finally {
      this.running = false;
    }
  }
}
