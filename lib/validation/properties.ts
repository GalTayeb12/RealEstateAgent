import { z } from "zod";

// ── Projects ─────────────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1, "name is required"),
  location: z.string().optional(),
  description: z.string().optional(),
  video_url: z.string().url("video_url must be a valid URL").optional(),
  building_3d_url: z.string().url("building_3d_url must be a valid URL").optional(),
  amenities: z.array(z.string()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1, "name cannot be empty").optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  video_url: z.string().url("video_url must be a valid URL").optional().nullable(),
  building_3d_url: z.string().url("building_3d_url must be a valid URL").optional().nullable(),
  amenities: z.array(z.string()).optional(),
});

// ── Unit Types ────────────────────────────────────────────────────────────────

export const createUnitTypeSchema = z
  .object({
    unitLabel: z.string().min(1, "unitLabel is required"),
    eil: z.number({ error: "eil must be a number" }),
    ail: z.number({ error: "ail must be a number" }),
    price: z.number({ error: "price must be a number" }).nonnegative("price must be 0 or greater").optional(),
    quantityTotal: z.number({ error: "quantityTotal must be a number" }).int().positive("quantityTotal must be a positive integer").optional(),
    quantityAvailable: z.number({ error: "quantityAvailable must be a number" }).int().nonnegative("quantityAvailable must be 0 or greater").optional(),
    description: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ail < data.eil) {
      ctx.addIssue({ code: "custom", message: "ail must be ≥ eil", path: ["ail"] });
    }
  });

export const updateUnitTypeSchema = z.object({
  unitLabel: z.string().min(1, "unitLabel cannot be empty").optional(),
  price: z.number({ error: "price must be a number" }).nonnegative("price must be 0 or greater").optional(),
  quantityTotal: z.number({ error: "quantityTotal must be a number" }).int().positive().optional(),
  quantityAvailable: z.number({ error: "quantityAvailable must be a number" }).int().nonnegative().optional(),
  description: z.string().optional(),
  eil: z.number({ error: "eil must be a number" }).optional(),
  ail: z.number({ error: "ail must be a number" }).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  aomStatus: z.enum(["active", "sold", "pending"]).optional(),
});

// ── Legacy AOM endpoints (deprecated, kept for external callers) ─────────────

export const legacyCreateAomSchema = z
  .object({
    unitLabel: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    eil: z.number({ error: "eil must be a number" }),
    ail: z.number({ error: "ail must be a number" }),
    description: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    projectId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.unitLabel && !data.title) {
      ctx.addIssue({ code: "custom", message: "unitLabel is required", path: ["unitLabel"] });
    }
    if (data.ail < data.eil) {
      ctx.addIssue({ code: "custom", message: "ail must be ≥ eil", path: ["ail"] });
    }
  });

export const legacyUpdateAomSchema = z.object({
  unitLabel: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  eil: z.number({ error: "eil must be a number" }).optional(),
  ail: z.number({ error: "ail must be a number" }).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  aomStatus: z.enum(["active", "sold", "pending"]).optional(),
});

// ── Listing Images ────────────────────────────────────────────────────────────

export const createImageSchema = z
  .object({
    type: z.enum(["gallery", "panorama", "floorplan"], {
      error: 'type must be "gallery", "panorama", or "floorplan"',
    }),
    imageData: z
      .string({ error: "imageData is required and must be a base64 data URL" })
      .regex(/^data:/, "imageData must be a base64 data URL"),
    label: z.string().optional(),
    order: z.number({ error: "order must be a number" }).int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "panorama" && !data.label?.trim()) {
      ctx.addIssue({ code: "custom", message: "label is required for panorama type", path: ["label"] });
    }
  });

export const updateImageSchema = z
  .object({
    label: z.string().optional(),
    order: z.number({ error: "order must be a number" }).int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.label === undefined && data.order === undefined) {
      ctx.addIssue({ code: "custom", message: "No updatable fields provided" });
    }
  });
