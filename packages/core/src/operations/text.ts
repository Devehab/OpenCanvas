/**
 * Text operations and automatic text box sizing.
 */

import { TextContentSchema, TextStyleOverridesSchema } from '../model/schema';
import { applyStyleToAll, normalizeTextContent } from '../model/text-content';
import type { Id, NodeRecord, TextContent, TextNode, TextStyle } from '../model/types';
import { deepEqual } from '../store/equality';
import type { Transaction, TransactionFinalizer } from '../store/store';
import { layoutText, textGrowthAnchorX, textLayoutInput } from '../text/layout';
import type { TextMeasurer } from '../text/measurer';
import { positionForAnchoredResize } from './transform';

/** Replaces the content of a text node (validated + normalized). */
export function setTextContent(tx: Transaction, id: Id, content: TextContent): void {
  const node = tx.getNode(id);
  if (!node || node.type !== 'text') return;
  const parsed = TextContentSchema.parse(content) as TextContent;
  tx.update<TextNode>(id, { content: normalizeTextContent(parsed, node.style) });
}

/** Applies style properties to whole text nodes (clearing per-run overrides of those properties). */
export function setTextStyle(tx: Transaction, ids: readonly Id[], patch: Partial<TextStyle>): void {
  const safe = TextStyleOverridesSchema.parse(patch) as Partial<TextStyle>;
  for (const id of ids) {
    const node = tx.getNode(id);
    if (!node || node.type !== 'text') continue;
    const next = applyStyleToAll(node, safe);
    tx.update<TextNode>(id, { style: next.style, content: normalizeTextContent(next.content, next.style) });
  }
}

const LAYOUT_KEYS: (keyof TextNode)[] = [
  'content',
  'style',
  'sizing',
  'width',
  'height',
  'lineHeight',
  'paragraphSpacing',
  'direction',
  'autoFit',
  'align',
];

function layoutAffected(before: NodeRecord | undefined, after: TextNode): boolean {
  if (!before || before.type !== 'text') return true;
  for (const key of LAYOUT_KEYS) if (!deepEqual(before[key], after[key])) return true;
  return false;
}

/**
 * Keeps auto-sized text boxes (`auto-width`, `auto-height`) matching their
 * content. The box grows away from its alignment anchor, so left-aligned text
 * grows to the right, right-aligned (typical for Arabic) grows to the left.
 */
export function createTextAutosizeFinalizer(measurer: TextMeasurer): TransactionFinalizer {
  return (tx, touched) => {
    for (const id of touched) {
      const node = tx.getNode(id);
      if (!node || node.type !== 'text' || node.sizing === 'fixed') continue;
      if (!layoutAffected(tx.getOriginal<NodeRecord>(id), node)) continue;
      const layout = layoutText(textLayoutInput(node), measurer);
      const width = node.sizing === 'auto-width' ? layout.boxWidth : node.width;
      const height = layout.boxHeight;
      if (Math.abs(width - node.width) < 0.01 && Math.abs(height - node.height) < 0.01) continue;
      const pos = positionForAnchoredResize(node, width, height, { x: textGrowthAnchorX(node), y: 0 });
      tx.update<TextNode>(id, { ...pos, width, height });
    }
  };
}

/** Re-measures text boxes (e.g. after fonts finish loading) without creating history. */
export function remeasureText(tx: Transaction, ids: readonly Id[], measurer: TextMeasurer): void {
  for (const id of ids) {
    const node = tx.getNode(id);
    if (!node || node.type !== 'text' || node.sizing === 'fixed') continue;
    const layout = layoutText(textLayoutInput(node), measurer);
    const width = node.sizing === 'auto-width' ? layout.boxWidth : node.width;
    if (Math.abs(width - node.width) < 0.01 && Math.abs(layout.boxHeight - node.height) < 0.01) continue;
    const pos = positionForAnchoredResize(node, width, layout.boxHeight, {
      x: textGrowthAnchorX(node),
      y: 0,
    });
    tx.update<TextNode>(id, { ...pos, width, height: layout.boxHeight });
  }
}
