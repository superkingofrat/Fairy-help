import { z } from "zod";

export const rentalStatusSchema = z.enum(["ACTIVE", "RETURNED"]);

export const rentalSchema = z.object({
  id: z.string().uuid(),
  movieId: z.string().uuid(),
  userId: z.string().uuid(),
  status: rentalStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const borrowRequestSchema = z.object({
  movieId: z.string().uuid(),
});

export type BorrowRequestInput = z.infer<typeof borrowRequestSchema>;

export const rentalsQuerySchema = z.object({
  status: z.enum(["ACTIVE"]).optional(),
});

export type RentalsQueryInput = z.infer<typeof rentalsQuerySchema>;
