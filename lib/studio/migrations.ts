/**
 * Versioned document migrations. Saved designs are migrated forward on load;
 * a document from a newer schema than this build understands is rejected
 * rather than silently truncated.
 */
import { CURRENT_SCHEMA_VERSION, DesignDocument } from "./schema/document";

export type Migration = { from: number; to: number; run: (raw: Record<string, unknown>) => Record<string, unknown> };

/** Registered migrations, oldest first. Empty while schemaVersion 1 is the first version. */
export const MIGRATIONS: Migration[] = [];

export class MigrationError extends Error {}

export function migrateDocument(raw: unknown, migrations: Migration[] = MIGRATIONS, target = CURRENT_SCHEMA_VERSION): DesignDocument {
  if (!raw || typeof raw !== "object") throw new MigrationError("Design document must be an object.");
  let doc = raw as Record<string, unknown>;
  let v = doc.schemaVersion as number;
  if (typeof doc.schemaVersion !== "number" || !Number.isInteger(v) || v < 1) throw new MigrationError("Design document has no valid schemaVersion.");
  if (v > target) throw new MigrationError(`Design schema v${v} is newer than this build (v${target}).`);
  while (v < target) {
    const m = migrations.find((x) => x.from === v);
    if (!m) throw new MigrationError(`No migration from schema v${v}.`);
    doc = { ...m.run(doc), schemaVersion: m.to };
    v = m.to;
  }
  return DesignDocument.parse(doc);
}
