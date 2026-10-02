/**
 * Visual bounds: the area a node may paint, including strokes, arrowheads,
 * text overhang and effects — used for culling and offscreen layer sizing.
 */
import {
  applyToPoint,
  type Box,
  boxExpand,
  boxFromPoints,
  boxUnion,
  type DocumentStore,
  getLocalTransform,
  type NodeRecord,
} from '@opencanvas/core';

export function arrowSize(strokeWidth: number): number {
  return Math.max(strokeWidth * 3, 8);
}

/** Bounds in the node's LOCAL space, excluding layer blur and shadow. */
export function visualLocalBounds(store: DocumentStore, node: NodeRecord): Box {
  const box: Box = { x: 0, y: 0, width: node.width, height: node.height };
  switch (node.type) {
    case 'shape':
    case 'image':
      return node.stroke ? boxExpand(box, node.stroke.width / 2 + 1) : box;
    case 'frame': {
      if (node.clipContent || store.getChildIds(node.id).length === 0) {
        return node.stroke ? boxExpand(box, node.stroke.width / 2 + 1) : box;
      }
      return boxUnion([box, childrenVisualBounds(store, node.id) ?? box])!;
    }
    case 'path': {
      const sx = node.width / node.viewBox.width;
      const sy = node.height / node.viewBox.height;
      const sw = node.stroke ? (node.stroke.width * Math.max(sx, sy)) / 2 : 0;
      return boxExpand(box, sw + 1);
    }
    case 'line': {
      const half = Math.max(
        node.stroke.width / 2,
        node.startArrow !== 'none' || node.endArrow !== 'none' ? arrowSize(node.stroke.width) * 0.7 : 0,
      );
      return { x: -half, y: node.height / 2 - half - 1, width: node.width + half * 2, height: half * 2 + 2 };
    }
    case 'text': {
      let size = node.style.fontSize;
      for (const p of node.content.paragraphs)
        for (const r of p.runs) size = Math.max(size, r.style.fontSize ?? 0);
      let extra = size * 0.5;
      const e = node.effect;
      if (e?.type === 'outline') extra += e.width;
      if (e?.type === 'background') extra += e.padding;
      if (e?.type === 'neon') extra += size * 0.6;
      if (e?.type === 'echo') extra += Math.max(Math.abs(e.offsetX), Math.abs(e.offsetY));
      return boxExpand(box, extra);
    }
    case 'group':
      return childrenVisualBounds(store, node.id) ?? box;
  }
}

/** Union of children's visual bounds in the container's local space. */
export function childrenVisualBounds(store: DocumentStore, containerId: string): Box | null {
  const boxes: Box[] = [];
  for (const child of store.getChildren(containerId)) {
    if (!child.visible) continue;
    boxes.push(visualBoundsInParent(store, child));
  }
  return boxUnion(boxes);
}

/** Visual bounds of a node (incl. blur and shadow) in its parent's space. */
export function visualBoundsInParent(store: DocumentStore, node: NodeRecord): Box {
  let local = visualLocalBounds(store, node);
  if (node.blur > 0) local = boxExpand(local, node.blur * 3);
  const m = getLocalTransform(node);
  let b = boxFromPoints(
    [
      { x: local.x, y: local.y },
      { x: local.x + local.width, y: local.y },
      { x: local.x + local.width, y: local.y + local.height },
      { x: local.x, y: local.y + local.height },
    ].map((p) => applyToPoint(m, p)),
  );
  if (node.shadow) {
    const s = node.shadow;
    const reach = s.blur * 1.5 + Math.max(Math.abs(s.offsetX), Math.abs(s.offsetY));
    b = boxExpand(b, reach);
  }
  return b;
}
