/**
 * Built-in commands — the complete Phase 1 editing vocabulary.
 */
import { z } from 'zod';
import { getPageCenter } from '../geometry/transforms';
import type { AnyNodeProps } from '../model/factory';
import {
  AssetRecordSchema,
  FillSchema,
  IdSchema,
  NodeRecordSchema,
  TextContentSchema,
  TextStyleOverridesSchema,
} from '../model/schema';
import type {
  AssetRecord,
  DocumentRecord,
  NodePatch,
  NodeRecord,
  TextContent,
  TextStyle,
} from '../model/types';
import { detachImageFromFrame, placeImageInFrame } from '../operations/frames';
import { groupNodes, reparentNodes, ungroupNodes } from '../operations/group';
import {
  createNodes,
  deleteNodes,
  duplicateNodes,
  insertSubtrees,
  type SubtreeSnapshot,
  updateNodes,
} from '../operations/nodes';
import { movePage, reorderNodes } from '../operations/order';
import { createPage, deletePage, duplicatePage, resizeDesign, updatePage } from '../operations/pages';
import { coverCrop } from '../operations/resize';
import { setTextContent, setTextStyle } from '../operations/text';
import {
  alignNodes,
  distributeNodes,
  flipNodes,
  getSelectionPageBounds,
  rotateNodesFrom,
  setNodeSize,
  setRotation,
  translateNodes,
} from '../operations/transform';
import { type CommandDefinition, CommandError, CommandRegistry } from './registry';

const ids = z.array(IdSchema).min(1).max(10_000);
const finite = z.number();

/** Node props without identity; validated against the full node schema when created. */
const NodePropsSchema: z.ZodType<unknown> = z
  .looseObject({
    type: z.enum(['shape', 'line', 'path', 'text', 'image', 'group', 'frame']),
    children: z.lazy(() => z.array(NodePropsSchema).max(500)).optional(),
  })
  .superRefine(({ children: _children, ...value }, ctx) => {
    const result = NodeRecordSchema.safeParse({
      ...value,
      typeName: 'node',
      id: 'node_validate',
      parentId: 'page_validate',
      index: 'a0',
    });
    if (!result.success) {
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  });

export const nodeCreate: CommandDefinition<{
  parentId: string;
  nodes: AnyNodeProps[];
  aboveId?: string | null;
}> = {
  id: 'node.create',
  label: (p) => (p.nodes.length === 1 ? `Add ${p.nodes[0]!.type}` : `Add ${p.nodes.length} elements`),
  description: 'Creates elements inside a page, group or frame (on top by default).',
  schema: z.object({
    parentId: IdSchema,
    nodes: z.array(NodePropsSchema).min(1).max(1000) as unknown as z.ZodType<AnyNodeProps[]>,
    aboveId: IdSchema.nullable().optional(),
  }),
  run({ tx, createId }, p) {
    const created = createNodes(tx, p.parentId, p.nodes, { createId, aboveId: p.aboveId ?? null });
    return { select: created.map((n) => n.id) };
  },
};

export const nodeUpdate: CommandDefinition<{ ids: string[]; patch: Record<string, unknown> }> = {
  id: 'node.update',
  label: 'Edit',
  description: 'Sets properties on elements. The result is re-validated.',
  schema: z.object({ ids, patch: z.record(z.string(), z.unknown()) }),
  run({ tx }, p) {
    updateNodes(tx, p.ids, p.patch as NodePatch);
    return undefined;
  },
};

export const nodeDelete: CommandDefinition<{ ids: string[] }> = {
  id: 'node.delete',
  label: 'Delete',
  schema: z.object({ ids }),
  run({ tx }, p) {
    deleteNodes(tx, p.ids);
    return { select: [] };
  },
};

export const nodeTranslate: CommandDefinition<{ ids: string[]; dx: number; dy: number }> = {
  id: 'node.translate',
  label: 'Move',
  schema: z.object({ ids, dx: finite, dy: finite }),
  run({ tx }, p) {
    translateNodes(tx, p.ids, p.dx, p.dy);
    return undefined;
  },
};

export const nodeSetSize: CommandDefinition<{
  id: string;
  width?: number;
  height?: number;
  keepAspect?: boolean;
}> = {
  id: 'node.set-size',
  label: 'Resize',
  schema: z.object({
    id: IdSchema,
    width: z.number().positive().optional(),
    height: z.number().min(0).optional(),
    keepAspect: z.boolean().optional(),
  }),
  run({ tx }, p) {
    setNodeSize(tx, p.id, { width: p.width, height: p.height }, { keepAspect: p.keepAspect });
    return undefined;
  },
};

export const nodeSetRotation: CommandDefinition<{ ids: string[]; rotation: number }> = {
  id: 'node.set-rotation',
  label: 'Rotate',
  schema: z.object({ ids, rotation: finite }),
  run({ tx }, p) {
    setRotation(tx, p.ids, p.rotation);
    return undefined;
  },
};

export const nodeRotateBy: CommandDefinition<{ ids: string[]; angle: number }> = {
  id: 'node.rotate-by',
  label: 'Rotate',
  description: 'Rotates elements as a whole around the center of their combined bounds.',
  schema: z.object({ ids, angle: finite }),
  run({ tx }, p) {
    const store = tx.store;
    const nodes = p.ids.map((id) => store.getNode(id)).filter((n): n is NodeRecord => !!n);
    const bounds = getSelectionPageBounds(store, p.ids);
    if (!bounds || nodes.length === 0) return undefined;
    const pivot =
      nodes.length === 1
        ? getPageCenter(store, nodes[0]!)
        : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    rotateNodesFrom(tx, nodes, p.angle, pivot);
    return undefined;
  },
};

export const nodeFlip: CommandDefinition<{ ids: string[]; axis: 'horizontal' | 'vertical' }> = {
  id: 'node.flip',
  label: (p) => (p.axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical'),
  schema: z.object({ ids, axis: z.enum(['horizontal', 'vertical']) }),
  run({ tx }, p) {
    flipNodes(tx, p.ids, p.axis);
    return undefined;
  },
};

export const nodeDuplicate: CommandDefinition<{ ids: string[]; offset?: { x: number; y: number } }> = {
  id: 'node.duplicate',
  label: 'Duplicate',
  schema: z.object({ ids, offset: z.object({ x: finite, y: finite }).optional() }),
  run({ tx, createId }, p) {
    return { select: duplicateNodes(tx, p.ids, createId, p.offset) };
  },
};

export const nodeGroup: CommandDefinition<{ ids: string[] }> = {
  id: 'node.group',
  label: 'Group',
  schema: z.object({ ids: z.array(IdSchema).min(2).max(10_000) }),
  run({ tx, createId }, p) {
    const id = groupNodes(tx, p.ids, createId);
    if (!id)
      throw new CommandError('Select at least two unlocked elements on the same page to group', 'node.group');
    return { select: [id] };
  },
};

export const nodeUngroup: CommandDefinition<{ ids: string[] }> = {
  id: 'node.ungroup',
  label: 'Ungroup',
  schema: z.object({ ids }),
  run({ tx }, p) {
    return { select: ungroupNodes(tx, p.ids) };
  },
};

export const nodeReorder: CommandDefinition<{
  ids: string[];
  direction: 'front' | 'back' | 'forward' | 'backward';
}> = {
  id: 'node.reorder',
  label: (p) =>
    ({ front: 'Bring to front', back: 'Send to back', forward: 'Bring forward', backward: 'Send backward' })[
      p.direction
    ],
  schema: z.object({ ids, direction: z.enum(['front', 'back', 'forward', 'backward']) }),
  run({ tx }, p) {
    reorderNodes(tx, p.ids, p.direction);
    return undefined;
  },
};

export const nodeMoveTo: CommandDefinition<{ ids: string[]; parentId: string; aboveId?: string | null }> = {
  id: 'node.move-to',
  label: 'Move layer',
  description:
    'Moves elements to another parent / position in the layer tree, keeping their visual position.',
  schema: z.object({ ids, parentId: IdSchema, aboveId: IdSchema.nullable().optional() }),
  run({ tx }, p) {
    reparentNodes(tx, p.ids, p.parentId, p.aboveId ?? null);
    return { select: p.ids };
  },
};

export const nodeAlign: CommandDefinition<{
  ids: string[];
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
  relativeTo?: 'selection' | 'page';
}> = {
  id: 'node.align',
  label: (p) => `Align ${p.alignment}`,
  schema: z.object({
    ids,
    alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']),
    relativeTo: z.enum(['selection', 'page']).optional(),
  }),
  run({ tx }, p) {
    const store = tx.store;
    const first = store.getNode(p.ids[0]!);
    const pageId = first ? store.getPageIdOf(first.id) : undefined;
    const page = pageId ? store.getPage(pageId) : undefined;
    const relativeTo = p.relativeTo ?? (p.ids.length === 1 ? 'page' : 'selection');
    const target =
      relativeTo === 'page' && page
        ? { x: 0, y: 0, width: page.width, height: page.height }
        : getSelectionPageBounds(store, p.ids);
    if (target) alignNodes(tx, p.ids, p.alignment, target);
    return undefined;
  },
};

export const nodeDistribute: CommandDefinition<{ ids: string[]; axis: 'horizontal' | 'vertical' }> = {
  id: 'node.distribute',
  label: (p) => (p.axis === 'horizontal' ? 'Distribute horizontally' : 'Distribute vertically'),
  schema: z.object({ ids: z.array(IdSchema).min(3).max(10_000), axis: z.enum(['horizontal', 'vertical']) }),
  run({ tx }, p) {
    distributeNodes(tx, p.ids, p.axis);
    return undefined;
  },
};

export const textSetContent: CommandDefinition<{ id: string; content: TextContent }> = {
  id: 'text.set-content',
  label: 'Edit text',
  schema: z.object({ id: IdSchema, content: TextContentSchema as unknown as z.ZodType<TextContent> }),
  run({ tx }, p) {
    setTextContent(tx, p.id, p.content);
    return undefined;
  },
};

export const textSetStyle: CommandDefinition<{ ids: string[]; style: Partial<TextStyle> }> = {
  id: 'text.set-style',
  label: 'Text style',
  schema: z.object({ ids, style: TextStyleOverridesSchema as unknown as z.ZodType<Partial<TextStyle>> }),
  run({ tx }, p) {
    setTextStyle(tx, p.ids, p.style);
    return undefined;
  },
};

export const imageReplace: CommandDefinition<{ id: string; assetId: string }> = {
  id: 'image.replace',
  label: 'Replace image',
  description: 'Swaps the image while keeping the element box; the new image is center-cropped to fill it.',
  schema: z.object({ id: IdSchema, assetId: IdSchema }),
  run({ tx }, p) {
    const node = tx.getNode(p.id);
    const asset = tx.store.getAsset(p.assetId);
    if (!node || node.type !== 'image' || !asset)
      throw new CommandError('Image or asset not found', 'image.replace');
    updateNodes(tx, [p.id], {
      assetId: asset.id,
      crop: coverCrop(asset.width, asset.height, node.width, node.height),
    } as NodePatch);
    return undefined;
  },
};

export const frameFill: CommandDefinition<{ frameId: string; assetId?: string; imageId?: string }> = {
  id: 'frame.fill',
  label: 'Place image in frame',
  description:
    'Fills a frame with an image (center-cropped to cover it), replacing the image already inside. ' +
    'Pass `assetId` to place a new image, or `imageId` to move an existing image element into the frame.',
  schema: z
    .object({ frameId: IdSchema, assetId: IdSchema.optional(), imageId: IdSchema.optional() })
    .refine((p) => (p.assetId === undefined) !== (p.imageId === undefined), {
      message: 'Pass exactly one of assetId or imageId',
    }),
  run({ tx, createId }, p) {
    try {
      const id = placeImageInFrame(
        tx,
        p.frameId,
        p.imageId ? { imageId: p.imageId } : { assetId: p.assetId! },
        createId,
      );
      return { select: [id] };
    } catch (error) {
      throw new CommandError((error as Error).message, 'frame.fill');
    }
  },
};

export const frameDetach: CommandDefinition<{ frameId: string }> = {
  id: 'frame.detach',
  label: 'Detach image',
  description: 'Takes the image out of a frame, keeping its position and size on the page.',
  schema: z.object({ frameId: IdSchema }),
  run({ tx }, p) {
    const id = detachImageFromFrame(tx, p.frameId);
    if (!id) throw new CommandError('The frame has no image', 'frame.detach');
    return { select: [id] };
  },
};

export const assetAdd: CommandDefinition<{ asset: AssetRecord }> = {
  id: 'asset.add',
  label: 'Add asset',
  schema: z.object({ asset: AssetRecordSchema as unknown as z.ZodType<AssetRecord> }),
  run({ tx }, p) {
    if (!tx.store.has(p.asset.id)) tx.put(p.asset);
    return undefined;
  },
};

export const pageCreate: CommandDefinition<{
  afterId?: string | null;
  width?: number;
  height?: number;
  name?: string;
}> = {
  id: 'page.create',
  label: 'Add page',
  schema: z.object({
    afterId: IdSchema.nullable().optional(),
    width: z.number().min(1).max(10_000).optional(),
    height: z.number().min(1).max(10_000).optional(),
    name: z.string().max(256).optional(),
  }),
  run({ tx, createId }, p) {
    const page = createPage(tx, {
      createId,
      afterId: p.afterId ?? null,
      width: p.width,
      height: p.height,
      name: p.name,
    });
    return { pageId: page.id, select: [] };
  },
};

export const pageDuplicate: CommandDefinition<{ id: string }> = {
  id: 'page.duplicate',
  label: 'Duplicate page',
  schema: z.object({ id: IdSchema }),
  run({ tx, createId }, p) {
    const page = duplicatePage(tx, p.id, createId);
    return page ? { pageId: page.id, select: [] } : undefined;
  },
};

export const pageDelete: CommandDefinition<{ id: string }> = {
  id: 'page.delete',
  label: 'Delete page',
  schema: z.object({ id: IdSchema }),
  run({ tx }, p) {
    const pages = tx.store.getPageIds();
    const pos = pages.indexOf(p.id);
    if (!deletePage(tx, p.id)) throw new CommandError('A design needs at least one page', 'page.delete');
    const remaining = tx.store.getPageIds();
    return { pageId: remaining[Math.max(0, Math.min(pos, remaining.length - 1))], select: [] };
  },
};

export const pageMove: CommandDefinition<{ id: string; position: number }> = {
  id: 'page.move',
  label: 'Move page',
  schema: z.object({ id: IdSchema, position: z.number().int().min(0) }),
  run({ tx }, p) {
    movePage(tx, p.id, p.position);
    return { pageId: p.id };
  },
};

export const pageUpdate: CommandDefinition<{
  id: string;
  patch: { name?: string; background?: unknown; notes?: string };
}> = {
  id: 'page.update',
  label: 'Edit page',
  schema: z.object({
    id: IdSchema,
    patch: z.object({
      name: z.string().max(256).optional(),
      background: FillSchema.optional(),
      notes: z.string().optional(),
    }),
  }) as unknown as z.ZodType<{ id: string; patch: { name?: string; background?: unknown; notes?: string } }>,
  run({ tx }, p) {
    updatePage(tx, p.id, p.patch as never);
    return undefined;
  },
};

export const documentRename: CommandDefinition<{ title: string }> = {
  id: 'document.rename',
  label: 'Rename design',
  schema: z.object({ title: z.string().max(256) }),
  run({ tx }, p) {
    const doc = tx.get<DocumentRecord>('document');
    if (doc) tx.put({ ...doc, title: p.title.trim() || 'Untitled design' });
    return undefined;
  },
};

export const documentResize: CommandDefinition<{ width: number; height: number; mode?: 'scale' | 'keep' }> = {
  id: 'document.resize',
  label: 'Resize design',
  schema: z.object({
    width: z.number().min(1).max(10_000),
    height: z.number().min(1).max(10_000),
    mode: z.enum(['scale', 'keep']).optional(),
  }),
  run({ tx }, p) {
    resizeDesign(tx, p.width, p.height, p.mode ?? 'scale');
    return undefined;
  },
};

export const clipboardPaste: CommandDefinition<{
  snapshot: SubtreeSnapshot;
  parentId: string;
  offset?: { x: number; y: number };
}> = {
  id: 'clipboard.paste',
  label: 'Paste',
  schema: z.object({
    snapshot: z.object({
      rootIds: z.array(IdSchema).max(10_000),
      nodes: z.array(z.unknown()).max(50_000),
      assets: z.array(z.unknown()).max(5_000),
    }),
    parentId: IdSchema,
    offset: z.object({ x: finite, y: finite }).optional(),
  }) as unknown as z.ZodType<{
    snapshot: SubtreeSnapshot;
    parentId: string;
    offset?: { x: number; y: number };
  }>,
  run({ tx, createId }, p) {
    // Clipboard content is untrusted: validate every record.
    const nodes = p.snapshot.nodes.map((n) => NodeRecordSchema.parse(n) as NodeRecord);
    const assets = p.snapshot.assets.map((a) => AssetRecordSchema.parse(a) as AssetRecord);
    const snapshot: SubtreeSnapshot = { rootIds: p.snapshot.rootIds, nodes, assets };
    const known = new Set(nodes.map((n) => n.id));
    if (!snapshot.rootIds.every((id) => known.has(id)))
      throw new CommandError('Clipboard roots are missing', 'clipboard.paste');
    return { select: insertSubtrees(tx, snapshot, { createId, parentId: p.parentId, offset: p.offset }) };
  },
};

export const BUILTIN_COMMANDS = [
  nodeCreate,
  nodeUpdate,
  nodeDelete,
  nodeTranslate,
  nodeSetSize,
  nodeSetRotation,
  nodeRotateBy,
  nodeFlip,
  nodeDuplicate,
  nodeGroup,
  nodeUngroup,
  nodeReorder,
  nodeMoveTo,
  nodeAlign,
  nodeDistribute,
  textSetContent,
  textSetStyle,
  imageReplace,
  frameFill,
  frameDetach,
  assetAdd,
  pageCreate,
  pageDuplicate,
  pageDelete,
  pageMove,
  pageUpdate,
  documentRename,
  documentResize,
  clipboardPaste,
] as const;

export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const command of BUILTIN_COMMANDS) registry.register(command as CommandDefinition<unknown>);
  return registry;
}
