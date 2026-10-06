/**
 * Page layout for the scroll view: pages stacked vertically, centered on the
 * current page's axis, with a gap that stays the same on screen (room for
 * each page's header) at any zoom.
 *
 * Offsets are relative to the current page's origin, so the editor keeps
 * working in the current page's coordinates and the camera never jumps when
 * another page becomes current.
 */
import type { Box, DocumentStore, Id, Vec } from '@opencanvas/core';
import type { Camera } from './camera';

/** Screen pixels between pages (holds the page header). */
export const PAGE_GAP_PX = 64;

export interface PageSlot {
  pageId: Id;
  /** Offset of the page origin from the current page origin, in page units. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function scrollLayout(store: DocumentStore, currentId: Id, zoom: number): PageSlot[] {
  const gap = PAGE_GAP_PX / Math.max(zoom, 1e-6);
  const current = store.getPage(currentId);
  if (!current) return [];
  const slots: PageSlot[] = [];
  let y = 0;
  let currentY = 0;
  for (const id of store.getPageIds()) {
    const page = store.getPage(id)!;
    if (id === currentId) currentY = y;
    slots.push({
      pageId: id,
      x: (current.width - page.width) / 2,
      y,
      width: page.width,
      height: page.height,
    });
    y += page.height + gap;
  }
  for (const slot of slots) slot.y -= currentY;
  return slots;
}

/** Screen rectangle of a slot. */
export function slotScreenRect(camera: Camera, slot: PageSlot): Box {
  return {
    x: camera.x + slot.x * camera.zoom,
    y: camera.y + slot.y * camera.zoom,
    width: slot.width * camera.zoom,
    height: slot.height * camera.zoom,
  };
}

/**
 * The slot "owning" a screen point: the page under it, or the page whose
 * header gap it is in (the gap above a page belongs to that page).
 */
export function slotAtScreenPoint(camera: Camera, slots: readonly PageSlot[], point: Vec): PageSlot | null {
  for (const slot of slots) {
    const r = slotScreenRect(camera, slot);
    if (point.y >= r.y - PAGE_GAP_PX && point.y <= r.y + r.height) return slot;
  }
  return null;
}
