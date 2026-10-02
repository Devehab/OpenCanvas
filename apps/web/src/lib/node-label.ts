import type { NodeRecord } from '@opencanvas/core';
import { textContentToString } from '@opencanvas/core';

/** Human-readable layer name: explicit name, text content, or the type. */
export function nodeLabel(node: NodeRecord, typeLabel: (type: string) => string): string {
  if (node.name) return node.name;
  if (node.type === 'text') {
    const text = textContentToString(node.content).replace(/\s+/g, ' ').trim();
    if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }
  if (node.semantic?.description) return node.semantic.description.slice(0, 40);
  return typeLabel(node.type);
}
