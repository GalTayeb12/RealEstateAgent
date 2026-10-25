import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    locale: z.enum(["he", "en"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (!("name" in data) && !("phone" in data) && !("locale" in data)) {
      ctx.addIssue({ code: "custom", message: "No updatable fields provided" });
    }
  });
