// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { svgToIcon } from '@/lib/svg-icon';

// DOMPurify does not run under happy-dom; sanitizing is covered by the browser tests.
vi.mock('@/lib/upload', () => ({
  sanitizeSvg: (svg: string) => (svg.includes('<svg') ? svg.replace(/<script[\s\S]*?<\/script>/g, '') : null),
}));

describe('svgToIcon', () => {
  it('keeps outline icons stroked, with their view box', () => {
    const result = svgToIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><circle cx="12" cy="12" r="10"/></svg>',
      'plus-circle',
      ['add'],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.icon).toMatchObject({
      name: 'plus circle',
      style: 'outline',
      strokeWidth: 1.5,
      viewBox: { x: 0, y: 0, width: 24, height: 24 },
    });
    expect(result.icon.path).toMatch(/^M5 12h14 M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z$/);
    expect(result.icon.keywords).toEqual(['plus', 'circle', 'add']);
  });

  it('converts filled shapes and uses width/height without a view box', () => {
    const result = svgToIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="1" y="1" width="8" height="4" rx="1"/><polygon points="0,10 5,6 10,10"/></svg>',
      'house',
    );
    expect(result.ok && result.icon.style).toBe('filled');
    expect(result.ok && result.icon.viewBox).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(result.ok && result.icon.path).toContain('L5 6L10 10Z');
  });

  it('removes scripts and refuses SVGs with nothing to draw', () => {
    expect(
      svgToIcon(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>hi</text></svg>',
        'x',
      ),
    ).toEqual({ ok: false, reason: 'empty' });
    expect(svgToIcon('not svg at all', 'x').ok).toBe(false);
  });
});
