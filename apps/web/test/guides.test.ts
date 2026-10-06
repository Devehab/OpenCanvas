import { describe, expect, it } from 'vitest';
import { gridGuides, presetGrid, rulerStep } from '../src/lib/guides';

describe('layout guides', () => {
  it('3×3 grid: thirds of the page', () => {
    expect(gridGuides(presetGrid('3x3', 900), 900, 600)).toEqual([
      { axis: 'x', position: 300 },
      { axis: 'x', position: 600 },
      { axis: 'y', position: 200 },
      { axis: 'y', position: 400 },
    ]);
  });

  it('12 columns with gutter and margin: 24 column edges, no rows', () => {
    const guides = gridGuides(presetGrid('12-columns', 1080), 1080, 1080);
    const xs = guides.filter((g) => g.axis === 'x').map((g) => g.position);
    expect(xs).toHaveLength(24);
    expect(xs[0]).toBe(54); // 5% margin
    expect(xs.at(-1)).toBe(1026);
    expect(guides.filter((g) => g.axis === 'y').map((g) => g.position)).toEqual([54, 1026]); // margins
    // Columns are equally wide.
    const widths = xs.filter((_, i) => i % 2 === 0).map((x, i) => xs[i * 2 + 1]! - x);
    expect(new Set(widths.map((w) => Math.round(w))).size).toBe(1);
  });

  it('ignores impossible grids', () => {
    expect(gridGuides({ columns: 50, rows: 1, gutter: 100, margin: 0 }, 1000, 1000)).toEqual([]);
  });

  it('picks readable ruler steps', () => {
    expect(rulerStep(1)).toBe(100);
    expect(rulerStep(0.25)).toBe(500);
    expect(rulerStep(4)).toBe(20);
  });
});
