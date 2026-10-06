import type { Box, Id, SnapGuide, Vec } from '@opencanvas/core';
import type { Camera } from './camera';

/**
 * How pages are shown: one page (`single`), one page with the thumbnail strip
 * (`thumbnails`), all pages stacked (`scroll`) or an overview (`grid`).
 */
export type PageView = 'single' | 'thumbnails' | 'scroll' | 'grid';

export type ToolId = 'select' | 'hand' | 'text' | 'rect' | 'ellipse' | 'triangle' | 'star' | 'line' | 'frame';

export type InteractionKind =
  | 'translating'
  | 'resizing'
  | 'rotating'
  | 'brushing'
  | 'panning'
  | 'creating'
  | 'endpoint';

export interface Feedback {
  text: string;
  /** Screen position for the badge. */
  point: Vec;
}

export interface EditorUIState {
  pageId: Id;
  selectedIds: Id[];
  hoveredId: Id | null;
  /** Frame that would receive the image being dragged (drawn highlighted). */
  dropTargetId: Id | null;
  /** Group/frame the user has "entered" by double-clicking; clicks select its children. */
  focusedGroupId: Id | null;
  editingTextId: Id | null;
  tool: ToolId;
  camera: Camera;
  viewport: { width: number; height: number };
  snapping: boolean;
  pageView: PageView;
  /** Rulers along the top and left edges (and draggable page guides). */
  rulers: boolean;
  /** Show the current page's ruler guides. */
  showGuides: boolean;
  guides: SnapGuide[];
  marquee: Box | null;
  interaction: InteractionKind | null;
  cursor: string;
  feedback: Feedback | null;
  /** Last user-facing error (invalid action), for toasts. */
  lastError: { message: string; at: number } | null;
}

export interface PointerInput {
  /** Screen point (CSS px relative to the canvas element). */
  point: Vec;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pointerType?: 'mouse' | 'pen' | 'touch';
}

export interface WheelInput {
  point: Vec;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface KeyInput {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}

/** Pointer input enriched with the page-space position. */
export interface ToolPointer extends PointerInput {
  page: Vec;
}

export interface Tool {
  readonly id: ToolId;
  onEnter?(): void;
  onExit?(): void;
  onPointerDown(p: ToolPointer): void;
  onPointerMove(p: ToolPointer): void;
  onPointerUp(p: ToolPointer): void;
  onDoubleClick?(p: ToolPointer): void;
  /** Escape / lost capture. Returns true if something was cancelled. */
  onCancel(): boolean;
}

export interface SelectionState {
  pageId: Id;
  selectedIds: Id[];
}
