import { type ClassValue, clsx } from 'clsx';

export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Triggers a browser download for bytes or a blob. */
export function downloadBytes(data: Uint8Array | Blob, fileName: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Human-readable shortcut with platform modifier. */
export function shortcut(keys: string): string {
  return keys
    .replace(/Mod/g, isMac() ? '⌘' : 'Ctrl')
    .replace(/Alt/g, isMac() ? '⌥' : 'Alt')
    .replace(/Shift/g, isMac() ? '⇧' : 'Shift');
}
