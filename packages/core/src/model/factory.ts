/**
 * Record factories. All records are created through the zod schemas so that
 * defaults are filled in consistently and invalid input is rejected early.
 */
import type { IdGenerator } from '../ids';
import { parseNode, parseRecord } from './schema';
import type {
  AssetRecord,
  DistributiveOmit,
  DocumentRecord,
  NodeOfType,
  NodeRecord,
  NodeType,
  PageRecord,
} from './types';

/** Input for creating a node: everything optional except identity and placement. */
export type NodeInit<T extends NodeType = NodeType> = Partial<Omit<NodeOfType<T>, 'typeName' | 'type'>> & {
  id: string;
  parentId: string;
  index: string;
};

/** A node description without identity/placement — what templates, clipboard and AI produce. */
export type NodeProps<T extends NodeType = NodeType> = Partial<
  Omit<NodeOfType<T>, 'typeName' | 'id' | 'parentId' | 'index'>
> & { type: T };

export type AnyNodeProps = { [T in NodeType]: NodeProps<T> }[NodeType];

export function createNodeRecord<T extends NodeType>(type: T, init: NodeInit<T>): NodeOfType<T> {
  return parseNode({ ...init, typeName: 'node', type }) as NodeOfType<T>;
}

export function createPageRecord(
  init: Partial<Omit<PageRecord, 'typeName'>> & { id: string; index: string },
): PageRecord {
  return parseRecord({ ...init, typeName: 'page' }, 'page') as PageRecord;
}

export function createDocumentRecord(
  init: Partial<Omit<DocumentRecord, 'typeName' | 'id'>> = {},
): DocumentRecord {
  return parseRecord({ ...init, typeName: 'document', id: 'document' }, 'document') as DocumentRecord;
}

export function createAssetRecord(
  init: Omit<AssetRecord, 'typeName' | 'id' | 'kind' | 'src' | 'name'> &
    Partial<Pick<AssetRecord, 'id' | 'kind' | 'src' | 'name'>>,
  createId?: IdGenerator,
): AssetRecord {
  const id = init.id ?? createId?.('asset');
  if (!id) throw new Error('createAssetRecord: an id or id generator is required');
  return parseRecord({ ...init, id, typeName: 'asset' }, 'asset') as AssetRecord;
}

/** Strips identity/placement from a node, producing reusable props. */
export function nodeToProps(node: NodeRecord): AnyNodeProps {
  const { typeName: _t, id: _i, parentId: _p, index: _x, ...rest } = node;
  return rest as AnyNodeProps;
}

export type { DistributiveOmit };
