/**
 * Per-node outlines in local space — used by hit-testing, clipping and exporters.
 */
import type { FrameNode, ImageNode, NodeRecord, PathNode, ShapeNode } from '../model/types';
import { type PathCommand, parseSvgPath, transformPath } from './path';
import { getShapePath, rectPath } from './shapes';

const pathCache = new Map<string, PathCommand[]>();

/** Parses (and caches) SVG path data. Invalid data yields an empty path instead of throwing. */
export function getParsedPath(d: string): PathCommand[] {
  let cached = pathCache.get(d);
  if (!cached) {
    try {
      cached = parseSvgPath(d);
    } catch {
      cached = [];
    }
    if (pathCache.size > 2000) pathCache.clear();
    pathCache.set(d, cached);
  }
  return cached;
}

/** Path commands of a path node mapped from its viewBox into its box. */
export function getPathNodeCommands(
  node: Pick<PathNode, 'path' | 'viewBox' | 'width' | 'height'>,
): PathCommand[] {
  const vb = node.viewBox;
  const sx = node.width / vb.width;
  const sy = node.height / vb.height;
  return transformPath(getParsedPath(node.path), { a: sx, b: 0, c: 0, d: sy, e: -vb.x * sx, f: -vb.y * sy });
}

export function getShapeNodePath(
  node: Pick<ShapeNode, 'shape' | 'width' | 'height' | 'cornerRadius' | 'sides' | 'innerRatio'>,
) {
  return getShapePath(node.shape, node.width, node.height, {
    cornerRadius: node.cornerRadius,
    sides: node.sides,
    innerRatio: node.innerRatio,
  });
}

export function getFrameClipPath(
  node: Pick<FrameNode, 'shape' | 'width' | 'height' | 'cornerRadius'>,
): PathCommand[] {
  return getShapePath(node.shape, node.width, node.height, {
    cornerRadius: node.cornerRadius,
    // Frames have no shape parameters of their own: classic star, 12-bump badge.
    sides: node.shape === 'scallop' ? 12 : 5,
    innerRatio: 0.5,
  });
}

export function getImageClipPath(node: Pick<ImageNode, 'width' | 'height' | 'cornerRadius'>): PathCommand[] {
  return rectPath(0, 0, node.width, node.height, node.cornerRadius);
}

/** Outline used for hit-testing and selection hover, or null if the node is box-like. */
export function getNodeOutline(node: NodeRecord): PathCommand[] | null {
  switch (node.type) {
    case 'shape':
      return getShapeNodePath(node);
    case 'frame':
      return getFrameClipPath(node);
    case 'image':
      return node.cornerRadius > 0 ? getImageClipPath(node) : null;
    default:
      return null;
  }
}
