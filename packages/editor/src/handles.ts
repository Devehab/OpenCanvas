/**
 * Selection frame and transform handles, in SCREEN space.
 */
import {
  applyToPoint,
  type Box,
  type DocumentStore,
  getPageTransform,
  type Id,
  type NodeRecord,
  type ResizeHandle,
  type Vec,
} from '@opencanvas/core';
import { type Camera, pageToScreen } from './camera';

export type HandleKind = 'resize' | 'rotate' | 'endpoint';

export interface Handle {
  id: string;
  kind: HandleKind;
  resize?: ResizeHandle;
  endpoint?: 'start' | 'end';
  point: Vec;
  cursor: string;
}

export interface SelectionFrame {
  kind: 'single' | 'multi';
  nodeIds: Id[];
  /** Screen corners: top-left, top-right, bottom-right, bottom-left (in the node's local orientation). */
  corners: [Vec, Vec, Vec, Vec];
  handles: Handle[];
  locked: boolean;
  /** For lines: the two screen endpoints. */
  endpoints?: [Vec, Vec];
}

export const HANDLE_SIZE = 9;
export const ROTATE_OFFSET = 26;
export const HANDLE_HIT_RADIUS = 9;

const RESIZE_POS: Record<ResizeHandle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

function lerpQuad(c: [Vec, Vec, Vec, Vec], u: number, v: number): Vec {
  const top = { x: c[0].x + (c[1].x - c[0].x) * u, y: c[0].y + (c[1].y - c[0].y) * u };
  const bottom = { x: c[3].x + (c[2].x - c[3].x) * u, y: c[3].y + (c[2].y - c[3].y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

/** CSS resize cursor for a handle at screen position `p` relative to `center`. */
export function resizeCursor(center: Vec, p: Vec): string {
  let deg = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nwse-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/** Which resize handles a node type offers (Canva-like behaviour). */
export function resizeHandlesFor(node: NodeRecord | null): ResizeHandle[] {
  const corners: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
  if (!node) return corners; // multi-selection: uniform scale
  switch (node.type) {
    case 'group':
      return corners;
    case 'text':
      return node.sizing === 'fixed' ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : [...corners, 'e', 'w'];
    case 'line':
      return [];
    default:
      return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  }
}

export function computeSelectionFrame(
  store: DocumentStore,
  camera: Camera,
  selectedIds: readonly Id[],
  pageBounds: (ids: readonly Id[]) => Box | null,
): SelectionFrame | null {
  const nodes = selectedIds.map((id) => store.getNode(id)).filter((n): n is NodeRecord => !!n);
  if (nodes.length === 0) return null;
  const single = nodes.length === 1 ? nodes[0]! : null;
  const locked = nodes.some((n) => n.locked || store.getAncestors(n.id).some((a) => a.locked));
  let corners: [Vec, Vec, Vec, Vec];
  if (single) {
    const m = getPageTransform(store, single);
    const toScreen = (x: number, y: number) => pageToScreen(camera, applyToPoint(m, { x, y }));
    corners = [
      toScreen(0, 0),
      toScreen(single.width, 0),
      toScreen(single.width, single.height),
      toScreen(0, single.height),
    ];
    if (single.type === 'line') {
      const start = toScreen(0, single.height / 2);
      const end = toScreen(single.width, single.height / 2);
      return {
        kind: 'single',
        nodeIds: [single.id],
        corners,
        locked,
        endpoints: [start, end],
        handles: locked
          ? []
          : [
              { id: 'start', kind: 'endpoint', endpoint: 'start', point: start, cursor: 'crosshair' },
              { id: 'end', kind: 'endpoint', endpoint: 'end', point: end, cursor: 'crosshair' },
            ],
      };
    }
  } else {
    const b = pageBounds(selectedIds)!;
    corners = [
      pageToScreen(camera, { x: b.x, y: b.y }),
      pageToScreen(camera, { x: b.x + b.width, y: b.y }),
      pageToScreen(camera, { x: b.x + b.width, y: b.y + b.height }),
      pageToScreen(camera, { x: b.x, y: b.y + b.height }),
    ];
  }
  const handles: Handle[] = [];
  if (!locked) {
    const center = lerpQuad(corners, 0.5, 0.5);
    const widthPx = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const heightPx = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    for (const h of resizeHandlesFor(single)) {
      // Hide side handles on edges too short to grab comfortably.
      if ((h === 'n' || h === 's') && widthPx < HANDLE_SIZE * 4) continue;
      if ((h === 'e' || h === 'w') && heightPx < HANDLE_SIZE * 4) continue;
      const [u, v] = RESIZE_POS[h];
      const point = lerpQuad(corners, u, v);
      handles.push({ id: h, kind: 'resize', resize: h, point, cursor: resizeCursor(center, point) });
    }
    const bottom = lerpQuad(corners, 0.5, 1);
    const top = lerpQuad(corners, 0.5, 0);
    const len = Math.hypot(bottom.x - top.x, bottom.y - top.y) || 1;
    const dir = { x: (bottom.x - top.x) / len, y: (bottom.y - top.y) / len };
    handles.push({
      id: 'rotate',
      kind: 'rotate',
      point: { x: bottom.x + dir.x * ROTATE_OFFSET, y: bottom.y + dir.y * ROTATE_OFFSET },
      cursor: 'grab',
    });
  }
  return { kind: single ? 'single' : 'multi', nodeIds: nodes.map((n) => n.id), corners, handles, locked };
}

export function hitTestHandles(
  frame: SelectionFrame | null,
  p: Vec,
  radius = HANDLE_HIT_RADIUS,
): Handle | null {
  if (!frame) return null;
  let best: Handle | null = null;
  let bestDist = radius;
  for (const h of frame.handles) {
    const d = Math.hypot(h.point.x - p.x, h.point.y - p.y);
    if (d <= bestDist) {
      best = h;
      bestDist = d;
    }
  }
  return best;
}

/** True if a screen point lies inside the (possibly rotated) selection frame. */
export function pointInFrame(frame: SelectionFrame, p: Vec): boolean {
  const c = frame.corners;
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = c[i]!;
    const b = c[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
