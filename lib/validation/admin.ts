import { z } from "zod";

export const devRegisterSchema = z.object({
  companyName: z.string().min(1, "companyName is required"),
  crn: z.string().min(1, "crn is required"),
  contactName: z.string().min(1, "contactName is required"),
  phone: z.string().min(1, "phone is required"),
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  yearsExperience: z.number({ error: "yearsExperience must be a number" }).nonnegative(),
  completedProjects: z.number({ error: "completedProjects must be a number" }).nonnegative().int(),
  companyDescription: z.string().min(1, "companyDescription is required"),
});

export const adminApproveSchema = z.object({
  action: z.enum(["approve", "reject"], {
    error: "action must be approve or reject",
  }),
});

export const adminUsersQuerySchema = z.object({
  role: z.enum(["buyer", "developer", "admin"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const ledgerQuerySchema = z.object({
  chain: z.enum(["buyer", "seller", "aom_rating"]).optional(),
});
