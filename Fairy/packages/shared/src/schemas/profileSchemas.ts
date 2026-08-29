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

export const profileListItemSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  role: z.string(),
  profile: profileSchema.nullable(),
});

export const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

function emptyToNull(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const profileWriteFieldsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  avatarUrl: z.preprocess(emptyToNull, z.string().nullable()),
  styleTags: z.array(z.string()),
  likeGenres: z.array(z.string()),
  avoidFood: z.array(z.string()),
  dietPreference: z.preprocess(emptyToNull, z.string().nullable()),
  travelStyle: z.preprocess(emptyToNull, z.string().nullable()),
});

export const createProfileSchema = profileWriteFieldsSchema.extend({
  userId: z.string().uuid(),
});

export const updateProfileSchema = profileWriteFieldsSchema.partial();

export type ProfileListItem = z.infer<typeof profileListItemSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
