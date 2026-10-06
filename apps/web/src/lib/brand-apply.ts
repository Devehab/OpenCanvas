/** Using a brand kit in the editor: colors on the selection, brand text styles. */
import type { AnyNodeProps, Id } from '@opencanvas/core';
import type { Editor } from '@opencanvas/editor';
import type { BrandFont } from './storage/db';

/**
 * Applies a color to the selection the way people expect: shapes and frames
 * get it as fill, text as text color, lines as stroke, icons on their stroke
 * or fill. One undo step.
 */
export function applyBrandColor(editor: Editor, color: string): number {
  const nodes = editor.getSelectedNodes().filter((n) => editor.isEditable(n.id));
  if (!nodes.length) return 0;
  const byPatch = new Map<string, { ids: Id[]; patch: Record<string, unknown> }>();
  const add = (key: string, id: Id, patch: Record<string, unknown>) => {
    const entry = byPatch.get(key) ?? { ids: [], patch };
    entry.ids.push(id);
    byPatch.set(key, entry);
  };
  const textIds: Id[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'shape':
      case 'frame':
        add('fill', node.id, { fill: { type: 'solid', color } });
        break;
      case 'text':
        textIds.push(node.id);
        break;
      case 'line':
        add('stroke', node.id, { stroke: { ...node.stroke, color } });
        break;
      case 'path':
        if (node.fill) add('fill', node.id, { fill: { type: 'solid', color } });
        if (node.stroke) add(`stroke:${node.id}`, node.id, { stroke: { ...node.stroke, color } });
        break;
      default:
        break;
    }
  }
  editor.history.beginBatch('Apply brand color');
  try {
    for (const { ids, patch } of byPatch.values()) editor.execute('node.update', { ids, patch });
    if (textIds.length) editor.execute('text.set-style', { ids: textIds, style: { color } });
  } finally {
    editor.history.endBatch();
  }
  return nodes.length;
}

/** Text element props for a brand font role. */
export function brandTextProps(font: BrandFont, text: string, rtl: boolean): AnyNodeProps {
  return {
    type: 'text',
    sizing: 'auto-width',
    align: rtl ? 'right' : 'left',
    content: { paragraphs: [{ runs: [{ text, style: {} }], list: 'none', indent: 0 }] },
    style: { fontFamily: font.family, fontWeight: font.weight, fontSize: font.size, color: '#111827' },
  } as AnyNodeProps;
}
