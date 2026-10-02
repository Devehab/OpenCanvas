import type { KeyInput, PointerInput } from '../types';

export function toKeyInput(e: KeyboardEvent): KeyInput {
  return {
    key: e.key,
    code: e.code,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    repeat: e.repeat,
  };
}

export function toPointerInput(e: PointerEvent | MouseEvent, element: Element): PointerInput {
  const rect = element.getBoundingClientRect();
  return {
    point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
    button: e.button,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    pointerType: 'pointerType' in e ? (e.pointerType as PointerInput['pointerType']) : 'mouse',
  };
}

/** True when keyboard events should go to a form field instead of the editor. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target as HTMLElement).tagName) return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file'].includes(type);
  }
  return false;
}
