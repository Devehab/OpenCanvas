/**
 * Smart guides: snaps moving or resizing boxes to page edges/center and to the
 * edges/centers of other elements, and reports the guide lines to draw.
 */

import { getPageBounds } from '../geometry/transforms';
import { type Box, boxCenter } from '../math/box';
import type { Id, PageRecord } from '../model/types';
import type { DocumentStore } from '../store/store';

export interface SnapTarget {
  value: number;
  /** Extent of the target along the other axis (for drawing the guide). */
  from: number;
  to: number;
  kind: 'page' | 'node' | 'guide';
}

export interface SnapTargets {
  x: SnapTarget[];
  y: SnapTarget[];
}

export interface SnapGuide {
  axis: 'x' | 'y';
  /** Position of the guide line (x for vertical guides, y for horizontal). */
  position: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** Collects snap targets on a page, excluding the moving nodes. */
export function collectSnapTargets(
  store: DocumentStore,
  page: PageRecord,
  exclude: ReadonlySet<Id>,
): SnapTargets {
  const targets: SnapTargets = { x: [], y: [] };
  const push = (b: Box, kind: SnapTarget['kind']) => {
    const c = boxCenter(b);
    for (const value of [b.x, c.x, b.x + b.width])
      targets.x.push({ value, from: b.y, to: b.y + b.height, kind });
    for (const value of [b.y, c.y, b.y + b.height])
      targets.y.push({ value, from: b.x, to: b.x + b.width, kind });
  };
  push({ x: 0, y: 0, width: page.width, height: page.height }, 'page');
  // Ruler guides span the whole page.
  for (const guide of page.guides ?? []) {
    if (guide.axis === 'x')
      targets.x.push({ value: guide.position, from: 0, to: page.height, kind: 'guide' });
    else targets.y.push({ value: guide.position, from: 0, to: page.width, kind: 'guide' });
  }
  for (const node of store.getChildren(page.id)) {
    if (!node.visible || exclude.has(node.id)) continue;
    push(getPageBounds(store, node), 'node');
  }
  return targets;
}

function bestOffset(
  values: readonly number[],
  targets: readonly SnapTarget[],
  threshold: number,
): number | null {
  let best: number | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t.value - v;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

function guidesFor(
  axis: 'x' | 'y',
  values: readonly number[],
  targets: readonly SnapTarget[],
  span: { from: number; to: number },
): SnapGuide[] {
  const out: SnapGuide[] = [];
  const seen = new Set<number>();
  for (const v of values) {
    for (const t of targets) {
      if (Math.abs(t.value - v) > 1e-6) continue;
      const key = Math.round(v * 1000);
      const from = Math.min(t.from, span.from);
      const to = Math.max(t.to, span.to);
      if (seen.has(key)) {
        const g = out.find((x) => Math.round(x.position * 1000) === key)!;
        g.from = Math.min(g.from, from);
        g.to = Math.max(g.to, to);
        continue;
      }
      seen.add(key);
      out.push({ axis, position: v, from, to });
    }
  }
  return out;
}

/**
 * Snaps a moving box (page space). `threshold` is in page units (screen px / zoom).
 * Returns the correction to apply and the guides that are now aligned.
 */
export function snapMovingBox(box: Box, targets: SnapTargets, threshold: number): SnapResult {
  const xs = [box.x, box.x + box.width / 2, box.x + box.width];
  const ys = [box.y, box.y + box.height / 2, box.y + box.height];
  const dx = bestOffset(xs, targets.x, threshold) ?? 0;
  const dy = bestOffset(ys, targets.y, threshold) ?? 0;
  const snapped = { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
  const guides = [
    ...(dx !== 0 || xs.some((v) => targets.x.some((t) => Math.abs(t.value - v) < 1e-6))
      ? guidesFor('x', [snapped.x, snapped.x + snapped.width / 2, snapped.x + snapped.width], targets.x, {
          from: snapped.y,
          to: snapped.y + snapped.height,
        })
      : []),
    ...(dy !== 0 || ys.some((v) => targets.y.some((t) => Math.abs(t.value - v) < 1e-6))
      ? guidesFor('y', [snapped.y, snapped.y + snapped.height / 2, snapped.y + snapped.height], targets.y, {
          from: snapped.x,
          to: snapped.x + snapped.width,
        })
      : []),
  ];
  return { dx, dy, guides };
}

/** Snaps individual values (e.g. the moving edges during a resize). */
export function snapValues(
  values: { x?: number[]; y?: number[] },
  targets: SnapTargets,
  threshold: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const dx = values.x ? (bestOffset(values.x, targets.x, threshold) ?? 0) : 0;
  const dy = values.y ? (bestOffset(values.y, targets.y, threshold) ?? 0) : 0;
  const guides: SnapGuide[] = [];
  if (values.x) {
    guides.push(
      ...guidesFor(
        'x',
        values.x.map((v) => v + dx),
        targets.x,
        { from: Number.POSITIVE_INFINITY, to: Number.NEGATIVE_INFINITY },
      ),
    );
  }
  if (values.y) {
    guides.push(
      ...guidesFor(
        'y',
        values.y.map((v) => v + dy),
        targets.y,
        { from: Number.POSITIVE_INFINITY, to: Number.NEGATIVE_INFINITY },
      ),
    );
  }
  return { dx, dy, guides };
}
