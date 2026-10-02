import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectFontRequests, FontWatcher } from '../src/dom/fonts';
import { createTestEditor } from './helpers';

type Load = (font: string, text?: string) => Promise<unknown[]>;

/** Installs a fake CSS Font Loading API whose loads resolve on demand. */
function fakeFonts() {
  const calls: { font: string; resolve: () => void }[] = [];
  const load = vi.fn<Load>(
    (font) =>
      new Promise((resolve) => {
        calls.push({ font, resolve: () => resolve([]) });
      }),
  );
  vi.stubGlobal('document', { fonts: { load } });
  return { calls, load };
}

const text = (fontFamily: string, value: string, fontWeight = 400) => ({
  type: 'text' as const,
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  style: { fontFamily, fontWeight },
  content: { paragraphs: [{ runs: [{ text: value, style: {} }], list: 'none' as const, indent: 0 }] },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('font loading', () => {
  it('collects each used face once, with sample text for unicode-range subsets', () => {
    const { editor, add } = createTestEditor();
    add(text('Cairo', 'مرحبا', 700));
    add(text('Cairo', ' بالعالم', 700));
    add(text('Inter', 'Hello'));
    const requests = collectFontRequests(editor.store);
    expect(requests.map((r) => `${r.family}|${r.weight}|${r.style}`).sort()).toEqual([
      'Cairo|700|normal',
      'Inter|400|normal',
    ]);
    expect(requests.find((r) => r.family === 'Cairo')?.sample).toBe('مرحبا بالعالم');
  });

  it('keeps checking after a check that had nothing to load', async () => {
    const { calls } = fakeFonts();
    const { editor, add } = createTestEditor();
    const onLoaded = vi.fn();
    const watcher = new FontWatcher(editor.store, onLoaded);

    // A new design: no text yet, so the first check completes immediately.
    await watcher.check();
    expect(calls).toHaveLength(0);

    add(text('Bebas Neue', 'OUTLINE'));
    const pending = watcher.check();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.font).toContain('Bebas Neue');
    calls[0]!.resolve();
    await pending;
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('does not miss fonts added while a load is in flight', async () => {
    const { calls } = fakeFonts();
    const { editor, add } = createTestEditor();
    const onLoaded = vi.fn();
    const watcher = new FontWatcher(editor.store, onLoaded);

    add(text('Inter', 'Hello'));
    const first = watcher.check();
    await Promise.resolve();
    expect(calls.map((c) => c.font)).toEqual([expect.stringContaining('Inter')]);

    // A second font appears before the first finished loading.
    add(text('Amiri', 'سلام'));
    const second = watcher.check();
    calls[0]!.resolve();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.font).toContain('Amiri');
    calls[1]!.resolve();
    await Promise.all([first, second]);

    expect(onLoaded).toHaveBeenCalledTimes(2);
    // Everything is loaded now: another check does nothing.
    await watcher.check();
    expect(calls).toHaveLength(2);
    expect(onLoaded).toHaveBeenCalledTimes(2);
  });
});
