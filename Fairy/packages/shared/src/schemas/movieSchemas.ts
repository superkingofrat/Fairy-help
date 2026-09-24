import { z } from "zod";
import { MOODS, SCENES } from "../types/movieTypes";

const moodSchema = z.enum(MOODS);
const sceneSchema = z.enum(SCENES);

const tagArraySchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).min(1, "At least one tag required").max(3, "At most 3 tags allowed");

function emptyToNull(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const movieFieldsSchema = z.object({
  title: z.string().min(1, "Title is required"),
  director: z.string().min(1, "Director is required"),
  year: z.coerce.number().int().min(1888).max(2100),
  mood: tagArraySchema(moodSchema),
  scene: tagArraySchema(sceneSchema),
  genres: z.array(z.string().min(1)).min(1, "At least one genre required"),
  quote: z.preprocess(emptyToNull, z.string().nullable().optional()),
  stock: z.coerce.number().int().min(0).default(0),
  totalStock: z.coerce.number().int().min(0).default(0),
  coverUrl: z.preprocess(emptyToNull, z.string().nullable().optional()),
  description: z.string().default(""),
});

export const createMovieSchema = movieFieldsSchema.refine((data) => data.totalStock >= data.stock, {
  message: "totalStock must be greater than or equal to stock",
  path: ["totalStock"],
});

export const updateMovieSchema = movieFieldsSchema.partial();

export const movieDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  director: z.string(),
  year: z.number().int(),
  mood: z.array(moodSchema),
  scene: z.array(sceneSchema),
  genres: z.array(z.string()),
  quote: z.string().nullable(),
  stock: z.number().int().min(0),
  totalStock: z.number().int().min(0),
  coverUrl: z.string().nullable(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MovieDto = z.infer<typeof movieDtoSchema>;

export type MovieWriteField = keyof z.infer<typeof movieFieldsSchema>;

export type ParseCreateMovieResult =
  { success: true; data: CreateMovieInput } | { success: false; fields: MovieWriteField[] };

export function parseCreateMovieInput(input: unknown): ParseCreateMovieResult {
  const result = createMovieSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fields = result.error.issues
    .map((issue) => issue.path[0])
    .filter((field): field is MovieWriteField => typeof field === "string");

  return { success: false, fields: [...new Set(fields)] };
}

export const listMoviesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const searchMoviesQuerySchema = z
  .object({
    mood: z.string().optional(),
    scene: z.string().optional(),
    keyword: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine((data) => Boolean(data.mood?.trim() || data.scene?.trim() || data.keyword?.trim()), {
    message: "At least one of mood, scene, or keyword is required",
  });

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export type UpdateMovieInput = z.infer<typeof updateMovieSchema>;
export type ListMoviesQuery = z.infer<typeof listMoviesQuerySchema>;
export type SearchMoviesQuery = z.infer<typeof searchMoviesQuerySchema>;
