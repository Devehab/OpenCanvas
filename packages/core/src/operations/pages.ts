/**
 * Page operations.
 */
import { generateKeyBetween } from '../fractional-index';
import type { IdGenerator } from '../ids';
import { createPageRecord } from '../model/factory';
import { parseRecord } from '../model/schema';
import type { Fill, Id, NodeRecord, PageRecord } from '../model/types';
import type { Transaction } from '../store/store';
import { insertSubtrees, snapshotSubtrees } from './nodes';
import { safeKeysBetween } from './order';
import { scaledProps } from './transform';

export interface CreatePageOptions {
  createId: IdGenerator;
  /** Insert after this page (default: at the end). */
  afterId?: Id | null;
  name?: string;
  width?: number;
  height?: number;
  background?: Fill;
}

export function createPage(tx: Transaction, options: CreatePageOptions): PageRecord {
  const store = tx.store;
  const pages = store.getPages();
  const reference = options.afterId ? pages.find((p) => p.id === options.afterId) : pages[pages.length - 1];
  const pos = reference ? pages.indexOf(reference) : -1;
  const before = reference ? reference.index : null;
  const after = pos >= 0 && pos + 1 < pages.length ? pages[pos + 1]!.index : null;
  const [index] = safeKeysBetween(before, after, 1);
  const template = reference ?? pages[0];
  return tx.put(
    createPageRecord({
      id: options.createId('page'),
      index: index!,
      name: options.name ?? '',
      width: options.width ?? template?.width ?? 1080,
      height: options.height ?? template?.height ?? 1080,
      background: options.background ?? { type: 'solid', color: '#ffffff' },
    }),
  );
}

/** Duplicates a page and all of its content directly after it. */
export function duplicatePage(tx: Transaction, pageId: Id, createId: IdGenerator): PageRecord | null {
  const store = tx.store;
  const page = store.getPage(pageId);
  if (!page) return null;
  const copy = createPage(tx, {
    createId,
    afterId: pageId,
    name: page.name ? `${page.name} (copy)` : '',
    width: page.width,
    height: page.height,
    background: page.background,
  });
  tx.put({ ...copy, notes: page.notes, meta: page.meta });
  const rootIds = store.getChildIds(pageId);
  if (rootIds.length > 0) {
    insertSubtrees(tx, snapshotSubtrees(store, rootIds), { createId, parentId: copy.id });
  }
  return store.getPage(copy.id)!;
}

/** Deletes a page with its content. The last remaining page cannot be deleted. */
export function deletePage(tx: Transaction, pageId: Id): boolean {
  const store = tx.store;
  if (!store.getPage(pageId) || store.getPageIds().length <= 1) return false;
  for (const id of store.getDescendantIds(pageId)) tx.remove(id);
  tx.remove(pageId);
  return true;
}

export function updatePage(
  tx: Transaction,
  pageId: Id,
  patch: Partial<Omit<PageRecord, 'id' | 'typeName'>>,
): void {
  const page = tx.getPage(pageId);
  if (!page) return;
  tx.put(parseRecord({ ...page, ...patch, id: page.id, typeName: 'page' }, 'page') as PageRecord);
}

/**
 * Resizes every page of the design. `scale` scales the content uniformly to
 * fit the new size and centers it; `keep` leaves content untouched.
 */
export function resizeDesign(
  tx: Transaction,
  width: number,
  height: number,
  mode: 'scale' | 'keep' = 'scale',
): void {
  const store = tx.store;
  for (const page of store.getPages()) {
    if (mode === 'scale') {
      const s = Math.min(width / page.width, height / page.height);
      const ox = (width - page.width * s) / 2;
      const oy = (height - page.height * s) / 2;
      for (const id of store.getDescendantIds(page.id)) {
        const node = store.getNode(id)!;
        const isRoot = node.parentId === page.id;
        tx.put({
          ...node,
          ...(scaledProps(node, s) as Partial<NodeRecord>),
          x: node.x * s + (isRoot ? ox : 0),
          y: node.y * s + (isRoot ? oy : 0),
          width: node.width * s,
          height: node.height * s,
        } as NodeRecord);
      }
    }
    updatePage(tx, page.id, { width, height });
  }
}

/** First page id, creating a page if the document has none. */
export function ensurePage(tx: Transaction, createId: IdGenerator): Id {
  const first = tx.store.getPageIds()[0];
  if (first) return first;
  return tx.put(createPageRecord({ id: createId('page'), index: generateKeyBetween(null, null) })).id;
}
