import { z } from "zod";

export const profileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  avatarUrl: z.string().nullable(),
  styleTags: z.array(z.string()),
  likeGenres: z.array(z.string()),
  avoidFood: z.array(z.string()),
  dietPreference: z.string().nullable(),
  travelStyle: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
