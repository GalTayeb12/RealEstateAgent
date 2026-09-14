import { z } from "zod";

export const createLeverageGroupSchema = z.object({
  unitTypeId: z.string().min(1, "unitTypeId is required"),
  requestedDiscountPercent: z
    .number({ error: "requestedDiscountPercent must be a number between 0 and 50" })
    .min(0, "requestedDiscountPercent must be between 0 and 50")
    .max(50, "requestedDiscountPercent must be between 0 and 50"),
  requestedTerms: z.string().optional(),
});

const leverageGroupActionEnum = z.enum(["accept", "reject", "counter"], {
  error: "action must be accept, reject, or counter",
});

export const devRespondLeverageGroupSchema = z
  .object({
    action: leverageGroupActionEnum,
    counterDiscountPercent: z
      .number({ error: "counterDiscountPercent must be a number" })
      .min(0)
      .max(100)
      .optional(),
    counterTerms: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "counter") {
      if (data.counterDiscountPercent == null) {
        ctx.addIssue({ code: "custom", message: "counterDiscountPercent is required for counter", path: ["counterDiscountPercent"] });
      }
      if (!data.counterTerms?.trim()) {
        ctx.addIssue({ code: "custom", message: "counterTerms is required for counter", path: ["counterTerms"] });
      }
    }
  });
