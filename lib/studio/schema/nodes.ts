/**
 * Design nodes: everything a user (or the AI) adds to a baseline apartment.
 * Transforms deliberately have no scale: size changes come only from variants,
 * modular configurations or parametric parameters.
 */
import { z } from "zod";
import { CatalogRefSchema } from "./catalog";

export const Transform = z.strictObject({
  x: z.number(),
  y: z.number(),
  /** Height of the item's base above the floor (0 = on the floor). */
  z: z.number().min(0).default(0),
  /** Radians, counter-clockwise, about the vertical axis. */
  rot: z.number().default(0),
});
export type Transform = z.infer<typeof Transform>;

export const MaterialRefSchema = CatalogRefSchema;

const base = {
  id: z.string().min(1),
  label: z.string().optional(),
  locked: z.boolean().default(false),
};

export const ItemNode = z.strictObject({
  ...base,
  kind: z.literal("item"),
  catalog: CatalogRefSchema,
  transform: Transform,
  /** For sizing.mode = "variants". */
  variantId: z.string().optional(),
  /** For sizing.mode = "modular": ordered module ids. */
  modules: z.array(z.string()).optional(),
  /** For sizing.mode = "parametric". */
  params: z.record(z.string(), z.number()).optional(),
  /** slotId -> pinned material. Missing = the asset's default material. */
  slots: z.record(z.string(), MaterialRefSchema).default({}),
});
export type ItemNode = z.infer<typeof ItemNode>;

export const LightNode = z.strictObject({
  ...base,
  kind: z.literal("light"),
  type: z.enum(["point", "spot"]),
  position: z.tuple([z.number(), z.number(), z.number().min(0)]),
  /** Correlated colour temperature, kelvin. */
  kelvin: z.number().min(1500).max(10000).default(2700),
  /** Luminous flux in lumens (ordinary range 100-3000). */
  lumens: z.number().min(0).max(10000).default(800),
});
export type LightNode = z.infer<typeof LightNode>;

/** A conceptual, UNVERIFIED partition proposal. Never construction-approved. */
export const PartitionProposalNode = z.strictObject({
  ...base,
  kind: z.literal("partitionProposal"),
  a: z.tuple([z.number(), z.number()]),
  b: z.tuple([z.number(), z.number()]),
  thickness: z.number().min(0.05).max(0.4).default(0.1),
  height: z.number().positive().optional(),
  note: z.string().optional(),
});
export type PartitionProposalNode = z.infer<typeof PartitionProposalNode>;

/** A conceptual, UNVERIFIED opening proposal in an existing wall. */
export const OpeningProposalNode = z.strictObject({
  ...base,
  kind: z.literal("openingProposal"),
  wallId: z.string().min(1),
  at: z.number(),
  width: z.number().positive(),
  note: z.string().optional(),
});
export type OpeningProposalNode = z.infer<typeof OpeningProposalNode>;

export const DesignNode = z.discriminatedUnion("kind", [ItemNode, LightNode, PartitionProposalNode, OpeningProposalNode]);
export type DesignNode = z.infer<typeof DesignNode>;

export const PROPOSAL_KINDS = ["partitionProposal", "openingProposal"] as const;
export const isProposal = (n: DesignNode): boolean => (PROPOSAL_KINDS as readonly string[]).includes(n.kind);
