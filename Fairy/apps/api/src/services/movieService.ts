import type { Movie as PrismaMovie, Mood as PrismaMood, Scene as PrismaScene } from "@fairy/database";
import { prisma } from "@fairy/database";
import {
  MOODS,
  SCENES,
  type CreateMovieInput,
  type ListMoviesQuery,
  type Movie,
  type PaginatedMovies,
  type SearchMoviesQuery,
  type UpdateMovieInput,
  type Mood,
  type Scene,
} from "@fairy/shared";

const MOOD_TO_PRISMA: Record<Mood, PrismaMood> = {
  治愈: "HEALING",
  热血: "PASSIONATE",
  悬疑: "SUSPENSE",
  致郁: "MELANCHOLY",
  轻松: "RELAXED",
  浪漫: "ROMANTIC",
};

const PRISMA_TO_MOOD: Record<PrismaMood, Mood> = {
  HEALING: "治愈",
  PASSIONATE: "热血",
  SUSPENSE: "悬疑",
  MELANCHOLY: "致郁",
  RELAXED: "轻松",
  ROMANTIC: "浪漫",
};

const SCENE_TO_PRISMA: Record<Scene, PrismaScene> = {
  雨天: "RAINY_DAY",
  失眠夜: "INSOMNIA",
  周末午后: "WEEKEND_AFTERNOON",
  独自在家: "HOME_ALONE",
  约会夜: "DATE_NIGHT",
  通勤路上: "COMMUTE",
};

const PRISMA_TO_SCENE: Record<PrismaScene, Scene> = {
  RAINY_DAY: "雨天",
  INSOMNIA: "失眠夜",
  WEEKEND_AFTERNOON: "周末午后",
  HOME_ALONE: "独自在家",
  DATE_NIGHT: "约会夜",
  COMMUTE: "通勤路上",
};

function toMovie(record: PrismaMovie): Movie {
  return {
    id: record.id,
    title: record.title,
    director: record.director,
    year: record.year,
    mood: record.moods.map((value: PrismaMood) => PRISMA_TO_MOOD[value]),
    scene: record.scenes.map((value: PrismaScene) => PRISMA_TO_SCENE[value]),
    genres: record.genres,
    quote: record.quote,
    stock: record.stock,
    totalStock: record.totalStock,
    coverUrl: record.coverUrl,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toPrismaMoods(moods: Mood[]): PrismaMood[] {
  return moods.map((mood) => MOOD_TO_PRISMA[mood]);
}

function toPrismaScenes(scenes: Scene[]): PrismaScene[] {
  return scenes.map((scene) => SCENE_TO_PRISMA[scene]);
}

function buildPagination(
  page: number,
  limit: number,
  total: number
): PaginatedMovies["pagination"] {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
  };
}

function parseCsvTags(value: string | undefined, allowed: readonly string[]): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => allowed.includes(tag));
}

export async function listMovies(query: ListMoviesQuery): Promise<PaginatedMovies> {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.movie.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.movie.count(),
  ]);

  return {
    items: items.map(toMovie),
    pagination: buildPagination(page, limit, total),
  };
}

export async function searchMovies(query: SearchMoviesQuery): Promise<PaginatedMovies> {
  const { page, limit, keyword } = query;
  const skip = (page - 1) * limit;

  const moods = toPrismaMoods(parseCsvTags(query.mood, MOODS) as Mood[]);
  const scenes = toPrismaScenes(parseCsvTags(query.scene, SCENES) as Scene[]);

  const where = {
    ...(moods.length > 0 ? { moods: { hasSome: moods } } : {}),
    ...(scenes.length > 0 ? { scenes: { hasSome: scenes } } : {}),
    ...(keyword?.trim()
      ? {
          OR: [
            { title: { contains: keyword.trim(), mode: "insensitive" as const } },
            { director: { contains: keyword.trim(), mode: "insensitive" as const } },
            { description: { contains: keyword.trim(), mode: "insensitive" as const } },
            { quote: { contains: keyword.trim(), mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.movie.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.movie.count({ where }),
  ]);

  return {
    items: items.map(toMovie),
    pagination: buildPagination(page, limit, total),
  };
}

export async function listMoviesForRecommend(
  moods: Mood[],
  scenes: Scene[]
): Promise<Movie[]> {
  const prismaMoods = toPrismaMoods(moods);
  const prismaScenes = toPrismaScenes(scenes);
  const tagFilters = [
    ...(prismaMoods.length > 0 ? [{ moods: { hasSome: prismaMoods } }] : []),
    ...(prismaScenes.length > 0 ? [{ scenes: { hasSome: prismaScenes } }] : []),
  ];

  if (tagFilters.length === 0) {
    return [];
  }

  const records = await prisma.movie.findMany({
    where: {
      stock: { gt: 0 },
      OR: tagFilters,
    },
  });

  return records.map(toMovie);
}

export async function listMoviesForTitleMatch(): Promise<Pick<Movie, "id" | "title">[]> {
  const records = await prisma.movie.findMany({
    select: { id: true, title: true },
  });
  return records;
}

export async function getMovieById(id: string): Promise<Movie | null> {
  const record = await prisma.movie.findUnique({ where: { id } });
  return record ? toMovie(record) : null;
}

export async function createMovie(input: CreateMovieInput): Promise<Movie> {
  const record = await prisma.movie.create({
    data: {
      title: input.title,
      director: input.director,
      year: input.year,
      moods: toPrismaMoods(input.mood),
      scenes: toPrismaScenes(input.scene),
      genres: input.genres,
      quote: input.quote ?? null,
      stock: input.stock,
      totalStock: input.totalStock,
      coverUrl: input.coverUrl ?? null,
      description: input.description,
    },
  });

  return toMovie(record);
}

export async function updateMovie(
  id: string,
  input: UpdateMovieInput
): Promise<Movie | null> {
  const existing = await prisma.movie.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  const record = await prisma.movie.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.director !== undefined ? { director: input.director } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.mood !== undefined ? { moods: toPrismaMoods(input.mood) } : {}),
      ...(input.scene !== undefined ? { scenes: toPrismaScenes(input.scene) } : {}),
      ...(input.genres !== undefined ? { genres: input.genres } : {}),
      ...(input.quote !== undefined ? { quote: input.quote } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.totalStock !== undefined ? { totalStock: input.totalStock } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });

  return toMovie(record);
}

export async function deleteMovie(id: string): Promise<boolean> {
  const existing = await prisma.movie.findUnique({ where: { id } });
  if (!existing) {
    return false;
  }

  await prisma.movie.delete({ where: { id } });
  return true;
}
