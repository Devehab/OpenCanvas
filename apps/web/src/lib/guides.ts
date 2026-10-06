/**
 * Layout guides: column/row grids generated from a few numbers (Canva's
 * "Add guides" presets: 12 columns, 3 columns, 3×3 grid, custom).
 */
import type { PageGuide } from '@opencanvas/core';

export interface GuideGrid {
  columns: number;
  rows: number;
  /** Space between columns/rows, in page units. */
  gutter: number;
  /** Space around the grid, in page units. */
  margin: number;
}

export type GuidePreset = '12-columns' | '3-columns' | '3x3' | 'custom';

export function presetGrid(preset: Exclude<GuidePreset, 'custom'>, width: number): GuideGrid {
  const gutter = Math.round(width * 0.02);
  const margin = Math.round(width * 0.05);
  switch (preset) {
    case '12-columns':
      return { columns: 12, rows: 1, gutter, margin };
    case '3-columns':
      return { columns: 3, rows: 1, gutter, margin };
    case '3x3':
      return { columns: 3, rows: 3, gutter: 0, margin: 0 };
  }
}

/** Guide positions along one axis for `count` cells. */
function axisGuides(count: number, gutter: number, margin: number, size: number): number[] {
  const n = Math.max(1, Math.round(count));
  const g = Math.max(0, gutter);
  const m = Math.max(0, Math.min(margin, size / 2));
  const cell = (size - 2 * m - (n - 1) * g) / n;
  if (cell <= 0) return [];
  const out = new Set<number>();
  for (let i = 0; i < n; i++) {
    const start = m + i * (cell + g);
    const end = start + cell;
    // Page edges need no guide.
    if (start > 0.001) out.add(Math.round(start * 100) / 100);
    if (end < size - 0.001) out.add(Math.round(end * 100) / 100);
  }
  return [...out].sort((a, b) => a - b);
}

export function gridGuides(grid: GuideGrid, width: number, height: number): PageGuide[] {
  const columns =
    grid.columns > 1 || grid.margin > 0 ? axisGuides(grid.columns, grid.gutter, grid.margin, width) : [];
  const rows =
    grid.rows > 1 || grid.margin > 0 ? axisGuides(grid.rows, grid.gutter, grid.margin, height) : [];
  return [
    ...columns.map((position) => ({ axis: 'x' as const, position })),
    ...rows.map((position) => ({ axis: 'y' as const, position })),
  ];
}

/** Ruler tick spacing (page units) so labels are at least `minPx` apart on screen. */
export function rulerStep(zoom: number, minPx = 64): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  return steps.find((s) => s * zoom >= minPx) ?? steps[steps.length - 1]!;
}
