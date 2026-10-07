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
 * Resolves once canvas text really uses the faces: their width differs from
 * a fallback's. Firefox can go on drawing and measuring canvas text with the
 * fallback for a while after document.fonts.load() resolved, and text
 * measured then keeps the fallback's line breaks. Gives up after
 * `timeoutMs` (a font that failed to load, or one metrically identical to
 * the fallback).
 */
export async function waitForCanvasFonts(requests: readonly FontRequest[], timeoutMs = 4000): Promise<void> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const deadline = Date.now() + timeoutMs;
  let pending = [...requests];
  while (pending.length > 0) {
    // A fresh context each time: contexts keep the face they resolved for a font string.
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    pending = pending.filter((r) => {
      const sample = `${r.sample}Aa`;
      const font = (family: string) => `${r.style === 'italic' ? 'italic ' : ''}${r.weight} 48px ${family}`;
      ctx.font = font(`"${r.family.replace(/["\\]/g, '')}", monospace`);
      const withFace = ctx.measureText(sample).width;
      ctx.font = font('monospace');
      return Math.abs(withFace - ctx.measureText(sample).width) < 0.01;
    });
    if (pending.length === 0 || Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Watches the document for fonts that are not loaded yet and calls
 * `onLoaded` whenever new faces finish loading.
 */
export class FontWatcher {
  private readonly loaded = new Set<string>();
  private running: Promise<void> | null = null;
  private rerun = false;

  constructor(
    private readonly store: DocumentStore,
    private readonly onLoaded: () => void,
  ) {}

  /** Forgets what was loaded, so the next check loads (and re-measures) again. */
  forget(): void {
    this.loaded.clear();
  }

  /**
   * Loads fonts the document uses that are not loaded yet. A check requested
   * while one is running runs again afterwards, so fonts added in the
   * meantime are never missed. Resolves when all requested checks finished.
   */
  check(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    const run = async () => {
      do {
        this.rerun = false;
        const missing = collectFontRequests(this.store).filter(
          (r) => !this.loaded.has(`${r.family}|${r.weight}|${r.style}`),
        );
        if (missing.length === 0) continue;
        await loadFonts(missing);
        await waitForCanvasFonts(missing);
        for (const r of missing) this.loaded.add(`${r.family}|${r.weight}|${r.style}`);
        this.onLoaded();
      } while (this.rerun);
    };
    // `finally` always runs asynchronously, after `running` is assigned below
    // (a run with nothing to load completes synchronously).
    const promise = run().finally(() => {
      if (this.running === promise) this.running = null;
    });
    this.running = promise;
    return promise;
  }
}
