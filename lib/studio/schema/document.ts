/**
 * The design document: one per user design. It never contains baseline
 * geometry; it only references the immutable baseline and records what the
 * user changed on top of it.
 */
import { z } from "zod";
import { DesignNode, MaterialRefSchema } from "./nodes";

export const CURRENT_SCHEMA_VERSION = 1;

export const BaselineRef = z.strictObject({
  id: z.string().min(1),
  version: z.number().int().positive(),
  /** Hash of the twin the baseline was derived from (see baseline/fromTwin.ts). */
  twinHash: z.string().min(1),
});
export type BaselineRef = z.infer<typeof BaselineRef>;

/** Per-baseline-entity user changes. Only materials; geometry is never overridden. */
export const SurfaceOverride = z.strictObject({ material: MaterialRefSchema });
export type SurfaceOverride = z.infer<typeof SurfaceOverride>;

export const DesignDocument = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  baseline: BaselineRef,
  name: z.string().default("Untitled design"),
  /** User nodes keyed by id (flat map; hierarchy would use parentId later). */
  nodes: z.record(z.string(), DesignNode).default({}),
  /** Baseline surface id -> material override. */
  overrides: z.record(z.string(), SurfaceOverride).default({}),
});
export type DesignDocument = z.infer<typeof DesignDocument>;

export function emptyDocument(baseline: BaselineRef, name = "Untitled design"): DesignDocument {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, baseline, name, nodes: {}, overrides: {} };
}
