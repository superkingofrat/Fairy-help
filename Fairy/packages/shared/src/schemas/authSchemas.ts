import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
