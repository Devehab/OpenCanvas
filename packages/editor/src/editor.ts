/**
 * Editor — the interactive controller around a DocumentStore.
 *
 *   UI (React)  ──actions/input──▶  Editor  ──commands──▶  DocumentStore
 *        ▲                            │                         │
 *        └────── subscribe ◀── UI state (Atom) + history ◀──────┘
 *
 * The editor never lets the UI framework own document state: React reads
 * snapshots and calls methods. Everything here runs without a DOM, so it is
 * fully unit-testable (see test/editor.test.ts).
 */
import {
  type AnyNodeProps,
  type Box,
  boxUnion,
  CommandError,
  type CommandRegistry,
  type CommandResult,
  createDefaultCommandRegistry,
  createRandomIdGenerator,
  createTextAutosizeFinalizer,
  type DocumentStore,
  executeCommand,
  getNodesPageBounds,
  getPageBounds,
  History,
  type Id,
  type IdGenerator,
  isTextContentEmpty,
  type NodeRecord,
  normalizeGroupsFinalizer,
  remeasureText,
  type SubtreeSnapshot,
  setTextContent,
  snapshotSubtrees,
  type TextContent,
  type TextMeasurer,
  type Transaction,
  ValidationError,
  type Vec,
} from '@opencanvas/core';
import { Atom } from './atom';
import {
  type Camera,
  clampZoom,
  fitBox,
  nextZoomStep,
  pageToScreen,
  screenToPage,
  visiblePageRect,
  zoomAt,
} from './camera';
import { computeSelectionFrame, type SelectionFrame } from './handles';
import { handleKeyDown } from './keyboard';
import { CreateTool } from './tools/create';
import { HandTool } from './tools/hand';
import { SelectTool } from './tools/select';
import type {
  EditorUIState,
  KeyInput,
  PointerInput,
  SelectionState,
  Tool,
  ToolId,
  ToolPointer,
  WheelInput,
} from './types';

export interface EditorOptions {
  store: DocumentStore;
  measurer: TextMeasurer;
  createId?: IdGenerator;
  registry?: CommandRegistry;
  pageId?: Id;
  now?: () => number;
}

export interface ClipboardData {
  format: 'opencanvas/clipboard';
  version: 1;
  sourcePageId: Id;
  snapshot: SubtreeSnapshot;
  /** Plain text of copied text elements (for pasting into other apps). */
  text: string;
}

export class Editor {
  readonly store: DocumentStore;
  readonly history: History<SelectionState>;
  readonly commands: CommandRegistry;
  readonly state: Atom<EditorUIState>;
  readonly measurer: TextMeasurer;
  readonly createId: IdGenerator;
  private readonly tools: Record<ToolId, Tool>;
  private readonly listeners = new Set<() => void>();
  private readonly disposers: (() => void)[] = [];
  private _version = 0;
  private gestureDepth = 0;
  private textSession: { id: Id; batches: number; newNode: boolean } | null = null;
  private pasteCount = 0;
  private lastPasteKey = '';
  readonly now: () => number;

  constructor(options: EditorOptions) {
    this.store = options.store;
    this.measurer = options.measurer;
    this.createId = options.createId ?? createRandomIdGenerator();
    this.commands = options.registry ?? createDefaultCommandRegistry();
    this.now = options.now ?? Date.now;
    const pageId = options.pageId ?? this.store.getPageIds()[0];
    if (!pageId) throw new Error('Editor: the document has no pages');
    this.state = new Atom<EditorUIState>({
      pageId,
      selectedIds: [],
      hoveredId: null,
      dropTargetId: null,
      focusedGroupId: null,
      editingTextId: null,
      tool: 'select',
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 0, height: 0 },
      snapping: true,
      guides: [],
      marquee: null,
      interaction: null,
      cursor: 'default',
      feedback: null,
      lastError: null,
    });
    this.history = new History<SelectionState>(this.store, {
      captureState: () => ({
        pageId: this.state.get().pageId,
        selectedIds: [...this.state.get().selectedIds],
      }),
      restoreState: (s) => this.restoreSelection(s),
      now: this.now,
    });
    this.disposers.push(this.store.addFinalizer(createTextAutosizeFinalizer(this.measurer)));
    this.disposers.push(this.store.addFinalizer(normalizeGroupsFinalizer));
    this.tools = {
      select: new SelectTool(this),
      hand: new HandTool(this),
      text: new CreateTool(this, 'text'),
      rect: new CreateTool(this, 'rect'),
      ellipse: new CreateTool(this, 'ellipse'),
      triangle: new CreateTool(this, 'triangle'),
      star: new CreateTool(this, 'star'),
      line: new CreateTool(this, 'line'),
      frame: new CreateTool(this, 'frame'),
    };
    this.disposers.push(this.store.listen((change) => this.onStoreChange(change.source)));
    this.disposers.push(this.state.subscribe(() => this.notify()));
    this.disposers.push(this.history.listen(() => this.notify()));
  }

  dispose(): void {
    for (const d of this.disposers.splice(0)) d();
    this.history.dispose();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Subscription (for UI bindings)
  // ---------------------------------------------------------------------------

  /** Fires on any document, UI-state or history change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Monotonic counter, changes whenever anything observable changes. */
  get version(): number {
    return this._version;
  }

  private notify(): void {
    this._version++;
    for (const l of [...this.listeners]) l();
  }

  private onStoreChange(source: string): void {
    // Drop references to records that no longer exist (e.g. after undo or remote delete).
    const s = this.state.get();
    const patch: Partial<EditorUIState> = {};
    if (!this.store.getPage(s.pageId)) {
      patch.pageId = this.store.getPageIds()[0] ?? s.pageId;
      patch.focusedGroupId = null;
    }
    const kept = s.selectedIds.filter((id) => this.store.getNode(id));
    if (kept.length !== s.selectedIds.length) patch.selectedIds = kept;
    if (s.hoveredId && !this.store.getNode(s.hoveredId)) patch.hoveredId = null;
    if (s.dropTargetId && !this.store.getNode(s.dropTargetId)) patch.dropTargetId = null;
    if (s.focusedGroupId && !this.store.getNode(s.focusedGroupId)) patch.focusedGroupId = null;
    if (s.editingTextId && !this.store.getNode(s.editingTextId) && source !== 'user') {
      // The edited text disappeared through undo/redo or a remote change.
      this.textSession = null;
      patch.editingTextId = null;
    }
    if (Object.keys(patch).length) this.state.set(patch);
    this.notify();
  }

  private restoreSelection(s: SelectionState): void {
    const pageId = this.store.getPage(s.pageId) ? s.pageId : (this.store.getPageIds()[0] ?? s.pageId);
    this.state.set({
      pageId,
      selectedIds: s.selectedIds.filter(
        (id) => this.store.getNode(id) && this.store.getPageIdOf(id) === pageId,
      ),
      editingTextId: null,
      focusedGroupId: null,
    });
    this.textSession = null;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  get pageId(): Id {
    return this.state.get().pageId;
  }

  get selectedIds(): readonly Id[] {
    return this.state.get().selectedIds;
  }

  getSelectedNodes(): NodeRecord[] {
    return this.selectedIds.map((id) => this.store.getNode(id)).filter((n): n is NodeRecord => !!n);
  }

  getOnlySelected(): NodeRecord | null {
    const nodes = this.getSelectedNodes();
    return nodes.length === 1 ? nodes[0]! : null;
  }

  /** Union of page-space bounds of the selected nodes. */
  getSelectionBounds(ids: readonly Id[] = this.selectedIds): Box | null {
    return getNodesPageBounds(this.store, ids);
  }

  isEditable(id: Id): boolean {
    const node = this.store.getNode(id);
    return !!node && !node.locked && !this.store.getAncestors(id).some((a) => a.locked);
  }

  getSelectionFrame(): SelectionFrame | null {
    const s = this.state.get();
    if (s.editingTextId) return null;
    return computeSelectionFrame(this.store, s.camera, s.selectedIds, (ids) => this.getSelectionBounds(ids));
  }

  /** The container whose children clicks select (page, or the entered group). */
  getScopeId(): Id {
    const s = this.state.get();
    return s.focusedGroupId && this.store.getNode(s.focusedGroupId) ? s.focusedGroupId : s.pageId;
  }

  screenToPage(p: Vec): Vec {
    return screenToPage(this.state.get().camera, p);
  }

  pageToScreen(p: Vec): Vec {
    return pageToScreen(this.state.get().camera, p);
  }

  /** Page-space rectangle currently visible. */
  getVisibleRect(): Box {
    const s = this.state.get();
    return visiblePageRect(s.camera, s.viewport);
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /**
   * Runs a named command as one undoable step and applies the selection/page it
   * returns. User-facing failures (invalid input, impossible actions) are caught
   * and exposed via `state.lastError`; programming errors are rethrown.
   */
  execute(
    commandId: string,
    payload: unknown,
    options: { coalesceKey?: string; label?: string } = {},
  ): CommandResult | null {
    try {
      const label = options.label ?? this.commands.label(commandId, payload);
      return this.history.run(
        () => {
          const { result } = executeCommand(this.store, this.commands, commandId, payload, {
            createId: this.createId,
            measurer: this.measurer,
          });
          const patch: Partial<EditorUIState> = {};
          if (result.pageId && result.pageId !== this.pageId) {
            patch.pageId = result.pageId;
            patch.focusedGroupId = null;
            patch.selectedIds = [];
          }
          if (result.select) patch.selectedIds = result.select.filter((id) => this.store.getNode(id));
          if (Object.keys(patch).length) this.state.set(patch);
          return result;
        },
        { label, coalesceKey: options.coalesceKey },
      );
    } catch (error) {
      if (error instanceof CommandError || error instanceof ValidationError) {
        this.state.set({ lastError: { message: error.message, at: this.now() } });
        return null;
      }
      throw error;
    }
  }

  undo(): void {
    this.cancelInteraction();
    if (this.textSession) this.stopEditingText();
    this.history.undo();
  }

  redo(): void {
    this.cancelInteraction();
    if (this.textSession) this.stopEditingText();
    this.history.redo();
  }

  // ---------------------------------------------------------------------------
  // Gestures (continuous edits recorded as ONE undo step)
  // ---------------------------------------------------------------------------

  beginGesture(label: string): void {
    this.gestureDepth++;
    this.history.beginBatch(label);
  }

  /** Applies one frame of a gesture. */
  updateGesture(fn: (tx: Transaction) => void, label = 'Edit'): void {
    this.store.transact(fn, { source: 'user', label });
  }

  endGesture(label?: string): void {
    if (this.gestureDepth === 0) return;
    this.gestureDepth--;
    this.history.endBatch({ label });
  }

  cancelGesture(): void {
    if (this.gestureDepth === 0) return;
    this.gestureDepth--;
    this.history.cancelBatch();
  }

  get isGesturing(): boolean {
    return this.gestureDepth > 0;
  }

  /** Cancels the active pointer interaction (Escape). */
  cancelInteraction(): boolean {
    return this.tools[this.state.get().tool].onCancel();
  }

  // ---------------------------------------------------------------------------
  // Selection & pages
  // ---------------------------------------------------------------------------

  select(ids: readonly Id[], options: { additive?: boolean; toggle?: boolean } = {}): void {
    const s = this.state.get();
    let next: Id[];
    if (options.toggle) {
      const set = new Set(s.selectedIds);
      for (const id of ids) set.has(id) ? set.delete(id) : set.add(id);
      next = [...set];
    } else if (options.additive) {
      next = [...new Set([...s.selectedIds, ...ids])];
    } else {
      next = [...new Set(ids)];
    }
    next = next.filter((id) => this.store.getNode(id) && this.store.getPageIdOf(id) === s.pageId);
    if (next.length === s.selectedIds.length && next.every((id, i) => id === s.selectedIds[i])) return;
    if (this.textSession && !next.includes(this.textSession.id)) this.stopEditingText();
    this.state.set({ selectedIds: next });
    this.history.markStateChanged();
  }

  deselectAll(): void {
    this.select([]);
  }

  selectAll(): void {
    const scope = this.getScopeId();
    this.select(
      this.store
        .getChildren(scope)
        .filter((n) => n.visible && !n.locked)
        .map((n) => n.id),
    );
  }

  setFocusedGroup(id: Id | null): void {
    this.state.set({ focusedGroupId: id });
  }

  setCurrentPage(pageId: Id, options: { fit?: boolean } = {}): void {
    if (!this.store.getPage(pageId) || pageId === this.pageId) return;
    if (this.textSession) this.stopEditingText();
    this.cancelInteraction();
    this.state.set({ pageId, selectedIds: [], hoveredId: null, focusedGroupId: null });
    this.history.markStateChanged();
    if (options.fit !== false) this.zoomToFit();
  }

  goToPage(offset: 1 | -1): void {
    const ids = this.store.getPageIds();
    const i = ids.indexOf(this.pageId);
    const next = ids[Math.max(0, Math.min(ids.length - 1, i + offset))];
    if (next) this.setCurrentPage(next);
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  setViewport(width: number, height: number): void {
    const prev = this.state.get().viewport;
    if (prev.width === width && prev.height === height) return;
    const first = prev.width === 0 || prev.height === 0;
    this.state.set({ viewport: { width, height } });
    if (first) this.zoomToFit();
  }

  setCamera(camera: Camera): void {
    this.state.set({ camera: { ...camera, zoom: clampZoom(camera.zoom) } });
  }

  panBy(dx: number, dy: number): void {
    const c = this.state.get().camera;
    this.setCamera({ ...c, x: c.x + dx, y: c.y + dy });
  }

  zoomTo(zoom: number, anchor?: Vec): void {
    const s = this.state.get();
    const point = anchor ?? { x: s.viewport.width / 2, y: s.viewport.height / 2 };
    this.setCamera(zoomAt(s.camera, point, zoom));
  }

  zoomIn(anchor?: Vec): void {
    this.zoomTo(nextZoomStep(this.state.get().camera.zoom, 1), anchor);
  }

  zoomOut(anchor?: Vec): void {
    this.zoomTo(nextZoomStep(this.state.get().camera.zoom, -1), anchor);
  }

  zoomToFit(): void {
    const s = this.state.get();
    const page = this.store.getPage(s.pageId);
    if (!page || s.viewport.width === 0) return;
    this.setCamera(fitBox({ x: 0, y: 0, width: page.width, height: page.height }, s.viewport, 40, 2));
  }

  zoomToSelection(): void {
    const s = this.state.get();
    const bounds = this.getSelectionBounds();
    if (!bounds || s.viewport.width === 0) {
      this.zoomToFit();
      return;
    }
    this.setCamera(fitBox(bounds, s.viewport, 80, 4));
  }

  // ---------------------------------------------------------------------------
  // Tools & input
  // ---------------------------------------------------------------------------

  setTool(tool: ToolId): void {
    const current = this.state.get().tool;
    if (current === tool) return;
    this.tools[current].onCancel();
    this.tools[current].onExit?.();
    if (this.textSession) this.stopEditingText();
    this.state.set({ tool, cursor: tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' });
    this.tools[tool].onEnter?.();
  }

  private toToolPointer(p: PointerInput): ToolPointer {
    return { ...p, page: this.screenToPage(p.point) };
  }

  private spacePanning = false;

  private activeTool(): Tool {
    return this.spacePanning ? this.tools.hand : this.tools[this.state.get().tool];
  }

  pointerDown(p: PointerInput): void {
    if (p.button === 1) {
      // Middle mouse button always pans.
      this.spacePanning = true;
    }
    this.activeTool().onPointerDown(this.toToolPointer(p));
  }

  pointerMove(p: PointerInput): void {
    this.activeTool().onPointerMove(this.toToolPointer(p));
  }

  pointerUp(p: PointerInput): void {
    this.activeTool().onPointerUp(this.toToolPointer(p));
    if (p.button === 1) this.spacePanning = false;
  }

  doubleClick(p: PointerInput): void {
    this.activeTool().onDoubleClick?.(this.toToolPointer(p));
  }

  wheel(w: WheelInput): void {
    const s = this.state.get();
    if (w.ctrlKey || w.metaKey) {
      // Pinch-zoom (trackpads report ctrl+wheel) and ctrl+wheel zoom at the cursor.
      const factor = Math.exp(-w.deltaY * 0.01);
      this.setCamera(zoomAt(s.camera, w.point, s.camera.zoom * factor));
      return;
    }
    const dx = w.shiftKey && w.deltaX === 0 ? w.deltaY : w.deltaX;
    const dy = w.shiftKey && w.deltaX === 0 ? 0 : w.deltaY;
    this.panBy(-dx, -dy);
  }

  /** Returns true if the key was handled (the caller should preventDefault). */
  keyDown(k: KeyInput): boolean {
    if (k.key === ' ' && !this.state.get().editingTextId) {
      if (!this.spacePanning) {
        this.spacePanning = true;
        this.state.set({ cursor: 'grab' });
      }
      return true;
    }
    return handleKeyDown(this, k);
  }

  keyUp(k: KeyInput): void {
    if (k.key === ' ' && this.spacePanning) {
      this.spacePanning = false;
      this.state.set({ cursor: this.state.get().tool === 'hand' ? 'grab' : 'default' });
    }
  }

  // ---------------------------------------------------------------------------
  // High-level actions
  // ---------------------------------------------------------------------------

  /**
   * Inserts elements on the current page (or entered group). By default they
   * are centered in the visible part of the page and become the selection.
   */
  insertNodes(props: AnyNodeProps[], options: { at?: Vec; center?: boolean } = {}): Id[] {
    if (props.length === 0) return [];
    const page = this.store.getPage(this.pageId)!;
    const scope = this.getScopeId();
    const bounds = boxUnion(
      props.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0, width: p.width ?? 100, height: p.height ?? 100 })),
    )!;
    let target: Vec | null = options.at ?? null;
    if (!target && options.center !== false) {
      const visible = this.getVisibleRect();
      const pageRect = { x: 0, y: 0, width: page.width, height: page.height };
      const vx0 = Math.max(visible.x, pageRect.x);
      const vy0 = Math.max(visible.y, pageRect.y);
      const vx1 = Math.min(visible.x + visible.width, pageRect.width);
      const vy1 = Math.min(visible.y + visible.height, pageRect.height);
      target =
        vx1 > vx0 && vy1 > vy0
          ? { x: (vx0 + vx1) / 2, y: (vy0 + vy1) / 2 }
          : { x: page.width / 2, y: page.height / 2 };
    }
    let placed = props;
    if (target) {
      const dx = target.x - (bounds.x + bounds.width / 2);
      const dy = target.y - (bounds.y + bounds.height / 2);
      placed = props.map((p) => ({ ...p, x: (p.x ?? 0) + dx, y: (p.y ?? 0) + dy }) as AnyNodeProps);
    }
    // Inserting into an entered group: convert page coordinates to group space.
    if (scope !== this.pageId) {
      const group = this.store.getNode(scope)!;
      const gb = getPageBounds(this.store, group);
      placed = placed.map((p) => ({ ...p, x: (p.x ?? 0) - gb.x, y: (p.y ?? 0) - gb.y }) as AnyNodeProps);
    }
    const result = this.execute('node.create', { parentId: scope, nodes: placed });
    return result?.select ?? [];
  }

  updateSelected(patch: Record<string, unknown>, options: { coalesce?: boolean } = {}): void {
    const ids = this.selectedIds.filter((id) => this.isEditable(id) || 'locked' in patch);
    if (ids.length === 0) return;
    this.execute(
      'node.update',
      { ids, patch },
      {
        coalesceKey: options.coalesce
          ? `update:${Object.keys(patch).sort().join(',')}:${ids.join(',')}`
          : undefined,
      },
    );
  }

  deleteSelected(): void {
    const ids = this.selectedIds.filter((id) => this.isEditable(id));
    if (ids.length) this.execute('node.delete', { ids });
  }

  duplicateSelected(): void {
    if (this.selectedIds.length) this.execute('node.duplicate', { ids: [...this.selectedIds] });
  }

  groupSelected(): void {
    if (this.selectedIds.length >= 2) this.execute('node.group', { ids: [...this.selectedIds] });
  }

  ungroupSelected(): void {
    const groups = this.getSelectedNodes().filter((n) => n.type === 'group');
    if (groups.length) this.execute('node.ungroup', { ids: groups.map((g) => g.id) });
  }

  reorderSelected(direction: 'front' | 'back' | 'forward' | 'backward'): void {
    if (this.selectedIds.length) this.execute('node.reorder', { ids: [...this.selectedIds], direction });
  }

  alignSelected(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    if (this.selectedIds.length) this.execute('node.align', { ids: [...this.selectedIds], alignment });
  }

  distributeSelected(axis: 'horizontal' | 'vertical'): void {
    if (this.selectedIds.length >= 3) this.execute('node.distribute', { ids: [...this.selectedIds], axis });
  }

  flipSelected(axis: 'horizontal' | 'vertical'): void {
    if (this.selectedIds.length) this.execute('node.flip', { ids: [...this.selectedIds], axis });
  }

  toggleLockSelected(): void {
    const nodes = this.getSelectedNodes();
    if (nodes.length === 0) return;
    const lock = !nodes.every((n) => n.locked);
    this.execute(
      'node.update',
      { ids: nodes.map((n) => n.id), patch: { locked: lock } },
      { label: lock ? 'Lock' : 'Unlock' },
    );
  }

  nudgeSelected(dx: number, dy: number): void {
    const ids = this.selectedIds.filter((id) => this.isEditable(id));
    if (ids.length === 0) return;
    this.execute('node.translate', { ids, dx, dy }, { coalesceKey: `nudge:${ids.join(',')}` });
  }

  addPage(): void {
    this.execute('page.create', { afterId: this.pageId });
    this.zoomToFit();
  }

  duplicatePage(id: Id = this.pageId): void {
    this.execute('page.duplicate', { id });
    this.zoomToFit();
  }

  deletePage(id: Id = this.pageId): void {
    this.execute('page.delete', { id });
    this.zoomToFit();
  }

  // ---------------------------------------------------------------------------
  // Text editing session (the DOM editor lives in the UI layer)
  // ---------------------------------------------------------------------------

  /**
   * Enters text editing. `newNode` means the caller already opened a batch for
   * creating the node, so creating + typing is a single undo step and an empty
   * new text box disappears without leaving history behind.
   */
  startEditingText(id: Id, options: { newNode?: boolean } = {}): boolean {
    const node = this.store.getNode(id);
    if (node?.type !== 'text' || !this.isEditable(id)) return false;
    if (this.textSession) this.stopEditingText();
    this.history.beginBatch('Edit text');
    this.textSession = { id, batches: options.newNode ? 2 : 1, newNode: options.newNode === true };
    this.state.set({ editingTextId: id, selectedIds: [id], hoveredId: null });
    return true;
  }

  /** Called by the DOM text editor on every input. */
  updateEditingText(content: TextContent): void {
    const session = this.textSession;
    if (!session) return;
    this.store.transact((tx) => setTextContent(tx, session.id, content), {
      source: 'user',
      label: 'Edit text',
    });
  }

  stopEditingText(): void {
    const session = this.textSession;
    if (!session) return;
    this.textSession = null;
    const node = this.store.getNode(session.id);
    if (node?.type === 'text' && isTextContentEmpty(node.content)) {
      this.store.transact((tx) => tx.remove(session.id), { source: 'user', label: 'Delete empty text' });
    }
    for (let i = 0; i < session.batches; i++) {
      const last = i === session.batches - 1;
      this.history.endBatch({ label: last && session.newNode ? 'Add text' : 'Edit text' });
    }
    this.state.set({
      editingTextId: null,
      selectedIds: this.state.get().selectedIds.filter((sid) => this.store.getNode(sid)),
    });
  }

  get editingTextId(): Id | null {
    return this.textSession?.id ?? null;
  }

  /** Re-measures text after fonts load. Not undoable (source `system`). */
  remeasureAllText(): void {
    const ids = this.store
      .getNodes()
      .filter((n) => n.type === 'text')
      .map((n) => n.id);
    if (ids.length)
      this.store.transact((tx) => remeasureText(tx, ids, this.measurer), {
        source: 'system',
        label: 'Fonts loaded',
      });
  }

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------

  copy(): ClipboardData | null {
    const ids = this.selectedIds;
    if (ids.length === 0) return null;
    const snapshot = snapshotSubtrees(this.store, ids);
    const text = snapshot.nodes
      .filter((n) => n.type === 'text')
      .map((n) =>
        n.type === 'text'
          ? n.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
          : '',
      )
      .join('\n');
    this.pasteCount = 0;
    this.lastPasteKey = '';
    return { format: 'opencanvas/clipboard', version: 1, sourcePageId: this.pageId, snapshot, text };
  }

  cut(): ClipboardData | null {
    const data = this.copy();
    if (data) this.deleteSelected();
    return data;
  }

  /**
   * Pastes into the current page/group. Pasting onto the page the content was
   * copied from offsets each successive paste so copies don't stack invisibly.
   */
  paste(data: ClipboardData): Id[] {
    if (data?.format !== 'opencanvas/clipboard') return [];
    const key = `${data.sourcePageId}:${data.snapshot.rootIds.join(',')}`;
    if (key !== this.lastPasteKey) {
      this.lastPasteKey = key;
      this.pasteCount = 0;
    }
    const scope = this.getScopeId();
    const samePage = data.sourcePageId === this.pageId;
    const stillThere = data.snapshot.rootIds.some((id) => this.store.getNode(id));
    this.pasteCount++;
    const step = samePage && stillThere ? 20 * this.pasteCount : 0;
    const result = this.execute('clipboard.paste', {
      snapshot: data.snapshot,
      parentId: scope,
      offset: { x: step, y: step },
    });
    return result?.select ?? [];
  }

  /** Surfaces an error message to the UI (e.g. a rejected upload). */
  reportError(message: string): void {
    this.state.set({ lastError: { message, at: this.now() } });
  }
}

export type { SelectionState };
