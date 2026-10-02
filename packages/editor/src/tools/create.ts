/**
 * Creation tools: drag to draw a shape/frame/line, or click for a default
 * size. The text tool creates a text box and enters editing immediately.
 * Afterwards the editor returns to the select tool (Canva behaviour).
 */
import { type AnyNodeProps, boxNormalize, type Id, normalizeDegrees, radToDeg } from '@opencanvas/core';
import type { Editor } from '../editor';
import { framePreset, shapeProps } from '../presets';
import type { Tool, ToolId, ToolPointer } from '../types';

type CreatableTool = Exclude<ToolId, 'select' | 'hand'>;

export class CreateTool implements Tool {
  private start: ToolPointer | null = null;
  private createdId: Id | null = null;

  constructor(
    private readonly editor: Editor,
    readonly id: CreatableTool,
  ) {}

  private props(): AnyNodeProps {
    switch (this.id) {
      case 'rect':
        return shapeProps('rect', 100);
      case 'ellipse':
        return shapeProps('ellipse', 100);
      case 'triangle':
        return shapeProps('triangle', 100);
      case 'star':
        return shapeProps('star', 100);
      case 'frame':
        return framePreset('rect', 100);
      case 'line':
        return {
          type: 'line',
          width: 100,
          height: 4,
          stroke: { color: '#111827', width: 4, style: 'solid', cap: 'round', join: 'round' },
        } as AnyNodeProps;
      case 'text':
        return {
          type: 'text',
          sizing: 'auto-width',
          content: { paragraphs: [{ runs: [{ text: '', style: {} }], list: 'none', indent: 0 }] },
          style: { fontFamily: 'Inter', fontSize: 32, color: '#111827' },
        } as AnyNodeProps;
    }
  }

  onPointerDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    const editor = this.editor;
    this.start = p;
    if (this.id === 'text') {
      // The batch opened here is closed by stopEditingText(), so "create + type" is one undo step.
      editor.history.beginBatch('Add text');
      const ids = editor.insertNodes([{ ...this.props(), x: p.page.x, y: p.page.y } as AnyNodeProps], {
        center: false,
      });
      const id = ids[0];
      this.start = null;
      editor.setTool('select');
      if (!id || !editor.startEditingText(id, { newNode: true })) editor.history.endBatch();
      return;
    }
    editor.beginGesture(`Add ${this.id}`);
    const base = this.props();
    const ids = editor.insertNodes(
      [
        {
          ...base,
          x: p.page.x,
          y: p.page.y,
          width: 1,
          height: this.id === 'line' ? (base.height ?? 4) : 1,
        } as AnyNodeProps,
      ],
      {
        center: false,
      },
    );
    this.createdId = ids[0] ?? null;
    editor.state.set({ interaction: 'creating' });
  }

  onPointerMove(p: ToolPointer): void {
    const editor = this.editor;
    if (!this.start || !this.createdId) return;
    const id = this.createdId;
    const start = this.start.page;
    if (this.id === 'line') {
      let end = p.page;
      if (p.shiftKey) {
        const len = Math.hypot(end.x - start.x, end.y - start.y);
        const a = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / (Math.PI / 4)) * (Math.PI / 4);
        end = { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len };
      }
      const length = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
      const rotation = normalizeDegrees(radToDeg(Math.atan2(end.y - start.y, end.x - start.x)));
      editor.updateGesture((tx) => {
        const node = tx.getNode(id)!;
        tx.update(id, {
          x: (start.x + end.x) / 2 - length / 2,
          y: (start.y + end.y) / 2 - node.height / 2,
          width: length,
          rotation,
        });
      });
      return;
    }
    let w = p.page.x - start.x;
    let h = p.page.y - start.y;
    if (p.shiftKey) {
      const size = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * size;
      h = Math.sign(h || 1) * size;
    }
    const box = boxNormalize({ x: start.x, y: start.y, width: w, height: h });
    editor.updateGesture((tx) =>
      tx.update(id, { x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height) }),
    );
  }

  onPointerUp(p: ToolPointer): void {
    const editor = this.editor;
    const id = this.createdId;
    const start = this.start;
    this.start = null;
    this.createdId = null;
    if (!id || !start) return;
    const dragged = Math.hypot(p.point.x - start.point.x, p.point.y - start.point.y) > 3;
    if (!dragged) {
      // Click: default size centered on the click point.
      const base = this.props();
      const w = base.width ?? 100;
      const h = base.height ?? 100;
      editor.updateGesture((tx) =>
        tx.update(id, { x: start.page.x - w / 2, y: start.page.y - h / 2, width: w, height: h, rotation: 0 }),
      );
    }
    editor.endGesture();
    editor.state.set({ interaction: null });
    editor.setTool('select');
    editor.select([id]);
  }

  onCancel(): boolean {
    if (!this.createdId) return false;
    this.createdId = null;
    this.start = null;
    this.editor.cancelGesture();
    this.editor.state.set({ interaction: null });
    return true;
  }
}
