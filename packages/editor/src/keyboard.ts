/**
 * Keyboard shortcuts. Cmd on macOS and Ctrl elsewhere are treated the same.
 * Returns true when a shortcut was handled.
 */
import type { Editor } from './editor';
import type { KeyInput } from './types';

export interface ShortcutInfo {
  keys: string;
  action: string;
}

/** Documented shortcuts (shown in the UI's help dialog). */
export const SHORTCUTS: readonly ShortcutInfo[] = [
  { keys: 'Mod+Z', action: 'Undo' },
  { keys: 'Mod+Shift+Z / Mod+Y', action: 'Redo' },
  { keys: 'Mod+C / Mod+X / Mod+V', action: 'Copy / Cut / Paste' },
  { keys: 'Mod+D', action: 'Duplicate' },
  { keys: 'Delete / Backspace', action: 'Delete' },
  { keys: 'Mod+A', action: 'Select all' },
  { keys: 'Mod+G / Mod+Shift+G', action: 'Group / Ungroup' },
  { keys: 'Mod+] / Mod+[', action: 'Bring forward / Send backward' },
  { keys: 'Mod+Alt+] / Mod+Alt+[', action: 'Bring to front / Send to back' },
  { keys: 'Arrows (Shift = 10px)', action: 'Nudge' },
  { keys: 'Shift+H / Shift+V', action: 'Flip horizontal / vertical' },
  { keys: 'Mod+Shift+L', action: 'Lock / Unlock' },
  { keys: 'Mod+= / Mod+- / Mod+0', action: 'Zoom in / out / fit' },
  { keys: 'Shift+2', action: 'Zoom to selection' },
  { keys: 'Shift+R', action: 'Show rulers and guides' },
  { keys: 'V T R O L F H', action: 'Select · Text · Rectangle · Ellipse · Line · Frame · Hand' },
  { keys: 'Space + drag', action: 'Pan' },
  { keys: 'Enter / Esc', action: 'Edit text / Exit' },
  { keys: 'Page Up / Page Down', action: 'Previous / next page' },
];

export function handleKeyDown(editor: Editor, k: KeyInput): boolean {
  const mod = k.metaKey || k.ctrlKey;
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
  const state = editor.state.get();

  // While editing text, the DOM editor owns the keyboard except for these.
  if (state.editingTextId) {
    if (key === 'Escape') {
      editor.stopEditingText();
      return true;
    }
    return false;
  }

  if (mod) {
    switch (key) {
      case 'z':
        k.shiftKey ? editor.redo() : editor.undo();
        return true;
      case 'y':
        editor.redo();
        return true;
      case 'a':
        editor.selectAll();
        return true;
      case 'd':
        editor.duplicateSelected();
        return true;
      case 'g':
        k.shiftKey ? editor.ungroupSelected() : editor.groupSelected();
        return true;
      case ']':
        editor.reorderSelected(k.altKey ? 'front' : 'forward');
        return true;
      case '[':
        editor.reorderSelected(k.altKey ? 'back' : 'backward');
        return true;
      case 'l':
        if (k.shiftKey) {
          editor.toggleLockSelected();
          return true;
        }
        return false;
      case '=':
      case '+':
        editor.zoomIn();
        return true;
      case '-':
        editor.zoomOut();
        return true;
      case '0':
        editor.zoomToFit();
        return true;
      case '1':
        editor.zoomTo(1);
        return true;
      default:
        return false;
    }
  }

  switch (key) {
    case 'Escape':
      if (editor.cancelInteraction()) return true;
      if (state.focusedGroupId) {
        const group = state.focusedGroupId;
        editor.setFocusedGroup(null);
        editor.select([group]);
        return true;
      }
      if (state.tool !== 'select') {
        editor.setTool('select');
        return true;
      }
      if (state.selectedIds.length) {
        editor.deselectAll();
        return true;
      }
      return false;
    case 'Delete':
    case 'Backspace':
      editor.deleteSelected();
      return state.selectedIds.length > 0;
    case 'Enter': {
      const only = editor.getOnlySelected();
      if (only?.type === 'text') return editor.startEditingText(only.id);
      if (only && (only.type === 'group' || only.type === 'frame')) {
        const children = editor.store.getChildIds(only.id);
        if (children.length) {
          editor.setFocusedGroup(only.id);
          editor.select([...children]);
        }
        return true;
      }
      return false;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (state.selectedIds.length === 0) return false;
      const step = k.shiftKey ? 10 : 1;
      const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
      editor.nudgeSelected(dx, dy);
      return true;
    }
    case 'PageUp':
      editor.goToPage(-1);
      return true;
    case 'PageDown':
      editor.goToPage(1);
      return true;
    case 'h':
      if (k.shiftKey) {
        editor.flipSelected('horizontal');
        return true;
      }
      editor.setTool('hand');
      return true;
    case 'v':
      if (k.shiftKey) {
        editor.flipSelected('vertical');
        return true;
      }
      editor.setTool('select');
      return true;
    case '@':
    case '2':
      if (k.shiftKey || key === '@') {
        editor.zoomToSelection();
        return true;
      }
      return false;
    case 't':
      editor.setTool('text');
      return true;
    case 'r':
      if (k.shiftKey) {
        editor.state.set({ rulers: !state.rulers });
        return true;
      }
      editor.setTool('rect');
      return true;
    case 'o':
    case 'c':
      editor.setTool('ellipse');
      return true;
    case 'l':
      editor.setTool('line');
      return true;
    case 'f':
      editor.setTool('frame');
      return true;
    default:
      return false;
  }
}
