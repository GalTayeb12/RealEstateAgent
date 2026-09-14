import { z } from "zod";

export const createOfferSchema = z.object({
  unitTypeId: z.string().min(1, "unitTypeId is required"),
  offeredPrice: z.number({ error: "offeredPrice must be a positive number" }).positive("offeredPrice must be a positive amount"),
  terms: z.string().optional(),
});

const offerActionEnum = z.enum(["accept", "reject", "counter"], {
  error: "action must be accept, reject, or counter",
});

export const devRespondOfferSchema = z
  .object({
    action: offerActionEnum,
    counterPrice: z.number({ error: "counterPrice must be a number" }).positive("counterPrice must be a positive amount").optional(),
    counterTerms: z.string().optional(),
    counterExplanation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "counter") {
      if (data.counterPrice == null) {
        ctx.addIssue({ code: "custom", message: "counterPrice is required for counter action", path: ["counterPrice"] });
      }
      if (!data.counterTerms?.trim()) {
        ctx.addIssue({ code: "custom", message: "counterTerms is required for counter action", path: ["counterTerms"] });
      }
      if (!data.counterExplanation?.trim()) {
        ctx.addIssue({ code: "custom", message: "counterExplanation is required — explain your counter to the buyer", path: ["counterExplanation"] });
      }
    }
  });

export const buyerRespondOfferSchema = z
  .object({
    action: offerActionEnum,
    counterPrice: z.number({ error: "counterPrice must be a number" }).positive("counterPrice must be a positive amount").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "counter" && data.counterPrice == null) {
      ctx.addIssue({ code: "custom", message: "counterPrice is required for counter action", path: ["counterPrice"] });
    }
  });

export const scheduleMeetingSchema = z.object({
  isoString: z.string().min(1, "Missing scheduled time (isoString)"),
  timezone: z.string().optional(),
});
