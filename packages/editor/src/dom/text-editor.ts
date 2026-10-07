/**
 * In-place text editor: a contenteditable element laid exactly over the text
 * node (same transform, font, size, line height, letter spacing, direction).
 * Native editing gives us IME, Arabic keyboards, spellcheck, accessibility
 * and selection for free; the model is updated from the DOM on every input.
 */
import {
  type applyStyleToAll,
  getPageTransform,
  multiply,
  type TextNode,
  toCssColor,
  toCssMatrix,
} from '@opencanvas/core';
import { cameraMatrix } from '../camera';
import type { Editor } from '../editor';
import { htmlToTextContent, textContentToHtml } from './rich-text';

export interface TextEditorOptions {
  /** Fallback fonts (must match the canvas measurer). */
  fallbacks: readonly string[];
}

/**
 * Where the caret goes to continue the text: the end of the last text, or
 * before the placeholder <br> of an empty paragraph. Never after the last
 * paragraph's element: Firefox would type there, outside any paragraph
 * (an extra empty line before the new text).
 */
export function caretAtEnd(root: HTMLElement): { node: Node; offset: number } {
  let node: Node = root;
  while (node.lastChild) {
    const last = node.lastChild;
    if (last.nodeName === 'BR') return { node, offset: node.childNodes.length - 1 };
    node = last;
  }
  return node.nodeType === Node.TEXT_NODE
    ? { node, offset: node.nodeValue?.length ?? 0 }
    : { node, offset: node.childNodes.length };
}

export class TextEditorOverlay {
  private element: HTMLDivElement | null = null;
  private nodeId: string | null = null;
  private composing = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly editor: Editor,
    private readonly container: HTMLElement,
    private readonly options: TextEditorOptions,
  ) {
    this.unsubscribe = editor.subscribe(() => this.sync());
  }

  dispose(): void {
    this.unsubscribe();
    this.close();
  }

  private sync(): void {
    const id = this.editor.state.get().editingTextId;
    if (id !== this.nodeId) {
      this.close();
      if (id) this.open(id);
    }
    if (this.element && this.nodeId) this.position();
  }

  private open(id: string): void {
    const node = this.editor.store.getNode(id);
    if (node?.type !== 'text') return;
    this.nodeId = id;
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('aria-label', 'Text');
    el.dataset.testid = 'text-editor';
    el.className = 'oc-text-editor';
    el.innerHTML = textContentToHtml(node.content);
    el.addEventListener('input', this.onInput);
    el.addEventListener('keydown', this.onKeyDown);
    el.addEventListener('paste', this.onPaste);
    el.addEventListener('compositionstart', () => {
      this.composing = true;
    });
    el.addEventListener('compositionend', () => {
      this.composing = false;
      this.onInput();
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.appendChild(el);
    this.element = el;
    this.applyStyles(node);
    this.position();
    el.focus({ preventScroll: true });
    // Place the caret at the end of the text, inside its last paragraph (and run).
    const end = caretAtEnd(el);
    const range = document.createRange();
    range.setStart(end.node, end.offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private close(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.nodeId = null;
  }

  private applyStyles(node: TextNode): void {
    const el = this.element!;
    const s = node.style;
    const families = [s.fontFamily, ...this.options.fallbacks]
      .map((f) => (f.includes(' ') || /\d/.test(f) ? `"${f}"` : f))
      .join(', ');
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transformOrigin: '0 0',
      margin: '0',
      padding: '0',
      border: '0',
      outline: 'none',
      background: 'transparent',
      fontFamily: families,
      fontSize: `${s.fontSize}px`,
      fontWeight: String(s.fontWeight),
      fontStyle: s.fontStyle,
      color: toCssColor(s.color),
      letterSpacing: `${s.letterSpacing / 1000}em`,
      lineHeight: String(node.lineHeight),
      textAlign: node.align,
      textTransform: s.textTransform,
      textDecoration:
        [s.underline ? 'underline' : '', s.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') ||
        'none',
      whiteSpace: node.sizing === 'auto-width' ? 'pre' : 'pre-wrap',
      overflowWrap: 'break-word',
      wordBreak: 'normal',
      caretColor: '#6d5dfc',
      cursor: 'text',
      zIndex: '5',
    } satisfies Partial<CSSStyleDeclaration>);
    if (node.direction !== 'auto') el.dir = node.direction;
    else el.removeAttribute('dir');
  }

  private position(): void {
    const el = this.element;
    const node = this.nodeId ? this.editor.store.getNode(this.nodeId) : null;
    if (!el || node?.type !== 'text') return;
    const s = this.editor.state.get();
    // node local space → page → screen (CSS px relative to the container)
    const m = multiply(cameraMatrix(s.camera, 1), getPageTransform(this.editor.store, node));
    el.style.transform = toCssMatrix(m);
    el.style.width = node.sizing === 'auto-width' ? 'max-content' : `${node.width}px`;
    el.style.minWidth = node.sizing === 'auto-width' ? '1px' : '';
    el.style.height = node.sizing === 'fixed' ? `${node.height}px` : 'auto';
    el.style.paddingRight = '0';
  }

  private readonly onInput = (): void => {
    if (this.composing || !this.element || !this.nodeId) return;
    const node = this.editor.store.getNode(this.nodeId);
    if (node?.type !== 'text') return;
    this.editor.updateEditingText(htmlToTextContent(this.element, node.style));
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.editor.stopEditingText();
      return;
    }
    if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      const command = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase() as 'b' | 'i' | 'u'];
      document.execCommand(command);
      this.onInput();
    }
    // Keep editor shortcuts (undo, delete, arrows…) from reaching the canvas while typing.
    e.stopPropagation();
  };

  /** Pastes plain text only: no foreign HTML, styles or scripts enter the document. */
  private readonly onPaste = (e: ClipboardEvent): void => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };

  /** Applies a style to the whole text node while editing (e.g. from the toolbar). */
  applyStyleToNode(patch: Parameters<typeof applyStyleToAll>[1]): void {
    const node = this.nodeId ? this.editor.store.getNode(this.nodeId) : null;
    if (node?.type !== 'text' || !this.element) return;
    this.editor.execute('text.set-style', { ids: [node.id], style: patch });
    const updated = this.editor.store.getNode(node.id) as TextNode;
    this.applyStyles(updated);
  }
}
