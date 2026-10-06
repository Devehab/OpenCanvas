/**
 * "Photo editor": a new design at the photo's size with the photo filling the
 * page, ready to crop, adjust and decorate.
 */
import {
  type AssetRecord,
  createDefaultCommandRegistry,
  createDocumentSnapshot,
  createRandomIdGenerator,
  type DocumentSnapshot,
  DocumentStore,
  executeCommand,
  LIMITS,
  serializeDocument,
} from '@opencanvas/core';

/** Page size for a photo: its pixel size, scaled down to the page limit if needed. */
export function photoPageSize(width: number, height: number): { width: number; height: number } {
  const max = LIMITS.maxPageDimension;
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

export function photoDesignSnapshot(asset: AssetRecord, title: string): DocumentSnapshot {
  const createId = createRandomIdGenerator();
  const size = photoPageSize(asset.width, asset.height);
  const store = new DocumentStore(createDocumentSnapshot({ title, ...size, createId }).records, {
    validate: true,
  });
  const registry = createDefaultCommandRegistry();
  const pageId = store.getPageIds()[0]!;
  executeCommand(store, registry, 'asset.add', { asset }, { createId });
  executeCommand(
    store,
    registry,
    'node.create',
    {
      parentId: pageId,
      nodes: [{ type: 'image', assetId: asset.id, x: 0, y: 0, ...size, name: asset.name }],
    },
    { createId },
  );
  return serializeDocument(store);
}
