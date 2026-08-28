import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string(),
  movieId: z.string().uuid().optional(),
  sessionId: z.string().min(1).optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
