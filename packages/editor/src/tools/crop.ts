/**
 * Crop mode (double-click an image): drag inside to move the photo under the
 * crop box, drag the photo's corners to scale it, drag the crop box handles to
 * change what is shown. The whole session is one undo step.
 *
 * All geometry is computed in the image's local space (so rotated and flipped
 * images crop naturally) with the pure helpers from @opencanvas/core.
 */
import {
  applyToPoint,
  boxFromLocal,
  getPageTransform,
  type ImageCorner,
  type ImageNode,
  imageFrame,
  invert,
  type Mat,
  multiply,
  type NodeRecord,
  panCrop,
  type ResizeHandle,
  resizeImageCrop,
  resizeLocalBox,
  scaleCropImage,
  type Vec,
} from '@opencanvas/core';
import { cameraMatrix } from '../camera';
import type { Editor } from '../editor';
import type { ToolPointer } from '../types';

export type CropTarget =
  | { kind: 'pan' }
  | { kind: 'scale'; corner: ImageCorner }
  | { kind: 'resize'; handle: ResizeHandle };

const HIT_PX = 10;
const MIN_BOX = 8;

const CURSORS: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/** Screen transform of the image's local space. */
export function cropScreenMatrix(editor: Editor, node: NodeRecord): Mat {
  return multiply(cameraMatrix(editor.state.get().camera), getPageTransform(editor.store, node));
}

/** Whether the crop box itself can be resized (not for photos inside frames: the frame is the box). */
export function canResizeCropBox(editor: Editor, node: NodeRecord): boolean {
  return editor.store.getNode(node.parentId)?.type !== 'frame';
}

export class CropSession {
  private drag: {
    target: CropTarget;
    start: ImageNode;
    startLocal: Vec;
    toLocal: Mat;
  } | null = null;

  constructor(private readonly editor: Editor) {}

  private node(): ImageNode | null {
    const id = this.editor.state.get().croppingId;
    const node = id ? this.editor.store.getNode(id) : null;
    return node?.type === 'image' ? node : null;
  }

  /** What a screen point would act on (null = outside: ends crop mode). */
  hitTest(point: Vec): CropTarget | null {
    const node = this.node();
    if (!node) return null;
    const m = cropScreenMatrix(this.editor, node);
    const near = (local: Vec) => {
      const p = applyToPoint(m, local);
      return Math.hypot(p.x - point.x, p.y - point.y) <= HIT_PX;
    };
    if (canResizeCropBox(this.editor, node)) {
      const { width: w, height: h } = node;
      const handles: [ResizeHandle, Vec][] = [
        ['nw', { x: 0, y: 0 }],
        ['ne', { x: w, y: 0 }],
        ['se', { x: w, y: h }],
        ['sw', { x: 0, y: h }],
        ['n', { x: w / 2, y: 0 }],
        ['e', { x: w, y: h / 2 }],
        ['s', { x: w / 2, y: h }],
        ['w', { x: 0, y: h / 2 }],
      ];
      for (const [handle, at] of handles) if (near(at)) return { kind: 'resize', handle };
    }
    const f = imageFrame(node);
    const corners: [ImageCorner, Vec][] = [
      ['nw', { x: f.x, y: f.y }],
      ['ne', { x: f.x + f.width, y: f.y }],
      ['se', { x: f.x + f.width, y: f.y + f.height }],
      ['sw', { x: f.x, y: f.y + f.height }],
    ];
    for (const [corner, at] of corners) if (near(at)) return { kind: 'scale', corner };
    const local = applyToPoint(invert(m), point);
    if (local.x >= f.x && local.x <= f.x + f.width && local.y >= f.y && local.y <= f.y + f.height)
      return { kind: 'pan' };
    return null;
  }

  cursorFor(target: CropTarget | null): string {
    if (!target) return 'default';
    if (target.kind === 'pan') return 'move';
    return CURSORS[target.kind === 'scale' ? target.corner : target.handle] ?? 'default';
  }

  /** Returns false when the pointer is outside the photo (the caller ends crop mode). */
  pointerDown(p: ToolPointer): boolean {
    const node = this.node();
    const target = this.hitTest(p.point);
    if (!node || !target) return false;
    const toLocal = invert(cropScreenMatrix(this.editor, node));
    this.drag = { target, start: node, startLocal: applyToPoint(toLocal, p.point), toLocal };
    this.editor.state.set({ interaction: 'resizing', cursor: this.cursorFor(target) });
    return true;
  }

  pointerMove(p: ToolPointer): void {
    const d = this.drag;
    if (!d) {
      this.editor.state.set({ cursor: this.cursorFor(this.hitTest(p.point)) });
      return;
    }
    const local = applyToPoint(d.toLocal, p.point);
    const start = d.start;
    let patch: Partial<ImageNode>;
    if (d.target.kind === 'pan') {
      patch = { crop: panCrop(start, local.x - d.startLocal.x, local.y - d.startLocal.y) };
    } else if (d.target.kind === 'scale') {
      patch = { crop: scaleCropImage(start, d.target.corner, local) };
    } else {
      const box = resizeLocalBox(
        start.width,
        start.height,
        d.target.handle,
        { x: local.x - d.startLocal.x, y: local.y - d.startLocal.y },
        { minWidth: MIN_BOX, minHeight: MIN_BOX, keepAspect: p.shiftKey, fromCenter: p.altKey },
      );
      const fitted = resizeImageCrop(start, box);
      patch = { ...boxFromLocal(start, fitted.box), crop: fitted.crop };
    }
    this.editor.updateGesture(
      (tx) => tx.update<NodeRecord>(start.id, patch as Partial<NodeRecord>),
      'Crop image',
    );
  }

  pointerUp(): void {
    if (!this.drag) return;
    this.drag = null;
    this.editor.state.set({ interaction: null });
  }

  /** Arrow keys move the photo under the crop box (screen pixels). */
  nudge(dx: number, dy: number): void {
    const node = this.node();
    if (!node) return;
    const m = cropScreenMatrix(this.editor, node);
    const inv = invert({ ...m, e: 0, f: 0 });
    const d = applyToPoint(inv, { x: dx, y: dy });
    this.editor.updateGesture(
      (tx) => tx.update<NodeRecord>(node.id, { crop: panCrop(node, d.x, d.y) } as Partial<NodeRecord>),
      'Crop image',
    );
  }

  cancel(): void {
    this.drag = null;
  }
}
