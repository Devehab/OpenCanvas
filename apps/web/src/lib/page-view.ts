/**
 * Page view preference (single page, thumbnails, scroll, grid). The grid is
 * an overview you open and leave, so leaving it returns to the previous view;
 * the other choices are remembered per browser.
 */
import type { Editor, PageView } from '@opencanvas/editor';

const KEY = 'opencanvas.pageView';
const VIEWS: readonly PageView[] = ['single', 'thumbnails', 'scroll', 'grid'];
let lastView: Exclude<PageView, 'grid'> = 'thumbnails';

export function setPageView(editor: Editor, view: PageView): void {
  if (view !== 'grid') {
    lastView = view;
    try {
      localStorage.setItem(KEY, view);
    } catch {
      // preference only
    }
  }
  editor.setPageView(view);
}

export function toggleGridView(editor: Editor): void {
  setPageView(editor, editor.pageView === 'grid' ? lastView : 'grid');
}

/** Leaves the grid overview (to the view used before it). */
export function leaveGridView(editor: Editor): void {
  if (editor.pageView === 'grid') setPageView(editor, lastView);
}

/** Applies the remembered view when a design opens. */
export function restorePageView(editor: Editor): void {
  try {
    const saved = localStorage.getItem(KEY) as PageView | null;
    if (saved && VIEWS.includes(saved) && saved !== 'grid') {
      lastView = saved;
      editor.setPageView(saved);
    }
  } catch {
    // preference only
  }
}
