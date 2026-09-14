import { z } from "zod";

export const characterizeSchema = z.object({
  transcriptId: z.string().min(1, "transcriptId is required"),
});

export const transcriptLineSchema = z.object({
  role: z.enum(["user", "agent"], {
    error: 'role must be "user" or "agent"',
  }),
  text: z.string(),
  ts: z.union([z.number(), z.string()]),
});

export const transcriptSchema = z.object({
  lines: z
    .array(transcriptLineSchema)
    .min(1, "lines must be a non-empty array"),
});

export const matchSchema = z.object({
  buyerProfile: z.object({
    expectedScore: z.number({ error: "buyerProfile.expectedScore must be a number" }),
    minAcceptanceScore: z.number({ error: "buyerProfile.minAcceptanceScore must be a number" }),
  }, { error: "buyerProfile is required" }),
  unitTypeIds: z.array(z.string()).optional(),
  aomIds: z.array(z.string()).optional(), // legacy alias
});
