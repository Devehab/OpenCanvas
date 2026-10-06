'use client';

/**
 * Rulers along the top and left of the canvas, and the current page's ruler
 * guides. Drag from a ruler to add a guide; drag a guide to move it, or back
 * onto the ruler to remove it.
 */
import type { PageGuide } from '@opencanvas/core';
import { useEffect, useRef, useState } from 'react';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { rulerStep } from '@/lib/guides';

export const RULER_SIZE = 20;
const GUIDE_COLOR = '#a855f7';

type Axis = 'x' | 'y';

function useRulerState() {
  return useEditorValue(
    (e) => {
      const s = e.state.get();
      const bounds = e.getSelectionBounds();
      return {
        camera: s.camera,
        viewport: s.viewport,
        selection: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
      };
    },
    [],
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
}

/** One ruler strip drawn on a canvas. `axis` is the direction it measures. */
function RulerStrip({
  axis,
  onGuideDrag,
}: {
  axis: Axis;
  onGuideDrag: (axis: Axis, e: React.PointerEvent) => void;
}) {
  const { t, formatNumber } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const { camera, viewport, selection } = useRulerState();
  const length = axis === 'x' ? viewport.width : viewport.height;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || length <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // The strip starts after the corner square.
    const w = axis === 'x' ? length - RULER_SIZE : RULER_SIZE;
    const h = axis === 'x' ? RULER_SIZE : length - RULER_SIZE;
    if (w <= 0 || h <= 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const offset = axis === 'x' ? camera.x : camera.y;
    const toScreen = (v: number) => offset + v * camera.zoom - RULER_SIZE;
    if (selection) {
      const a = toScreen(axis === 'x' ? selection.x : selection.y);
      const b = toScreen(axis === 'x' ? selection.x + selection.width : selection.y + selection.height);
      ctx.fillStyle = 'rgba(124, 108, 248, 0.18)';
      if (axis === 'x') ctx.fillRect(a, 0, b - a, h);
      else ctx.fillRect(0, a, w, b - a);
    }
    const step = rulerStep(camera.zoom);
    const minor = step * camera.zoom >= 100 ? step / 10 : step / 5;
    const first = Math.floor((RULER_SIZE - offset) / camera.zoom / minor) * minor;
    const last = (length - offset) / camera.zoom;
    ctx.strokeStyle = '#94a3b8';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = first; v <= last; v += minor) {
      const p = Math.round(toScreen(v)) + 0.5;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      const tick = major ? RULER_SIZE : RULER_SIZE * 0.3;
      if (axis === 'x') {
        ctx.moveTo(p, RULER_SIZE);
        ctx.lineTo(p, RULER_SIZE - tick);
      } else {
        ctx.moveTo(RULER_SIZE, p);
        ctx.lineTo(RULER_SIZE - tick, p);
      }
      if (major) {
        const label = formatNumber(Math.round(v));
        if (axis === 'x') ctx.fillText(label, p + 3, 10);
        else {
          ctx.save();
          ctx.translate(10, p - 3);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    if (axis === 'x') {
      ctx.moveTo(0, RULER_SIZE - 0.5);
      ctx.lineTo(w, RULER_SIZE - 0.5);
    } else {
      ctx.moveTo(RULER_SIZE - 0.5, 0);
      ctx.lineTo(RULER_SIZE - 0.5, h);
    }
    ctx.stroke();
  }, [axis, camera, length, selection, formatNumber]);

  return (
    <canvas
      ref={ref}
      className="absolute z-[7] cursor-pointer touch-none"
      style={
        axis === 'x'
          ? { top: 0, left: RULER_SIZE, width: Math.max(0, length - RULER_SIZE), height: RULER_SIZE }
          : { left: 0, top: RULER_SIZE, width: RULER_SIZE, height: Math.max(0, length - RULER_SIZE) }
      }
      role="img"
      aria-label={axis === 'x' ? t('editor.rulers.horizontal') : t('editor.rulers.vertical')}
      title={t('editor.rulers.dragHint')}
      data-testid={`ruler-${axis}`}
      // Dragging down from the top ruler makes a horizontal guide (y), from the left ruler a vertical one (x).
      onPointerDown={(e) => onGuideDrag(axis === 'x' ? 'y' : 'x', e)}
    />
  );
}

export function Rulers() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const rulers = useEditorValue((e) => e.state.get().rulers && e.state.get().pageView !== 'grid');
  const pageId = useEditorValue((e) => e.pageId);
  const guides = useEditorValue((e) => e.store.getPage(e.pageId)?.guides ?? []);
  const page = useEditorValue((e) => e.store.getPage(e.pageId));
  const camera = useEditorValue((e) => e.state.get().camera);
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    index: number | null;
    axis: Axis;
    position: number;
    remove: boolean;
  } | null>(null);

  if (!rulers || !page) return null;

  const pagePosition = (axis: Axis, clientX: number, clientY: number) => {
    const rect = root.current!.getBoundingClientRect();
    const screen = axis === 'x' ? clientX - rect.left : clientY - rect.top;
    const offset = axis === 'x' ? camera.x : camera.y;
    return Math.round((screen - offset) / camera.zoom);
  };
  const overRuler = (axis: Axis, clientX: number, clientY: number) => {
    const rect = root.current!.getBoundingClientRect();
    return axis === 'x' ? clientX - rect.left < RULER_SIZE : clientY - rect.top < RULER_SIZE;
  };

  /** Shared drag for new guides (index null) and existing ones. */
  const startDrag = (axis: Axis, index: number | null, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Window listeners: the dragged guide may unmount (hidden while over the ruler).
    const pointerId = e.pointerId;
    const state = { index, axis, position: pagePosition(axis, e.clientX, e.clientY), remove: index === null };
    setDrag(state);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      state.position = pagePosition(axis, ev.clientX, ev.clientY);
      state.remove = overRuler(axis, ev.clientX, ev.clientY);
      setDrag({ ...state });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      const current = editor.store.getPage(pageId)?.guides ?? [];
      const next: PageGuide[] = current.filter((_, i) => i !== index);
      if (!overRuler(axis, ev.clientX, ev.clientY))
        next.push({ axis, position: pagePosition(axis, ev.clientX, ev.clientY) });
      if (index !== null || next.length > current.length)
        editor.updatePage(pageId, { guides: next }, index === null ? 'Add guide' : 'Move guide');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const line = (axis: Axis, position: number, key: string, index: number | null, active: boolean) => {
    const screen = (axis === 'x' ? camera.x : camera.y) + position * camera.zoom;
    const vertical = axis === 'x';
    return (
      // biome-ignore lint/a11y/useSemanticElements: a draggable guide line (WAI-ARIA separator); <hr> cannot hold the label badge
      <div
        key={key}
        className="absolute z-[5] touch-none"
        style={
          vertical
            ? { left: screen - 4, top: RULER_SIZE, bottom: 0, width: 9, cursor: 'col-resize' }
            : { top: screen - 4, left: RULER_SIZE, right: 0, height: 9, cursor: 'row-resize' }
        }
        onPointerDown={index === null ? undefined : (e) => startDrag(axis, index, e)}
        data-testid="guide"
        data-axis={axis}
        data-position={position}
        role="separator"
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        aria-label={t('editor.rulers.guide', { position })}
      >
        <div
          className="absolute"
          style={
            vertical
              ? {
                  left: 4,
                  top: 0,
                  bottom: 0,
                  borderLeft: `1px dashed ${GUIDE_COLOR}`,
                  opacity: active ? 1 : 0.85,
                }
              : {
                  top: 4,
                  left: 0,
                  right: 0,
                  borderTop: `1px dashed ${GUIDE_COLOR}`,
                  opacity: active ? 1 : 0.85,
                }
          }
        />
        {active ? (
          <span
            className="absolute rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums"
            style={vertical ? { left: 8, top: 8 } : { top: 8, left: 8 }}
            dir="ltr"
          >
            {axis === 'x' ? 'X' : 'Y'} {position}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-[5] [&>*]:pointer-events-auto">
      <RulerStrip axis="x" onGuideDrag={(axis, e) => startDrag(axis, null, e)} />
      <RulerStrip axis="y" onGuideDrag={(axis, e) => startDrag(axis, null, e)} />
      <div
        className="absolute left-0 top-0 z-[7] size-5 border-b border-e border-slate-200 bg-white"
        aria-hidden
      />
      {guides.map((g, i) =>
        drag && drag.index === i
          ? drag.remove
            ? null
            : line(g.axis, drag.position, `g${i}`, i, true)
          : line(g.axis, g.position, `g${i}`, i, false),
      )}
      {drag && drag.index === null && !drag.remove ? line(drag.axis, drag.position, 'new', null, true) : null}
    </div>
  );
}
