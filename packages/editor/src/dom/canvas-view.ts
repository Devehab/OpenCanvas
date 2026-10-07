/**
 * CanvasView — mounts the editor into a DOM container:
 *
 * - two HiDPI canvases (design scene + interaction overlay), re-rendered on
 *   requestAnimationFrame only when something changed;
 * - pointer, double-click, wheel, pinch (touch + Safari gestures) input;
 * - the in-place text editor;
 * - web font loading and re-measurement.
 *
 * Keyboard shortcuts are attached by the application (it decides focus rules).
 */
import {
  getNodeAtPoint,
  getPageTransform,
  imageFrame,
  multiply,
  type TextMeasurer,
  type Vec,
} from '@opencanvas/core';
import type { Context2D, RenderPlatform, SceneRenderer } from '@opencanvas/renderer';
import { cameraMatrix, visiblePageRect, zoomAt } from '../camera';
import type { Editor } from '../editor';
import { drawOverlay } from '../overlay';
import { slotScreenRect } from '../page-layout';
import { FontWatcher } from './fonts';
import { toPointerInput } from './keys';
import { TextEditorOverlay } from './text-editor';

/** After fonts load, text is measured again after these delays (ms). */
const SETTLE_DELAYS_MS = [250, 1000];

export interface CanvasViewOptions {
  editor: Editor;
  container: HTMLElement;
  renderer: SceneRenderer;
  platform: RenderPlatform;
  measurer: TextMeasurer & { invalidate?: () => void };
  fontFallbacks: readonly string[];
  /** Called on right-click with the screen point (after selection was updated). */
  onContextMenu?: (point: Vec, event: MouseEvent) => void;
  /**
   * The element around the canvas, with what the application shows over it (page
   * headers, rulers, toolbars). Scrolling and pinching over any of it moves the
   * canvas too, so they never stop a scroll halfway. Parts that scroll by
   * themselves opt out with a `data-own-scroll` attribute. Defaults to `container`.
   */
  scrollArea?: HTMLElement;
}

export class CanvasView {
  readonly scene: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  private readonly editor: Editor;
  private readonly container: HTMLElement;
  private dpr = 1;
  private raf = 0;
  private sceneKey = '';
  private sceneDirty = true;
  private overlayDirty = true;
  private readonly textEditor: TextEditorOverlay;
  private readonly fontWatcher: FontWatcher;
  private readonly resizeObserver: ResizeObserver;
  private readonly cleanup: (() => void)[] = [];
  private readonly touches = new Map<number, Vec>();
  private pinch: { distance: number; zoom: number; center: Vec } | null = null;
  private fontCheckTimer: ReturnType<typeof setTimeout> | undefined;
  private fontsLoadedTimer: ReturnType<typeof setTimeout> | undefined;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Text is measured again shortly after fonts loaded (see fontsLoaded). */
  private textSettling = false;
  private lastStoreVersion = -1;
  /** Milliseconds spent in the last scene render (for diagnostics and perf tests). */
  lastRenderMs = 0;
  /** Number of scene redraws so far (diagnostics, tests and benchmarks). */
  sceneRenders = 0;
  private fontCheckPending = false;

  constructor(private readonly options: CanvasViewOptions) {
    this.editor = options.editor;
    this.container = options.container;
    const make = (role: string) => {
      const c = document.createElement('canvas');
      c.dataset.layer = role;
      Object.assign(c.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        display: 'block',
      });
      if (role === 'overlay') c.style.pointerEvents = 'none';
      c.setAttribute('aria-hidden', 'true');
      this.container.appendChild(c);
      return c;
    };
    this.scene = make('scene');
    this.overlay = make('overlay');
    this.textEditor = new TextEditorOverlay(this.editor, this.container, {
      fallbacks: options.fontFallbacks,
    });
    this.fontWatcher = new FontWatcher(this.editor.store, () => this.fontsLoaded());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.listen(this.container, 'pointerdown', this.onPointerDown as EventListener);
    this.listen(this.container, 'pointermove', this.onPointerMove as EventListener);
    this.listen(this.container, 'pointerup', this.onPointerUp as EventListener);
    this.listen(this.container, 'pointercancel', this.onPointerCancel as EventListener);
    this.listen(this.container, 'pointerleave', () => this.editor.state.set({ hoveredId: null }));
    this.listen(this.container, 'dblclick', this.onDoubleClick as EventListener);
    const scrollArea = options.scrollArea ?? this.container;
    this.listen(scrollArea, 'wheel', this.onWheel as EventListener, { passive: false });
    this.listen(this.container, 'contextmenu', this.onContextMenu as EventListener);
    this.listen(scrollArea, 'gesturestart', this.onGestureStart as EventListener);
    this.listen(scrollArea, 'gesturechange', this.onGestureChange as EventListener);
    this.listen(window, 'resize', () => this.resize());
    // A face can finish loading after the check that asked for it (another
    // unicode-range subset, Arabic for example, or a style sheet that arrived
    // late): measure text again whenever any font finishes loading, so text
    // never keeps the line breaks of a fallback font.
    if (typeof document !== 'undefined' && document.fonts && 'addEventListener' in document.fonts) {
      this.listen(document.fonts as unknown as EventTarget, 'loadingdone', () => {
        this.fontCheckPending = true;
        clearTimeout(this.fontsLoadedTimer);
        this.fontsLoadedTimer = setTimeout(() => {
          this.fontCheckPending = false;
          this.fontsLoaded();
        }, 50);
      });
    }

    this.cleanup.push(this.editor.subscribe(() => this.invalidate()));
    this.scheduleFontCheck(0);
    this.invalidate();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.fontCheckTimer);
    clearTimeout(this.fontsLoadedTimer);
    clearTimeout(this.settleTimer);
    this.resizeObserver.disconnect();
    for (const c of this.cleanup.splice(0)) c();
    this.textEditor.dispose();
    this.scene.remove();
    this.overlay.remove();
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  /**
   * Fonts finished loading: measure and draw text again with them, then once
   * more a moment later. Firefox can go on measuring with the fallback face
   * for a short while after a web font loaded (an Arabic heading then kept
   * a second line); measuring unchanged text again changes nothing.
   */
  private fontsLoaded(): void {
    this.remeasureText();
    clearTimeout(this.settleTimer);
    this.textSettling = true;
    let step = 0;
    const again = () => {
      this.remeasureText();
      if (++step < SETTLE_DELAYS_MS.length) this.settleTimer = setTimeout(again, SETTLE_DELAYS_MS[step]);
      else this.textSettling = false;
    };
    this.settleTimer = setTimeout(again, SETTLE_DELAYS_MS[0]);
  }

  private remeasureText(): void {
    this.options.measurer.invalidate?.();
    this.options.renderer.invalidateText(this.options.measurer);
    this.editor.remeasureAllText();
    this.invalidateScene();
  }

  /**
   * New font faces became available (for example fonts the person uploaded):
   * load the ones the design uses, then re-measure and redraw text.
   */
  fontsChanged(): void {
    this.fontWatcher.forget();
    this.scheduleFontCheck(0);
  }

  /** Forces a full scene redraw (e.g. after an image finished loading). */
  invalidateScene(): void {
    this.sceneDirty = true;
    this.schedule();
  }

  private invalidate(): void {
    const s = this.editor.state.get();
    const key = `${this.editor.store.version}|${s.pageId}|${s.pageView}|${s.camera.x},${s.camera.y},${s.camera.zoom}|${s.viewport.width}x${s.viewport.height}|${this.dpr}|${s.editingTextId ?? ''}|${s.croppingId ?? ''}`;
    if (key !== this.sceneKey) {
      this.sceneKey = key;
      this.sceneDirty = true;
    }
    if (this.editor.store.version !== this.lastStoreVersion) {
      this.lastStoreVersion = this.editor.store.version;
      this.scheduleFontCheck(150);
    }
    this.overlayDirty = true;
    this.container.style.cursor = s.cursor;
    this.schedule();
  }

  private scheduleFontCheck(delay: number): void {
    clearTimeout(this.fontCheckTimer);
    this.fontCheckPending = true;
    this.fontCheckTimer = setTimeout(() => {
      void this.fontWatcher.check().finally(() => {
        this.fontCheckPending = false;
      });
    }, delay);
  }

  /** True when no redraw, frame or font check is pending. */
  get idle(): boolean {
    return (
      this.raf === 0 && !this.sceneDirty && !this.overlayDirty && !this.fontCheckPending && !this.textSettling
    );
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    for (const c of [this.scene, this.overlay]) {
      const w = Math.round(width * this.dpr);
      const h = Math.round(height * this.dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    this.editor.setViewport(width, height);
    this.sceneDirty = true;
    this.invalidate();
  }

  /** Renders immediately (normally called from requestAnimationFrame). */
  render(): void {
    if (this.sceneDirty) {
      this.sceneDirty = false;
      const start = performance.now();
      this.renderScene();
      this.lastRenderMs = performance.now() - start;
      this.sceneRenders++;
    }
    if (this.overlayDirty) {
      this.overlayDirty = false;
      drawOverlay(this.overlay.getContext('2d') as Context2D, this.editor, this.dpr);
    }
  }

  private renderScene(): void {
    const ctx = this.scene.getContext('2d') as Context2D;
    const s = this.editor.state.get();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.scene.width, this.scene.height);
    if (s.pageView === 'grid') return; // the overview is drawn by the application
    const { camera } = s;
    const dpr = this.dpr;
    for (const slot of this.editor.getPageSlots()) {
      const rect = slotScreenRect(camera, slot);
      // Pages outside the viewport cost nothing.
      if (
        rect.x > s.viewport.width ||
        rect.y > s.viewport.height ||
        rect.x + rect.width < 0 ||
        rect.y + rect.height < 0
      )
        continue;
      const page = this.editor.store.getPage(slot.pageId);
      if (!page) continue;
      const pageCamera = { zoom: camera.zoom, x: rect.x, y: rect.y };
      // Page card with a soft shadow on the workspace.
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = 24 * dpr;
      ctx.shadowOffsetY = 4 * dpr;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
      ctx.restore();
      const current = slot.pageId === s.pageId;
      this.options.renderer.renderPage(ctx, this.editor.store, slot.pageId, {
        transform: cameraMatrix(pageCamera, dpr),
        viewport: visiblePageRect(pageCamera, s.viewport),
        hiddenIds: current && s.editingTextId ? new Set([s.editingTextId]) : undefined,
        quality: 'interactive',
        framePlaceholders: true,
      });
      if (current && s.croppingId) this.drawCropGhost(ctx, pageCamera);
      if (page.hidden) {
        // Hidden pages are shown faded.
        ctx.save();
        ctx.fillStyle = 'rgba(241, 245, 249, 0.6)';
        ctx.fillRect(rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
        ctx.restore();
      }
    }
  }

  /**
   * Crop mode: the parts of the photo outside the crop box, faded, so you see
   * what you can bring into view.
   */
  private drawCropGhost(ctx: Context2D, camera: { x: number; y: number; zoom: number }): void {
    const node = this.editor.store.getNode(this.editor.state.get().croppingId ?? '');
    if (node?.type !== 'image') return;
    const asset = this.editor.store.getAsset(node.assetId);
    const source = asset ? this.options.renderer.imageFor(asset) : null;
    if (!source) return;
    const image = this.options.renderer.adjustedImages.get(source, node.adjustments, 4096);
    const m = multiply(cameraMatrix(camera, this.dpr), getPageTransform(this.editor.store, node));
    const f = imageFrame(node);
    ctx.save();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.beginPath();
    ctx.rect(f.x, f.y, f.width, f.height);
    ctx.rect(0, 0, node.width, node.height);
    ctx.clip('evenodd');
    ctx.globalAlpha = 0.45;
    ctx.drawImage(image, 0, 0, image.width, image.height, f.x, f.y, f.width, f.height);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Input

  private readonly onPointerDown = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest?.('.oc-text-editor')) return;
    this.container.focus({ preventScroll: true });
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.editor.cancelInteraction();
        this.startPinch();
        return;
      }
    }
    if (this.pinch) return;
    try {
      this.container.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests may not support capture.
    }
    if (e.button === 2) return; // context menu handles right-click
    e.preventDefault();
    this.editor.pointerDown(toPointerInput(e, this.container));
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) {
        this.updatePinch();
        return;
      }
    }
    this.editor.pointerMove(toPointerInput(e, this.container));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    if (this.pinch) {
      if (this.touches.size < 2) this.pinch = null;
      return;
    }
    try {
      this.container.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (e.button === 2) return;
    this.editor.pointerUp(toPointerInput(e, this.container));
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    this.pinch = null;
    this.editor.cancelInteraction();
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest?.('.oc-text-editor')) return;
    this.editor.doubleClick(toPointerInput(e, this.container));
  };

  /** Over something that scrolls by itself (e.g. the page grid), the browser scrolls it. */
  private ownScroll(e: Event): boolean {
    return !!(e.target as Element | null)?.closest?.('[data-own-scroll]');
  }

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.ownScroll(e)) return;
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
    this.editor.wheel({
      point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      deltaX: e.deltaX * scale,
      deltaY: e.deltaY * scale,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
    });
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest?.('.oc-text-editor')) return;
    e.preventDefault();
    const input = toPointerInput(e, this.container);
    // Right-click selects what is under the pointer, keeping an existing selection that contains it.
    const page = this.editor.screenToPage(input.point);
    const hit = getNodeAtPoint(this.editor.store, this.editor.getScopeId(), page, {
      tolerance: 4 / this.editor.state.get().camera.zoom,
    });
    if (!hit) this.editor.deselectAll();
    else if (!this.editor.selectedIds.includes(hit.id)) this.editor.select([hit.id]);
    this.options.onContextMenu?.(input.point, e);
  };

  private startPinch(): void {
    const [a, b] = [...this.touches.values()] as [Vec, Vec];
    const rect = this.container.getBoundingClientRect();
    this.pinch = {
      distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      zoom: this.editor.state.get().camera.zoom,
      center: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
    };
  }

  private updatePinch(): void {
    if (!this.pinch || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()] as [Vec, Vec];
    const rect = this.container.getBoundingClientRect();
    const center = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const camera = this.editor.state.get().camera;
    const zoomed = zoomAt(camera, center, (this.pinch.zoom * distance) / this.pinch.distance);
    this.editor.setCamera({
      ...zoomed,
      x: zoomed.x + center.x - this.pinch.center.x,
      y: zoomed.y + center.y - this.pinch.center.y,
    });
    this.pinch.center = center;
  }

  private gestureZoom = 1;
  private readonly onGestureStart = (e: Event): void => {
    if (this.ownScroll(e)) return;
    e.preventDefault();
    this.gestureZoom = this.editor.state.get().camera.zoom;
  };

  private readonly onGestureChange = (e: Event): void => {
    if (this.ownScroll(e)) return;
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const rect = this.container.getBoundingClientRect();
    this.editor.zoomTo(this.gestureZoom * g.scale, { x: g.clientX - rect.left, y: g.clientY - rect.top });
  };

  /** Applies a style to the text being edited (keeps the DOM editor in sync). */
  applyTextStyle(patch: Record<string, unknown>): void {
    this.textEditor.applyStyleToNode(patch as never);
  }
}
