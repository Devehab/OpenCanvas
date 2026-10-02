/**
 * The OpenCanvas document format (`opencanvas.document`).
 *
 *   {
 *     "format": "opencanvas.document",
 *     "schemaVersion": 1,
 *     "records": [ document, ...pages, ...nodes, ...assets ]   // canonical order
 *   }
 *
 * Binary asset data is not embedded; assets are content-addressed by hash and
 * travel next to the document (see the `.opencanvas` package in @opencanvas/export).
 */
import { generateKeyBetween } from '../fractional-index';
import { createRandomIdGenerator, type IdGenerator } from '../ids';
import { createDocumentRecord, createPageRecord } from '../model/factory';
import { parseRecord, ValidationError } from '../model/schema';
import type { AnyRecord, Fill } from '../model/types';
import { DocumentStore, type StoreOptions } from '../store/store';
import { canonicalStringify } from './canonical';
import { checkAndRepair, type IntegrityIssue } from './integrity';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  type Migration,
  migrateSnapshot,
  type RawSnapshot,
} from './migrations';

export const DOCUMENT_FORMAT = 'opencanvas.document';

export interface DocumentSnapshot {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: number;
  records: AnyRecord[];
}

/** Serializable snapshot of the store in canonical record order. */
export function serializeDocument(store: DocumentStore): DocumentSnapshot {
  return { format: DOCUMENT_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, records: store.getRecords() };
}

/** Deterministic JSON text for a store or snapshot. */
export function stringifyDocument(
  source: DocumentStore | DocumentSnapshot,
  options: { pretty?: boolean } = {},
): string {
  const snapshot = source instanceof DocumentStore ? serializeDocument(source) : source;
  return canonicalStringify(snapshot, options.pretty ?? false);
}

export interface ParseResult {
  snapshot: DocumentSnapshot;
  issues: IntegrityIssue[];
}

export interface ParseOptions {
  migrations?: Record<number, Migration>;
  createId?: IdGenerator;
}

/**
 * Parses untrusted input (JSON text or object) into a validated, migrated and
 * repaired snapshot. Throws {@link ValidationError} for invalid records.
 */
export function parseDocument(input: string | unknown, options: ParseOptions = {}): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      throw new ValidationError('Invalid document: not valid JSON', [{ path: '', message: String(error) }]);
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Invalid document', [{ path: '', message: 'Expected an object' }]);
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== DOCUMENT_FORMAT) {
    throw new ValidationError('Invalid document', [
      { path: 'format', message: `Expected "${DOCUMENT_FORMAT}"` },
    ]);
  }
  if (
    typeof obj.schemaVersion !== 'number' ||
    !Number.isInteger(obj.schemaVersion) ||
    obj.schemaVersion < 1
  ) {
    throw new ValidationError('Invalid document', [
      { path: 'schemaVersion', message: 'Expected a positive integer' },
    ]);
  }
  if (!Array.isArray(obj.records)) {
    throw new ValidationError('Invalid document', [{ path: 'records', message: 'Expected an array' }]);
  }
  const migrated = migrateSnapshot(obj as RawSnapshot, options.migrations ?? MIGRATIONS);
  const records = migrated.records.map((r, i) => parseRecord(r, `records.${i}`));
  const createId = options.createId ?? createRandomIdGenerator();
  const repaired = checkAndRepair(records, () => createId('page'));
  const store = new DocumentStore(repaired.records, { freeze: false });
  return { snapshot: serializeDocument(store), issues: repaired.issues };
}

/** Parses and loads a document into a new store. */
export function loadDocument(
  input: string | unknown,
  options: ParseOptions & StoreOptions = {},
): {
  store: DocumentStore;
  issues: IntegrityIssue[];
} {
  const { snapshot, issues } = parseDocument(input, options);
  return { store: new DocumentStore(snapshot.records, options), issues };
}

export interface NewDocumentOptions {
  title?: string;
  formatId?: string | null;
  width: number;
  height: number;
  pages?: number;
  background?: Fill;
  createId?: IdGenerator;
}

/** Creates a blank design. */
export function createDocumentSnapshot(options: NewDocumentOptions): DocumentSnapshot {
  const createId = options.createId ?? createRandomIdGenerator();
  const records: AnyRecord[] = [
    createDocumentRecord({ title: options.title ?? 'Untitled design', formatId: options.formatId ?? null }),
  ];
  let index: string | null = null;
  for (let i = 0; i < Math.max(1, options.pages ?? 1); i++) {
    index = generateKeyBetween(index, null);
    records.push(
      createPageRecord({
        id: createId('page'),
        index,
        width: options.width,
        height: options.height,
        background: options.background ?? { type: 'solid', color: '#ffffff' },
      }),
    );
  }
  const store = new DocumentStore(records, { freeze: false });
  return serializeDocument(store);
}

export { CURRENT_SCHEMA_VERSION };
