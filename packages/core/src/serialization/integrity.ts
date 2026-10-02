/**
 * Structural integrity checks and repair for loaded documents.
 */
import { generateKeyBetween } from '../fractional-index';
import { createDocumentRecord, createPageRecord } from '../model/factory';
import { LIMITS } from '../model/limits';
import { type AnyRecord, type Id, isContainer, type NodeRecord } from '../model/types';

export interface IntegrityIssue {
  id: Id | null;
  message: string;
  repaired: boolean;
}

/**
 * Checks references and structure; returns repaired records plus the issues found.
 * Repairs: missing document/page records are created; nodes with missing or
 * invalid parents, cycles or excessive depth are dropped (with their subtrees).
 */
export function checkAndRepair(
  records: readonly AnyRecord[],
  createPageId: () => Id = () => 'page_1',
): {
  records: AnyRecord[];
  issues: IntegrityIssue[];
} {
  const issues: IntegrityIssue[] = [];
  const byId = new Map<Id, AnyRecord>();
  for (const r of records) {
    if (byId.has(r.id)) {
      issues.push({ id: r.id, message: 'Duplicate record id; keeping the first', repaired: true });
      continue;
    }
    byId.set(r.id, r);
  }
  if (!byId.has('document')) {
    byId.set('document', createDocumentRecord());
    issues.push({ id: 'document', message: 'Missing document record', repaired: true });
  }
  const pages = [...byId.values()].filter((r) => r.typeName === 'page');
  if (pages.length === 0) {
    const page = createPageRecord({ id: createPageId(), index: generateKeyBetween(null, null) });
    byId.set(page.id, page);
    issues.push({ id: page.id, message: 'Document had no pages; added one', repaired: true });
  }
  if (pages.length > LIMITS.maxPages)
    throw new Error(`Too many pages (${pages.length} > ${LIMITS.maxPages})`);

  const nodes = [...byId.values()].filter((r): r is NodeRecord => r.typeName === 'node');
  if (nodes.length > LIMITS.maxNodes)
    throw new Error(`Too many elements (${nodes.length} > ${LIMITS.maxNodes})`);

  // Resolve each node's chain to a page; drop anything that does not resolve.
  const valid = new Map<Id, boolean>();
  const resolve = (node: NodeRecord): boolean => {
    const known = valid.get(node.id);
    if (known !== undefined) return known;
    const seen = new Set<Id>();
    let current: NodeRecord = node;
    let depth = 0;
    let ok = false;
    for (;;) {
      if (seen.has(current.id)) break; // cycle
      seen.add(current.id);
      depth++;
      if (depth > LIMITS.maxNestingDepth) break;
      const parent = byId.get(current.parentId);
      if (!parent) break;
      if (parent.typeName === 'page') {
        ok = true;
        break;
      }
      if (!isContainer(parent)) break;
      const parentValid = valid.get(parent.id);
      if (parentValid !== undefined) {
        ok = parentValid;
        break;
      }
      current = parent;
    }
    // Every node on the walked chain shares the outcome of the chain.
    for (const id of seen) valid.set(id, ok);
    return ok;
  };
  for (const node of nodes) {
    if (!resolve(node)) {
      byId.delete(node.id);
      issues.push({
        id: node.id,
        message: 'Element with missing/invalid parent, cycle or excessive nesting removed',
        repaired: true,
      });
    }
  }
  // Second pass: anything whose ancestor was removed is removed too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of byId.values()) {
      if (r.typeName === 'node' && !byId.has(r.parentId)) {
        byId.delete(r.id);
        issues.push({ id: r.id, message: 'Element whose parent was removed', repaired: true });
        changed = true;
      }
    }
  }
  const assets = new Set([...byId.values()].filter((r) => r.typeName === 'asset').map((r) => r.id));
  if (assets.size > LIMITS.maxAssets) throw new Error(`Too many assets (${assets.size})`);
  for (const r of byId.values()) {
    if (r.typeName === 'node' && r.type === 'image' && !assets.has(r.assetId)) {
      issues.push({ id: r.id, message: `Image references missing asset ${r.assetId}`, repaired: false });
    }
  }
  return { records: [...byId.values()], issues };
}
