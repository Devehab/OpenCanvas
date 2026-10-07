/**
 * Camera math. Screen = page × zoom + offset (screen pixels are CSS pixels
 * relative to the canvas element).
 */
import type { Box, Mat, Vec } from '@opencanvas/core';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16];

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function screenToPage(camera: Camera, p: Vec): Vec {
  return { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom };
}

export function pageToScreen(camera: Camera, p: Vec): Vec {
  return { x: p.x * camera.zoom + camera.x, y: p.y * camera.zoom + camera.y };
}

export function cameraMatrix(camera: Camera, dpr = 1): Mat {
  return { a: camera.zoom * dpr, b: 0, c: 0, d: camera.zoom * dpr, e: camera.x * dpr, f: camera.y * dpr };
}

/** Zooms to `zoom` keeping the page point under `screenPoint` fixed. */
export function zoomAt(camera: Camera, screenPoint: Vec, zoom: number): Camera {
  const z = clampZoom(zoom);
  const page = screenToPage(camera, screenPoint);
  return { zoom: z, x: screenPoint.x - page.x * z, y: screenPoint.y - page.y * z };
}

/** Camera that fits `box` (page space) into a viewport with padding. */
export function fitBox(
  box: Box,
  viewport: { width: number; height: number },
  padding = 48,
  maxZoom = 4,
): Camera {
  const availableW = Math.max(1, viewport.width - padding * 2);
  const availableH = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(
    Math.min(availableW / Math.max(1, box.width), availableH / Math.max(1, box.height), maxZoom),
  );
  return {
    zoom,
    x: (viewport.width - box.width * zoom) / 2 - box.x * zoom,
    y: (viewport.height - box.height * zoom) / 2 - box.y * zoom,
  };
}

/** Screen space kept around the content (room for page headers and toolbars). */
export interface CameraMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Keeps the content (page space) in view, like Canva: on an axis where it fits
 * the viewport (inside the margins) it stays centered and cannot be moved;
 * where it is larger, it can be moved only until its edges reach the margins.
 * So the pages can never be scrolled out of sight into empty space.
 */
export function clampCamera(
  camera: Camera,
  content: Box,
  viewport: { width: number; height: number },
  margins: CameraMargins,
): Camera {
  const axis = (offset: number, start: number, size: number, view: number, before: number, after: number) => {
    const extent = size * camera.zoom;
    const screenStart = offset + start * camera.zoom;
    const room = view - before - after;
    const wanted =
      extent <= room
        ? before + (room - extent) / 2
        : Math.min(before, Math.max(view - after - extent, screenStart));
    return offset + (wanted - screenStart);
  };
  return {
    zoom: camera.zoom,
    x: axis(camera.x, content.x, content.width, viewport.width, margins.left, margins.right),
    y: axis(camera.y, content.y, content.height, viewport.height, margins.top, margins.bottom),
  };
}

/** Visible page-space rectangle. */
export function visiblePageRect(camera: Camera, viewport: { width: number; height: number }): Box {
  return {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > zoom + 1e-6) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 1e-6) ?? MIN_ZOOM;
}
