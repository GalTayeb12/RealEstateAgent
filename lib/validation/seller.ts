import { z } from "zod";

export const sellerRegisterSchema = z.object({
  name: z.string().min(1, "name is required"),
  phone: z.string().min(7, "phone is required"),
  email: z.string().email("valid email required"),
  password: z.string().min(8, "password must be at least 8 characters"),
});
