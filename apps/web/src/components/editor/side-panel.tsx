'use client';

import { CloudUpload, Layers, Palette, Puzzle, Shapes, Type, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { type PanelId, useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { BrandPanel } from './panels/brand-panel';
import { ElementsPanel } from './panels/elements-panel';
import { LayersPanel } from './panels/layers-panel';
import { PluginsPanel } from './panels/plugins-panel';
import { TextPanel } from './panels/text-panel';
import { UploadsPanel } from './panels/uploads-panel';

const TABS: { id: PanelId; icon: typeof Shapes }[] = [
  { id: 'elements', icon: Shapes },
  { id: 'text', icon: Type },
  { id: 'brand', icon: Palette },
  { id: 'uploads', icon: CloudUpload },
  { id: 'layers', icon: Layers },
  { id: 'plugins', icon: Puzzle },
];

export function SidePanel() {
  const { t } = useI18n();
  const { panel, setPanel } = useEditorContext();
  const content: Record<PanelId, ReactNode> = {
    elements: <ElementsPanel />,
    text: <TextPanel />,
    brand: <BrandPanel />,
    uploads: <UploadsPanel />,
    layers: <LayersPanel />,
    plugins: <PluginsPanel />,
  };
  return (
    <aside
      className="relative z-20 flex shrink-0 border-e border-slate-200 bg-white"
      aria-label={t('editor.panels.label')}
    >
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('editor.panels.label')}
        className="flex w-[72px] flex-col items-center gap-1 border-e border-slate-100 py-2"
      >
        {TABS.map((tab) => {
          const active = panel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`panel-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={active ? `panel-${tab.id}` : undefined}
              data-testid={`panel-tab-${tab.id}`}
              onClick={() => setPanel(active ? null : tab.id)}
              className={cn(
                'flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100',
                active && 'bg-brand-50 text-brand-700 hover:bg-brand-50',
              )}
            >
              <tab.icon className="size-5" />
              {t(`editor.panels.${tab.id}`)}
            </button>
          );
        })}
      </div>
      {panel ? (
        <div
          role="tabpanel"
          id={`panel-${panel}`}
          aria-labelledby={`panel-tab-${panel}`}
          className="relative flex w-72 flex-col bg-white max-lg:w-60 max-md:absolute max-md:inset-y-0 max-md:start-[72px] max-md:border-e max-md:border-slate-200 max-md:shadow-xl"
        >
          <button
            type="button"
            onClick={() => setPanel(null)}
            aria-label={t('editor.panels.collapse')}
            className="absolute end-2 top-2 z-10 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">{content[panel]}</div>
        </div>
      ) : null}
    </aside>
  );
}

/** Data transfer type for dragging elements from panels onto the canvas. */
export const ELEMENT_DRAG_TYPE = 'application/x-opencanvas-element';
