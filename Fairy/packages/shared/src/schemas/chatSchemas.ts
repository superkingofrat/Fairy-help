import { z } from "zod";

export const chatActionSchema = z.enum(["return"]);

export const chatRequestSchema = z
  .object({
    message: z.string(),
    movieId: z.string().uuid().optional(),
    sessionId: z.string().min(1).optional(),
    action: chatActionSchema.optional(),
  })
  .refine((data) => !data.action || data.movieId !== undefined, {
    message: "action requires movieId",
    path: ["movieId"],
  });

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
