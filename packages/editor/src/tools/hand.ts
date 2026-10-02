import type { Editor } from '../editor';
import type { Tool, ToolPointer } from '../types';

/** Pans the camera (also used temporarily while Space or the middle button is held). */
export class HandTool implements Tool {
  readonly id = 'hand' as const;
  private last: ToolPointer | null = null;

  constructor(private readonly editor: Editor) {}

  onPointerDown(p: ToolPointer): void {
    this.last = p;
    this.editor.state.set({ interaction: 'panning', cursor: 'grabbing' });
  }

  onPointerMove(p: ToolPointer): void {
    if (!this.last) return;
    this.editor.panBy(p.point.x - this.last.point.x, p.point.y - this.last.point.y);
    this.last = p;
  }

  onPointerUp(): void {
    this.last = null;
    this.editor.state.set({ interaction: null, cursor: 'grab' });
  }

  onCancel(): boolean {
    const active = this.last !== null;
    this.last = null;
    if (active) this.editor.state.set({ interaction: null });
    return active;
  }
}
