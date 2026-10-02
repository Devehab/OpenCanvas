'use client';

import { type AnyNodeProps, getShapePath, pathToSvg, type ShapeKind } from '@opencanvas/core';
import { framePreset, LINE_PRESETS, SHAPE_PRESETS, shapeProps } from '@opencanvas/editor';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { ICONS } from '@/lib/icons';
import { ELEMENT_DRAG_TYPE } from '../side-panel';

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500 first:mt-3">
      {children}
    </h3>
  );
}

/** Tile that inserts on click and can be dragged onto the canvas. */
function ElementTile({
  props,
  label,
  children,
  testId,
}: {
  props: AnyNodeProps;
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const { editor } = useEditorContext();
  return (
    <button
      type="button"
      draggable
      title={label}
      aria-label={label}
      data-testid={testId}
      onDragStart={(e) => {
        e.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify(props));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => editor.insertNodes([props])}
      className="flex aspect-square items-center justify-center rounded-lg bg-slate-50 p-2 text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </button>
  );
}

function ShapePreview({ kind }: { kind: ShapeKind }) {
  const wide =
    kind === 'arrow-right' || kind === 'arrow-left' || kind === 'chevron' || kind === 'parallelogram';
  const w = wide ? 40 : 32;
  const d = pathToSvg(
    getShapePath(kind, w, 32, { cornerRadius: 0, sides: kind === 'star' ? 5 : 6, innerRatio: 0.5 }),
  );
  return (
    <svg viewBox={`-2 -2 ${w + 4} 36`} className="h-9 w-11" aria-hidden>
      <path d={d} fill="currentColor" className="text-brand-400" />
    </svg>
  );
}

export function ElementsPanel() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const icons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ICONS.filter((i) => i.keywords.toLowerCase().includes(q)) : ICONS;
  }, [query]);
  return (
    <div className="pb-6">
      <PanelHeading>{t('editor.elements.shapes')}</PanelHeading>
      <div className="grid grid-cols-4 gap-2 px-4">
        {SHAPE_PRESETS.map((s) => (
          <ElementTile key={s.kind} props={shapeProps(s.kind)} label={s.label} testId={`shape-${s.kind}`}>
            <ShapePreview kind={s.kind} />
          </ElementTile>
        ))}
      </div>

      <PanelHeading>{t('editor.elements.lines')}</PanelHeading>
      <div className="grid grid-cols-2 gap-2 px-4">
        {LINE_PRESETS.map((l) => (
          <ElementTile
            key={l.id}
            props={l.props as unknown as AnyNodeProps}
            label={l.label}
            testId={`line-${l.id}`}
          >
            <svg viewBox="0 0 80 16" className="h-6 w-full" aria-hidden>
              <line
                x1="8"
                y1="8"
                x2="72"
                y2="8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={l.id === 'dashed' ? '9 6' : l.id === 'dotted' ? '0.1 6' : undefined}
              />
              {l.id === 'arrow' || l.id === 'double-arrow' ? (
                <path
                  d="M64 2 L74 8 L64 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {l.id === 'double-arrow' ? (
                <path
                  d="M16 2 L6 8 L16 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </svg>
          </ElementTile>
        ))}
      </div>

      <PanelHeading>{t('editor.elements.frames')}</PanelHeading>
      <p className="mb-2 px-4 text-xs text-slate-500">{t('editor.elements.framesHint')}</p>
      <div className="grid grid-cols-4 gap-2 px-4">
        {(
          [
            'rect',
            'ellipse',
            'heart',
            'star',
            'hexagon',
            'diamond',
            'triangle',
            'speech-bubble',
          ] as ShapeKind[]
        ).map((kind) => (
          <ElementTile
            key={kind}
            props={framePreset(kind)}
            label={`${t('editor.nodeTypes.frame')} · ${kind}`}
            testId={`frame-${kind}`}
          >
            <svg viewBox="-2 -2 36 36" className="size-9" aria-hidden>
              <path
                d={pathToSvg(getShapePath(kind, 32, 32, { cornerRadius: 0, sides: 5, innerRatio: 0.5 }))}
                fill="#e5e7eb"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
            </svg>
          </ElementTile>
        ))}
      </div>

      <PanelHeading>{t('editor.elements.icons')}</PanelHeading>
      <div className="px-4">
        <label className="relative mb-2 block">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('editor.elements.searchIcons')}
            aria-label={t('editor.elements.searchIcons')}
            className="h-9 w-full rounded-lg border border-slate-200 ps-8 pe-2 text-sm outline-none focus:border-brand-400"
          />
        </label>
        {icons.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{t('editor.elements.noIcons')}</p>
        ) : null}
        <div className="grid grid-cols-5 gap-1.5">
          {icons.map((icon) => (
            <ElementTile
              key={icon.id}
              label={icon.id}
              testId={`icon-${icon.id}`}
              props={
                {
                  type: 'path',
                  width: 160,
                  height: 160,
                  path: icon.path,
                  viewBox: { x: 0, y: 0, width: 24, height: 24 },
                  fill: null,
                  stroke: { color: '#111827', width: 2, style: 'solid', cap: 'round', join: 'round' },
                  semantic: { role: 'icon', description: icon.id, slot: null },
                } as AnyNodeProps
              }
            >
              <svg
                viewBox="0 0 24 24"
                className="size-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={icon.path} />
              </svg>
            </ElementTile>
          ))}
        </div>
      </div>
    </div>
  );
}
