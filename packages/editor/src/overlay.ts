/**
 * Draws the interactive overlay (selection, handles, hover, smart guides,
 * marquee, size/angle badges) in screen space on its own canvas, so the
 * design canvas only re-renders when the document or camera changes.
 */
import { getNodeOutline, getPageTransform, multiply, type NodeRecord, tracePath } from '@opencanvas/core';
import type { Context2D } from '@opencanvas/renderer';
import { cameraMatrix } from './camera';
import type { Editor } from './editor';
import { HANDLE_SIZE } from './handles';

export const OVERLAY_COLORS = {
  selection: '#6d5dfc',
  hover: '#8b7dff',
  guide: '#ff3d8b',
  marqueeFill: 'rgba(109, 93, 252, 0.08)',
  handleFill: '#ffffff',
  badgeBg: '#1f2937',
  badgeText: '#ffffff',
  locked: '#9ca3af',
  dropTarget: '#6d5dfc',
  dropTargetHalo: '#ffffff',
};

function outlineNode(
  ctx: Context2D,
  editor: Editor,
  node: NodeRecord,
  dpr: number,
  color: string,
  width: number,
): void {
  const s = editor.state.get();
  const m = multiply(cameraMatrix(s.camera, dpr), getPageTransform(editor.store, node));
  ctx.save();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.beginPath();
  if (node.type === 'line') {
    ctx.moveTo(0, node.height / 2);
    ctx.lineTo(node.width, node.height / 2);
  } else {
    const outline = getNodeOutline(node);
    if (outline) tracePath(ctx, outline);
    else ctx.rect(0, 0, node.width, node.height);
  }
  ctx.restore();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

export function drawOverlay(ctx: Context2D, editor: Editor, dpr: number): void {
  const s = editor.state.get();
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Hover outline.
  if (s.hoveredId && !s.interaction) {
    const node = editor.store.getNode(s.hoveredId);
    if (node) outlineNode(ctx, editor, node, dpr, OVERLAY_COLORS.hover, 1.5);
  }

  // Photo frame that will receive the dragged image.
  if (s.dropTargetId) {
    const node = editor.store.getNode(s.dropTargetId);
    if (node) {
      outlineNode(ctx, editor, node, dpr, OVERLAY_COLORS.dropTarget, 3);
      outlineNode(ctx, editor, node, dpr, OVERLAY_COLORS.dropTargetHalo, 1);
    }
  }

  // Text being edited: outline only (the DOM editor shows the caret).
  if (s.editingTextId) {
    const node = editor.store.getNode(s.editingTextId);
    if (node) outlineNode(ctx, editor, node, dpr, OVERLAY_COLORS.selection, 1.5);
  }

  const frame = editor.getSelectionFrame();
  if (frame && s.interaction !== 'brushing') {
    const color = frame.locked ? OVERLAY_COLORS.locked : OVERLAY_COLORS.selection;
    // Individual outlines for multi-selections.
    if (frame.kind === 'multi') {
      for (const id of frame.nodeIds) {
        const node = editor.store.getNode(id);
        if (node) outlineNode(ctx, editor, node, dpr, color, 1);
      }
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (frame.endpoints) {
      ctx.beginPath();
      ctx.moveTo(frame.endpoints[0].x, frame.endpoints[0].y);
      ctx.lineTo(frame.endpoints[1].x, frame.endpoints[1].y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      const c = frame.corners;
      ctx.moveTo(c[0].x, c[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(c[i]!.x, c[i]!.y);
      ctx.closePath();
      ctx.stroke();
    }
    if (!s.interaction || s.interaction === 'resizing' || s.interaction === 'rotating') {
      for (const handle of frame.handles) {
        ctx.beginPath();
        if (handle.kind === 'rotate') {
          ctx.arc(handle.point.x, handle.point.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = OVERLAY_COLORS.handleFill;
          ctx.fill();
          ctx.stroke();
          // Rotation glyph: a small open arc with an arrow head.
          ctx.beginPath();
          ctx.arc(handle.point.x, handle.point.y, 4, Math.PI * 0.15, Math.PI * 1.65);
          ctx.stroke();
        } else if (handle.kind === 'endpoint' || (handle.resize && handle.resize.length === 2)) {
          ctx.arc(handle.point.x, handle.point.y, HANDLE_SIZE / 2 + 0.5, 0, Math.PI * 2);
          ctx.fillStyle = OVERLAY_COLORS.handleFill;
          ctx.fill();
          ctx.stroke();
        } else {
          // Side handles are pills aligned with their edge.
          const c = frame.corners;
          const horizontal = handle.resize === 'n' || handle.resize === 's';
          const a = horizontal ? c[0] : c[0];
          const b = horizontal ? c[1] : c[3];
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          ctx.save();
          ctx.translate(handle.point.x, handle.point.y);
          ctx.rotate(angle);
          const len = 16;
          const thick = 6;
          ctx.beginPath();
          ctx.roundRect(-len / 2, -thick / 2, len, thick, thick / 2);
          ctx.fillStyle = OVERLAY_COLORS.handleFill;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // Smart guides.
  if (s.guides.length) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = OVERLAY_COLORS.guide;
    ctx.lineWidth = 1;
    for (const g of s.guides) {
      const a = editor.pageToScreen(
        g.axis === 'x' ? { x: g.position, y: g.from } : { x: g.from, y: g.position },
      );
      const b = editor.pageToScreen(g.axis === 'x' ? { x: g.position, y: g.to } : { x: g.to, y: g.position });
      ctx.beginPath();
      ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5);
      ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Marquee.
  if (s.marquee) {
    const a = editor.pageToScreen({ x: s.marquee.x, y: s.marquee.y });
    const b = editor.pageToScreen({ x: s.marquee.x + s.marquee.width, y: s.marquee.y + s.marquee.height });
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = OVERLAY_COLORS.marqueeFill;
    ctx.strokeStyle = OVERLAY_COLORS.selection;
    ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
    ctx.restore();
  }

  // Size / angle badge.
  if (s.feedback) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const padding = 6;
    const tw = ctx.measureText(s.feedback.text).width;
    const x = s.feedback.point.x;
    const y = s.feedback.point.y;
    ctx.fillStyle = OVERLAY_COLORS.badgeBg;
    ctx.beginPath();
    ctx.roundRect(x, y, tw + padding * 2, 22, 6);
    ctx.fill();
    ctx.fillStyle = OVERLAY_COLORS.badgeText;
    ctx.textBaseline = 'middle';
    ctx.fillText(s.feedback.text, x + padding, y + 11);
    ctx.restore();
  }
}
