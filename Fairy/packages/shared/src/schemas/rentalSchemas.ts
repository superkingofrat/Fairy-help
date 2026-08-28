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
