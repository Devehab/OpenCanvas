/**
 * Document schema migrations.
 *
 * `schemaVersion` increases whenever the record shapes change incompatibly.
 * Each migration upgrades a raw snapshot from version N to N+1. Documents are
 * always migrated BEFORE validation, so validators only know the latest shape.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export interface RawSnapshot {
  format: string;
  schemaVersion: number;
  records: unknown[];
  [key: string]: unknown;
}

export type Migration = (snapshot: RawSnapshot) => RawSnapshot;

/** migrations[n] upgrades version n → n+1. */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrateSnapshot(
  snapshot: RawSnapshot,
  migrations: Record<number, Migration> = MIGRATIONS,
  target = CURRENT_SCHEMA_VERSION,
): RawSnapshot {
  let current = snapshot;
  if (current.schemaVersion > target) {
    throw new Error(
      `This design was created with a newer version of OpenCanvas (schema ${current.schemaVersion}, supported ${target}).`,
    );
  }
  while (current.schemaVersion < target) {
    const migrate = migrations[current.schemaVersion];
    if (!migrate) throw new Error(`No migration from schema version ${current.schemaVersion}`);
    current = { ...migrate(current), schemaVersion: current.schemaVersion + 1 };
  }
  return current;
}
