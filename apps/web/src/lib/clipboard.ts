/**
 * System clipboard integration for copy / cut / paste on the canvas.
 * Designs travel as a custom MIME type (plus an HTML fallback and an
 * in-memory copy); pasted content is always re-validated by the paste command.
 */
import type { ClipboardData } from '@opencanvas/editor';

export const CLIPBOARD_MIME = 'application/x-opencanvas+json';
const HTML_MARKER = 'data-opencanvas';

let memory: ClipboardData | null = null;

/** In-memory copy, used by menu commands (which have no clipboard event). */
export function rememberClipboard(data: ClipboardData): void {
  memory = data;
}

export function recallClipboard(): ClipboardData | null {
  return memory;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function writeClipboard(event: ClipboardEvent, data: ClipboardData): void {
  memory = data;
  const json = JSON.stringify(data);
  const dt = event.clipboardData;
  if (!dt) return;
  try {
    dt.setData(CLIPBOARD_MIME, json);
  } catch {
    // Some browsers reject custom types; the HTML fallback below still works.
  }
  dt.setData('text/html', `<meta charset="utf-8"><span ${HTML_MARKER}="${encodeBase64(json)}"></span>`);
  dt.setData('text/plain', data.text || ' ');
  event.preventDefault();
}

function isClipboardData(value: unknown): value is ClipboardData {
  return !!value && typeof value === 'object' && (value as ClipboardData).format === 'opencanvas/clipboard';
}

/** Reads OpenCanvas content from a paste event, if present. */
export function readClipboard(event: ClipboardEvent): ClipboardData | null {
  const dt = event.clipboardData;
  if (!dt) return memory;
  const raw = dt.getData(CLIPBOARD_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isClipboardData(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  const html = dt.getData('text/html');
  const m = html ? new RegExp(`${HTML_MARKER}="([^"]+)"`).exec(html) : null;
  if (m) {
    try {
      const parsed = JSON.parse(decodeBase64(m[1]!));
      if (isClipboardData(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return null;
}
