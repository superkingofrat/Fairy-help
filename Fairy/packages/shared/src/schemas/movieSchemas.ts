import { z } from "zod";
import { MOODS, SCENES } from "../types/movieTypes";

const moodSchema = z.enum(MOODS);
const sceneSchema = z.enum(SCENES);

const tagArraySchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).min(1, "At least one tag required").max(3, "At most 3 tags allowed");

const movieFieldsSchema = z.object({
  title: z.string().min(1, "Title is required"),
  director: z.string().min(1, "Director is required"),
  year: z.number().int().min(1888).max(2100),
  mood: tagArraySchema(moodSchema),
  scene: tagArraySchema(sceneSchema),
  genres: z.array(z.string().min(1)).min(1, "At least one genre required"),
  quote: z.string().nullable().optional(),
  stock: z.number().int().min(0).default(0),
  totalStock: z.number().int().min(0).default(0),
  coverUrl: z.string().url().nullable().optional(),
  description: z.string().default(""),
});

export const createMovieSchema = movieFieldsSchema.refine(
  (data) => data.totalStock >= data.stock,
  { message: "totalStock must be greater than or equal to stock", path: ["totalStock"] }
);

export const updateMovieSchema = movieFieldsSchema.partial();

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
  .refine(
    (data) =>
      Boolean(data.mood?.trim() || data.scene?.trim() || data.keyword?.trim()),
    { message: "At least one of mood, scene, or keyword is required" }
  );

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export type UpdateMovieInput = z.infer<typeof updateMovieSchema>;
export type ListMoviesQuery = z.infer<typeof listMoviesQuerySchema>;
export type SearchMoviesQuery = z.infer<typeof searchMoviesQuerySchema>;
