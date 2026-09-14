import { z } from "zod";

export const signContractSchema = z.object({
  signatureDataUrl: z
    .string({ error: "signatureDataUrl is required and must be a data: URI" })
    .min(1, "signatureDataUrl cannot be empty")
    .regex(/^data:/, "signatureDataUrl must be a data: URI"),
  typedName: z
    .string({ error: "typedName is required" })
    .trim()
    .min(1, "typedName cannot be blank"),
});
