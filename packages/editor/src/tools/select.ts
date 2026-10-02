/**
 * Select tool: click/shift-click selection, entering groups, marquee,
 * dragging (with snapping, axis lock and alt-duplicate), resizing (per element
 * type), rotating (with angle snapping) and line endpoint editing.
 */
import {
  applyToPoint,
  applyToVector,
  type Box,
  boxFromLocal,
  boxNormalize,
  collectSnapTargets,
  duplicateNodes,
  getNodeAtPoint,
  getNodesInBox,
  getPageCenter,
  getPageTransform,
  getParentPageTransform,
  type Id,
  type ImageNode,
  invert,
  isCornerHandle,
  type Mat,
  type NodeRecord,
  normalizeDegrees,
  type ResizeHandle,
  radToDeg,
  resizeImageCrop,
  resizeLocalBox,
  rotateNodesFrom,
  type SnapTargets,
  scaledProps,
  scaleNodesFrom,
  snapMovingBox,
  snapValues,
  type TextNode,
  translateFrom,
  type Vec,
} from '@opencanvas/core';
import type { Editor } from '../editor';
import { type Handle, hitTestHandles, pointInFrame } from '../handles';
import type { Tool, ToolPointer } from '../types';
import { GestureSnapshot } from './gesture';

const DRAG_THRESHOLD = 3;
const SNAP_PX = 6;

type State =
  | { kind: 'idle' }
  | { kind: 'pointing-canvas'; start: ToolPointer; additive: boolean; before: Id[] }
  | { kind: 'pointing-node'; start: ToolPointer; nodeId: Id; wasSelected: boolean }
  | { kind: 'pointing-handle'; start: ToolPointer; handle: Handle }
  | {
      kind: 'translating';
      start: ToolPointer;
      snapshot: GestureSnapshot;
      initial: NodeRecord[];
      bounds: Box;
      targets: SnapTargets;
    }
  | {
      kind: 'resizing';
      start: ToolPointer;
      handle: ResizeHandle;
      snapshot: GestureSnapshot;
      initial: NodeRecord[];
      bounds: Box;
    }
  | {
      kind: 'rotating';
      start: ToolPointer;
      snapshot: GestureSnapshot;
      initial: NodeRecord[];
      pivot: Vec;
      startAngle: number;
    }
  | {
      kind: 'endpoint';
      start: ToolPointer;
      snapshot: GestureSnapshot;
      node: NodeRecord;
      which: 'start' | 'end';
    }
  | { kind: 'brushing'; start: ToolPointer; additive: boolean; before: Id[] };

const linearOf = (m: Mat): Mat => ({ ...m, e: 0, f: 0 });

export class SelectTool implements Tool {
  readonly id = 'select' as const;
  private state: State = { kind: 'idle' };

  constructor(private readonly editor: Editor) {}

  private get zoom() {
    return this.editor.state.get().camera.zoom;
  }

  // ---------------------------------------------------------------------------

  onPointerDown(p: ToolPointer): void {
    const editor = this.editor;
    if (p.button !== 0) return;
    if (editor.editingTextId) {
      const node = editor.store.getNode(editor.editingTextId);
      const hit = node
        ? getNodeAtPoint(editor.store, node.parentId, p.page, { tolerance: 2 / this.zoom })
        : null;
      if (hit?.id === editor.editingTextId) return; // clicks inside the text editor are handled by the DOM
      editor.stopEditingText();
    }
    const frame = editor.getSelectionFrame();
    const handle = hitTestHandles(frame, p.point);
    if (handle) {
      this.state = { kind: 'pointing-handle', start: p, handle };
      return;
    }
    const additive = p.shiftKey;
    const deep = p.metaKey || p.ctrlKey;
    const hit = this.hitTest(p.page, deep);
    if (hit) {
      const selected = editor.selectedIds.includes(hit.id);
      if (additive && !selected) {
        editor.select([hit.id], { additive: true });
      } else if (!additive && !selected) {
        editor.select([hit.id]);
      }
      // Shift-click on a selected element deselects it on pointer-up, so Shift+drag
      // can still move the selection with an axis lock.
      this.state = { kind: 'pointing-node', start: p, nodeId: hit.id, wasSelected: selected };
      return;
    }
    // Dragging inside the frame of a multi-selection moves the selection.
    if (frame && !additive && pointInFrame(frame, p.point) && !frame.locked) {
      this.state = { kind: 'pointing-node', start: p, nodeId: frame.nodeIds[0]!, wasSelected: true };
      return;
    }
    if (!additive) {
      editor.deselectAll();
      if (editor.state.get().focusedGroupId) editor.setFocusedGroup(null);
    }
    this.state = { kind: 'pointing-canvas', start: p, additive, before: [...editor.selectedIds] };
  }

  onPointerMove(p: ToolPointer): void {
    const s = this.state;
    switch (s.kind) {
      case 'idle':
        this.updateHover(p);
        return;
      case 'pointing-canvas':
        if (this.dragged(s.start, p)) {
          this.state = { kind: 'brushing', start: s.start, additive: s.additive, before: s.before };
          this.editor.state.set({ interaction: 'brushing' });
          this.brush(p);
        }
        return;
      case 'pointing-node':
        if (this.dragged(s.start, p)) this.startTranslate(s.start, p.altKey);
        if (this.state.kind === 'translating') this.translate(p);
        return;
      case 'pointing-handle':
        if (this.dragged(s.start, p, 1)) this.startHandleGesture(s.start, s.handle);
        if (this.state.kind !== 'pointing-handle') this.onPointerMove(p);
        return;
      case 'translating':
        this.translate(p);
        return;
      case 'resizing':
        this.resize(p);
        return;
      case 'rotating':
        this.rotate(p);
        return;
      case 'endpoint':
        this.moveEndpoint(p);
        return;
      case 'brushing':
        this.brush(p);
        return;
    }
  }

  onPointerUp(p: ToolPointer): void {
    const s = this.state;
    const editor = this.editor;
    this.state = { kind: 'idle' };
    switch (s.kind) {
      case 'pointing-node': {
        if (s.start.shiftKey && s.wasSelected) {
          editor.select([s.nodeId], { toggle: true });
          break;
        }
        // Plain click on an already-selected element of a multi-selection selects just that element.
        if (!p.shiftKey && s.wasSelected && editor.selectedIds.length > 1) editor.select([s.nodeId]);
        // Click on an already-selected text starts editing (Canva behaviour).
        const node = editor.store.getNode(s.nodeId);
        if (!p.shiftKey && s.wasSelected && node?.type === 'text' && editor.selectedIds.length === 1) {
          editor.startEditingText(node.id);
        }
        break;
      }
      case 'translating':
      case 'resizing':
      case 'rotating':
      case 'endpoint':
        editor.endGesture();
        break;
      case 'brushing':
        break;
    }
    editor.state.set({ interaction: null, guides: [], marquee: null, feedback: null });
    this.updateHover(p);
  }

  onDoubleClick(p: ToolPointer): void {
    const editor = this.editor;
    const hit = this.hitTest(p.page, false);
    if (!hit) return;
    if (hit.type === 'text') {
      editor.startEditingText(hit.id);
      return;
    }
    if (hit.type === 'group' || hit.type === 'frame') {
      // Enter the container and select the child under the pointer.
      const child = getNodeAtPoint(editor.store, hit.id, p.page, { tolerance: 3 / this.zoom });
      if (child) {
        editor.setFocusedGroup(hit.id);
        editor.select([child.id]);
        if (child.type === 'text') editor.startEditingText(child.id);
      }
    }
  }

  onCancel(): boolean {
    const s = this.state;
    this.state = { kind: 'idle' };
    const editor = this.editor;
    if (s.kind === 'translating' || s.kind === 'resizing' || s.kind === 'rotating' || s.kind === 'endpoint') {
      editor.cancelGesture();
      editor.state.set({ interaction: null, guides: [], feedback: null });
      return true;
    }
    if (s.kind === 'brushing') {
      editor.select(s.before);
      editor.state.set({ interaction: null, marquee: null });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------

  private dragged(a: ToolPointer, b: ToolPointer, threshold = DRAG_THRESHOLD): boolean {
    return Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y) >= threshold;
  }

  /** Hit-tests within the current scope, leaving an entered group when clicking outside it. */
  private hitTest(page: Vec, deep: boolean): NodeRecord | null {
    const editor = this.editor;
    const tolerance = 4 / this.zoom;
    const scope = editor.getScopeId();
    let hit = getNodeAtPoint(editor.store, scope, page, { tolerance, deep });
    if (!hit && scope !== editor.pageId) {
      editor.setFocusedGroup(null);
      hit = getNodeAtPoint(editor.store, editor.pageId, page, { tolerance, deep });
    }
    return hit;
  }

  private updateHover(p: ToolPointer): void {
    const editor = this.editor;
    if (editor.editingTextId) return;
    const handle = hitTestHandles(editor.getSelectionFrame(), p.point);
    const hit = handle ? null : this.hitTest(p.page, p.metaKey || p.ctrlKey);
    editor.state.set({
      hoveredId: hit && !editor.selectedIds.includes(hit.id) ? hit.id : null,
      cursor: handle
        ? handle.cursor
        : hit && editor.selectedIds.includes(hit.id) && editor.isEditable(hit.id)
          ? 'move'
          : 'default',
    });
  }

  private selectionTopLevel(): NodeRecord[] {
    const editor = this.editor;
    const ids = editor.selectedIds.filter((id) => editor.isEditable(id));
    const set = new Set(ids);
    return ids
      .filter((id) => !editor.store.getAncestors(id).some((a) => set.has(a.id)))
      .map((id) => editor.store.getNode(id)!)
      .filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Translate

  private startTranslate(start: ToolPointer, duplicate: boolean): void {
    const editor = this.editor;
    let nodes = this.selectionTopLevel();
    if (nodes.length === 0) {
      this.state = { kind: 'idle' };
      return;
    }
    editor.beginGesture(duplicate ? 'Duplicate' : 'Move');
    if (duplicate) {
      let copies: Id[] = [];
      editor.updateGesture((tx) => {
        copies = duplicateNodes(
          tx,
          nodes.map((n) => n.id),
          editor.createId,
          { x: 0, y: 0 },
        );
      });
      editor.select(copies);
      nodes = copies.map((id) => editor.store.getNode(id)!);
    }
    const ids = nodes.map((n) => n.id);
    const page = editor.store.getPage(editor.pageId)!;
    const exclude = new Set(ids);
    for (const id of ids) for (const a of editor.store.getAncestors(id)) exclude.add(a.id);
    this.state = {
      kind: 'translating',
      start,
      snapshot: new GestureSnapshot(editor.store, ids),
      initial: nodes,
      bounds: editor.getSelectionBounds(ids)!,
      targets: collectSnapTargets(editor.store, page, exclude),
    };
    editor.state.set({ interaction: 'translating', hoveredId: null, cursor: 'move' });
  }

  private translate(p: ToolPointer): void {
    const s = this.state;
    if (s.kind !== 'translating') return;
    const editor = this.editor;
    let dx = p.page.x - s.start.page.x;
    let dy = p.page.y - s.start.page.y;
    if (p.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let guides: ReturnType<typeof snapMovingBox>['guides'] = [];
    if (editor.state.get().snapping && !(p.metaKey || p.ctrlKey)) {
      const snapped = snapMovingBox(
        { ...s.bounds, x: s.bounds.x + dx, y: s.bounds.y + dy },
        s.targets,
        SNAP_PX / this.zoom,
      );
      if (!p.shiftKey || dy === 0) dx += snapped.dx;
      if (!p.shiftKey || dx === 0) dy += snapped.dy;
      guides = snapped.guides;
    }
    editor.updateGesture((tx) => {
      s.snapshot.restore(tx);
      translateFrom(tx, s.initial, dx, dy);
    });
    editor.state.set({ guides });
  }

  // ---------------------------------------------------------------------------
  // Handles

  private startHandleGesture(start: ToolPointer, handle: Handle): void {
    const editor = this.editor;
    const nodes = this.selectionTopLevel();
    if (nodes.length === 0) {
      this.state = { kind: 'idle' };
      return;
    }
    const ids = nodes.map((n) => n.id);
    const snapshot = new GestureSnapshot(editor.store, ids);
    if (handle.kind === 'endpoint') {
      editor.beginGesture('Edit line');
      this.state = { kind: 'endpoint', start, snapshot, node: nodes[0]!, which: handle.endpoint! };
      editor.state.set({ interaction: 'endpoint' });
      return;
    }
    if (handle.kind === 'rotate') {
      const pivot =
        nodes.length === 1
          ? getPageCenter(editor.store, nodes[0]!)
          : (() => {
              const b = editor.getSelectionBounds(ids)!;
              return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            })();
      editor.beginGesture('Rotate');
      this.state = {
        kind: 'rotating',
        start,
        snapshot,
        initial: nodes,
        pivot,
        startAngle: Math.atan2(start.page.y - pivot.y, start.page.x - pivot.x),
      };
      editor.state.set({ interaction: 'rotating', cursor: 'grabbing' });
      return;
    }
    editor.beginGesture('Resize');
    this.state = {
      kind: 'resizing',
      start,
      handle: handle.resize!,
      snapshot,
      initial: nodes,
      bounds: editor.getSelectionBounds(ids)!,
    };
    editor.state.set({ interaction: 'resizing', cursor: handle.cursor });
  }

  private resize(p: ToolPointer): void {
    const s = this.state;
    if (s.kind !== 'resizing') return;
    const editor = this.editor;
    const delta = { x: p.page.x - s.start.page.x, y: p.page.y - s.start.page.y };
    const single = s.initial.length === 1 ? s.initial[0]! : null;
    let guides: ReturnType<typeof snapValues>['guides'] = [];
    let feedback = '';

    if (!single || single.type === 'group') {
      // Uniform scale around the opposite corner (or the center with Alt).
      const b = s.bounds;
      const box = resizeLocalBox(b.width, b.height, s.handle, delta, {
        keepAspect: true,
        fromCenter: p.altKey,
        minWidth: 1,
        minHeight: 1,
      });
      const scale = box.width / b.width;
      const anchor = p.altKey
        ? { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        : {
            x: b.x + (s.handle.includes('w') ? b.width : 0),
            y: b.y + (s.handle.startsWith('n') ? b.height : 0),
          };
      editor.updateGesture((tx) => {
        s.snapshot.restore(tx);
        scaleNodesFrom(tx, s.initial, scale, anchor, () => {});
      });
      feedback = `${Math.round(b.width * scale)} × ${Math.round(b.height * scale)}`;
    } else {
      const m = getPageTransform(editor.store, single);
      const local = applyToVector(invert(linearOf(m)), delta);
      const corner = isCornerHandle(s.handle);
      // Images and text always scale proportionally from corners (no distortion);
      // icons/paths do by default (Shift frees them); shapes are free (Shift locks).
      const keepAspect =
        corner && (single.type === 'image' || single.type === 'text')
          ? true
          : corner && single.type === 'path'
            ? !p.shiftKey
            : p.shiftKey;
      let box = resizeLocalBox(single.width, single.height, s.handle, local, {
        keepAspect,
        fromCenter: p.altKey,
        minWidth: 1,
        minHeight: 1,
      });
      // Snap moving edges of axis-aligned top-level elements.
      const axisAligned =
        Math.abs(normalizeDegrees(single.rotation)) < 1e-6 &&
        !single.flipX &&
        !single.flipY &&
        single.parentId === editor.pageId;
      if (axisAligned && editor.state.get().snapping && !keepAspect && !p.altKey) {
        const page = editor.store.getPage(editor.pageId)!;
        const targets = collectSnapTargets(editor.store, page, new Set([single.id]));
        const xs = s.handle.includes('w')
          ? [single.x + box.x]
          : s.handle.includes('e')
            ? [single.x + box.x + box.width]
            : undefined;
        const ys = s.handle.startsWith('n')
          ? [single.y + box.y]
          : s.handle.startsWith('s')
            ? [single.y + box.y + box.height]
            : undefined;
        const snap = snapValues({ x: xs, y: ys }, targets, SNAP_PX / this.zoom);
        if (s.handle.includes('w')) box = { ...box, x: box.x + snap.dx, width: box.width - snap.dx };
        if (s.handle.includes('e')) box = { ...box, width: box.width + snap.dx };
        if (s.handle.startsWith('n')) box = { ...box, y: box.y + snap.dy, height: box.height - snap.dy };
        if (s.handle.startsWith('s')) box = { ...box, height: box.height + snap.dy };
        guides = snap.guides.map((g) => ({
          ...g,
          from: Number.isFinite(g.from) ? g.from : g.axis === 'x' ? single.y : single.x,
          to: Number.isFinite(g.to)
            ? g.to
            : g.axis === 'x'
              ? single.y + single.height
              : single.x + single.width,
        }));
      }
      editor.updateGesture((tx) => {
        s.snapshot.restore(tx);
        if (single.type === 'image' && !corner) {
          const { box: clamped, crop } = resizeImageCrop(single as ImageNode, box);
          tx.update<NodeRecord>(single.id, { ...boxFromLocal(single, clamped), crop } as Partial<NodeRecord>);
        } else if (single.type === 'text' && corner) {
          const scale = box.width / single.width;
          const scaled = scaledProps(single, scale) as Partial<TextNode>;
          tx.update<TextNode>(single.id, {
            ...scaled,
            ...boxFromLocal(single, { ...box, height: single.height * scale }),
          });
        } else if (single.type === 'text') {
          const text = single as TextNode;
          const sizing =
            text.sizing === 'auto-width' && (s.handle === 'e' || s.handle === 'w')
              ? 'auto-height'
              : text.sizing;
          tx.update<TextNode>(single.id, { ...boxFromLocal(single, box), sizing });
        } else {
          tx.update<NodeRecord>(single.id, boxFromLocal(single, box));
        }
      });
      const now = editor.store.getNode(single.id)!;
      feedback = `${Math.round(now.width)} × ${Math.round(now.height)}`;
    }
    editor.state.set({
      guides,
      feedback: { text: feedback, point: { x: p.point.x + 16, y: p.point.y + 16 } },
    });
  }

  private rotate(p: ToolPointer): void {
    const s = this.state;
    if (s.kind !== 'rotating') return;
    const editor = this.editor;
    const angle = Math.atan2(p.page.y - s.pivot.y, p.page.x - s.pivot.x);
    let delta = radToDeg(angle - s.startAngle);
    const base = s.initial.length === 1 ? s.initial[0]!.rotation : 0;
    let target = normalizeDegrees(base + delta);
    if (p.shiftKey) {
      target = normalizeDegrees(Math.round(target / 15) * 15);
    } else {
      // Magnetic snapping to right angles.
      const nearest = Math.round(target / 90) * 90;
      if (Math.abs(target - nearest) < 2.5) target = normalizeDegrees(nearest);
    }
    delta = target - base;
    editor.updateGesture((tx) => {
      s.snapshot.restore(tx);
      rotateNodesFrom(tx, s.initial, delta, s.pivot);
    });
    editor.state.set({
      feedback: { text: `${Math.round(target)}°`, point: { x: p.point.x + 16, y: p.point.y + 16 } },
    });
  }

  private moveEndpoint(p: ToolPointer): void {
    const s = this.state;
    if (s.kind !== 'endpoint') return;
    const editor = this.editor;
    const node = s.node;
    const m = getPageTransform(editor.store, node);
    const fixedLocal =
      s.which === 'start' ? { x: node.width, y: node.height / 2 } : { x: 0, y: node.height / 2 };
    const movingLocal =
      s.which === 'start' ? { x: 0, y: node.height / 2 } : { x: node.width, y: node.height / 2 };
    const fixed = applyToPoint(m, fixedLocal);
    const moving0 = applyToPoint(m, movingLocal);
    let moving = { x: moving0.x + (p.page.x - s.start.page.x), y: moving0.y + (p.page.y - s.start.page.y) };
    if (p.shiftKey) {
      const len = Math.hypot(moving.x - fixed.x, moving.y - fixed.y);
      const a =
        Math.round(Math.atan2(moving.y - fixed.y, moving.x - fixed.x) / (Math.PI / 4)) * (Math.PI / 4);
      moving = { x: fixed.x + Math.cos(a) * len, y: fixed.y + Math.sin(a) * len };
    }
    const start = s.which === 'start' ? moving : fixed;
    const end = s.which === 'start' ? fixed : moving;
    const inv = invert(getParentPageTransform(editor.store, node));
    const a = applyToPoint(inv, start);
    const b = applyToPoint(inv, end);
    const length = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const rotation = normalizeDegrees(radToDeg(Math.atan2(b.y - a.y, b.x - a.x)));
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    editor.updateGesture((tx) => {
      s.snapshot.restore(tx);
      tx.update<NodeRecord>(node.id, {
        x: cx - length / 2,
        y: cy - node.height / 2,
        width: length,
        rotation,
        flipX: false,
        flipY: false,
      });
    });
    editor.state.set({
      feedback: {
        text: `${Math.round(length)} px · ${Math.round(rotation)}°`,
        point: { x: p.point.x + 16, y: p.point.y + 16 },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Marquee

  private brush(p: ToolPointer): void {
    const s = this.state;
    if (s.kind !== 'brushing') return;
    const editor = this.editor;
    const box = boxNormalize({
      x: s.start.page.x,
      y: s.start.page.y,
      width: p.page.x - s.start.page.x,
      height: p.page.y - s.start.page.y,
    });
    const hits = getNodesInBox(editor.store, editor.getScopeId(), box, 'intersect')
      .filter((n) => !n.locked)
      .map((n) => n.id);
    editor.select(s.additive ? [...s.before, ...hits] : hits);
    editor.state.set({ marquee: box });
  }
}
