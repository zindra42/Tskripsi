import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(1024),
  remember: z.boolean(),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
  confirmation: z.string(),
}).refine((value) => value.newPassword === value.confirmation)
  .refine((value) => value.newPassword !== value.currentPassword);
