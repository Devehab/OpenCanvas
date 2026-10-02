'use client';

import type { Id, NodeRecord } from '@opencanvas/core';
import {
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  Frame,
  Image,
  Lock,
  Minus,
  PenTool,
  Shapes,
  Type,
  Unlock,
} from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { nodeLabel } from '@/lib/node-label';
import { cn } from '@/lib/utils';

const TYPE_ICONS = {
  shape: Shapes,
  text: Type,
  image: Image,
  group: Folder,
  frame: Frame,
  line: Minus,
  path: PenTool,
} as const;

interface Row {
  node: NodeRecord;
  depth: number;
  hasChildren: boolean;
}

const DRAG_TYPE = 'application/x-opencanvas-layer';

export function LayersPanel() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const [collapsed, setCollapsed] = useState<Set<Id>>(new Set());
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: Id; position: 'above' | 'below' | 'inside' } | null>(
    null,
  );
  const pageId = useEditorValue((e) => e.pageId);
  const selected = useEditorValue((e) => e.selectedIds);
  // Rows: front-most first (reverse z-order), children nested under containers.
  const rows = useEditorValue(
    (e) => {
      const out: Row[] = [];
      const visit = (parentId: Id, depth: number) => {
        const children = e.store.getChildren(parentId);
        for (let i = children.length - 1; i >= 0; i--) {
          const node = children[i]!;
          const hasChildren =
            (node.type === 'group' || node.type === 'frame') && e.store.getChildIds(node.id).length > 0;
          out.push({ node, depth, hasChildren });
          if (hasChildren && !collapsed.has(node.id)) visit(node.id, depth + 1);
        }
      };
      visit(e.pageId, 0);
      return out;
    },
    [collapsed],
    (a, b) =>
      a.length === b.length &&
      a.every(
        (r, i) => r.node === b[i]!.node && r.depth === b[i]!.depth && r.hasChildren === b[i]!.hasChildren,
      ),
  );
  const typeLabel = (type: string) => t(`editor.nodeTypes.${type}`);

  const onDrop = (draggedId: Id) => {
    const target = dropTarget;
    setDropTarget(null);
    if (!target || target.id === draggedId) return;
    const targetNode = editor.store.getNode(target.id);
    if (!targetNode) return;
    const ids = selected.includes(draggedId) ? [...selected] : [draggedId];
    if (target.position === 'inside') {
      editor.execute('node.move-to', { ids, parentId: target.id, aboveId: null });
      return;
    }
    // Rows are front-to-back: "above" in the list means in front of the target.
    const siblings = editor.store.getChildIds(targetNode.parentId);
    const pos = siblings.indexOf(target.id);
    const aboveId = target.position === 'above' ? target.id : (siblings[pos - 1] ?? null);
    if (target.position === 'below' && aboveId === null) {
      // Bottom of the stack: insert behind everything.
      editor.execute('node.move-to', { ids, parentId: targetNode.parentId, aboveId: null });
      editor.execute('node.reorder', { ids, direction: 'back' });
      return;
    }
    editor.execute('node.move-to', { ids, parentId: targetNode.parentId, aboveId });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, index: number) => {
    const row = rows[index]!;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[index + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        editor.select([next.node.id]);
        document.getElementById(`layer-${next.node.id}`)?.focus();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      editor.select([row.node.id], { toggle: e.shiftKey });
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (!row.hasChildren) return;
      const rtl = document.documentElement.dir === 'rtl';
      const expand = (e.key === 'ArrowRight') !== rtl;
      setCollapsed((c) => {
        const n = new Set(c);
        if (expand) n.delete(row.node.id);
        else n.add(row.node.id);
        return n;
      });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      editor.deleteSelected();
    } else if (e.key === 'F2') {
      setRenaming(row.node.id);
    }
  };

  if (rows.length === 0)
    return <p className="p-4 pt-10 text-sm text-slate-500">{t('editor.layers.empty')}</p>;

  return (
    <div className="p-2 pt-9">
      <p className="px-2 pb-2 text-xs text-slate-500">{t('editor.layers.hint')}</p>
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA APG tree view pattern (ul/li with tree roles) */}
      <ul role="tree" aria-label={t('editor.layers.title')} data-testid="layers-tree" key={pageId}>
        {rows.map((row, index) => {
          const { node } = row;
          const Icon = TYPE_ICONS[node.type];
          const isSelected = selected.includes(node.id);
          const label = nodeLabel(node, typeLabel);
          const drop = dropTarget?.id === node.id ? dropTarget.position : null;
          return (
            <li
              key={node.id}
              id={`layer-${node.id}`}
              role="treeitem"
              aria-selected={isSelected}
              aria-level={row.depth + 1}
              aria-expanded={row.hasChildren ? !collapsed.has(node.id) : undefined}
              tabIndex={isSelected || (selected.length === 0 && index === 0) ? 0 : -1}
              data-testid="layer-row"
              draggable={!node.locked}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, node.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - rect.top) / rect.height;
                const container = node.type === 'group' || node.type === 'frame';
                const position = container && y > 0.3 && y < 0.7 ? 'inside' : y < 0.5 ? 'above' : 'below';
                setDropTarget({ id: node.id, position });
              }}
              onDragLeave={() => setDropTarget((d) => (d?.id === node.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(e.dataTransfer.getData(DRAG_TYPE));
              }}
              onClick={(e) => editor.select([node.id], { toggle: e.shiftKey || e.metaKey || e.ctrlKey })}
              onDoubleClick={() => setRenaming(node.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'group relative flex h-9 cursor-default items-center gap-1.5 rounded-md pe-1 text-sm text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-400',
                isSelected && 'bg-brand-50 text-brand-800 hover:bg-brand-100',
                !node.visible && 'text-slate-500 italic',
                drop === 'inside' && 'ring-2 ring-brand-400',
              )}
              style={{ paddingInlineStart: 8 + row.depth * 16 }}
            >
              {drop === 'above' ? (
                <span className="absolute inset-x-1 top-0 h-0.5 rounded bg-brand-500" />
              ) : null}
              {drop === 'below' ? (
                <span className="absolute inset-x-1 bottom-0 h-0.5 rounded bg-brand-500" />
              ) : null}
              {row.hasChildren ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(node.id)) n.delete(node.id);
                      else n.add(node.id);
                      return n;
                    });
                  }}
                  className="rounded p-0.5 text-slate-500 hover:text-slate-700"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 transition-transform rtl:rotate-180',
                      !collapsed.has(node.id) && 'rotate-90 rtl:rotate-90',
                    )}
                  />
                </button>
              ) : (
                <span className="w-[18px]" />
              )}
              <Icon className="size-4 shrink-0 text-slate-500" aria-hidden />
              {renaming === node.id ? (
                <input
                  // biome-ignore lint/a11y/noAutofocus: rename starts from an explicit user action
                  autoFocus
                  defaultValue={node.name || label}
                  aria-label={t('common.rename')}
                  className="h-7 min-w-0 flex-1 rounded border border-brand-400 px-1 text-sm outline-none"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onBlur={(e) => {
                    editor.execute(
                      'node.update',
                      { ids: [node.id], patch: { name: e.target.value.trim().slice(0, 256) } },
                      { label: t('common.rename') },
                    );
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {label}
                </span>
              )}
              <button
                type="button"
                tabIndex={-1}
                aria-label={node.locked ? t('editor.layers.unlock') : t('editor.layers.lock')}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.execute(
                    'node.update',
                    { ids: [node.id], patch: { locked: !node.locked } },
                    { label: node.locked ? t('editor.layers.unlock') : t('editor.layers.lock') },
                  );
                }}
                className={cn(
                  'rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800',
                  !node.locked && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {node.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={node.visible ? t('editor.layers.hide') : t('editor.layers.show')}
                data-testid="layer-visibility"
                onClick={(e) => {
                  e.stopPropagation();
                  editor.execute(
                    'node.update',
                    { ids: [node.id], patch: { visible: !node.visible } },
                    { label: node.visible ? t('editor.layers.hide') : t('editor.layers.show') },
                  );
                }}
                className={cn(
                  'rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800',
                  node.visible && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {node.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
