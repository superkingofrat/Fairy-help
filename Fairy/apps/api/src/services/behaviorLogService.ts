import { BehaviorAction, prisma, type Prisma } from "@fairy/database";
import type { BehaviorLogListItem, BehaviorLogQuery } from "@fairy/shared";
import * as movieService from "./movieService";

export async function append(input: {
  userId: string;
  action: BehaviorAction;
  movieId?: string;
  rentalId?: string;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.behaviorLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      movieId: input.movieId,
      rentalId: input.rentalId,
      payload: input.payload,
    },
  });
}

interface BehaviorLogRecord {
  id: string;
  userId: string;
  action: BehaviorAction;
  movieId: string | null;
  rentalId: string | null;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

function recommendCountOf(record: BehaviorLogRecord): number | null {
  if (record.action !== "RECOMMEND") {
    return null;
  }

  const payload = record.payload as { movieIds?: unknown } | null;
  const movieIds = payload?.movieIds;
  return Array.isArray(movieIds) ? movieIds.length : null;
}

export async function listLogs(query: BehaviorLogQuery): Promise<{
  items: BehaviorLogListItem[];
  total: number;
}> {
  const where: Prisma.BehaviorLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [records, total] = await Promise.all([
    prisma.behaviorLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.behaviorLog.count({ where }),
  ]);

  const movieIds = [
    ...new Set(records.map((record) => record.movieId).filter((id): id is string => Boolean(id))),
  ];
  const movies =
    movieIds.length > 0 ? await movieService.listMoviesByIds(movieIds) : [];
  const titleById = new Map(movies.map((movie) => [movie.id, movie.title]));

  const items: BehaviorLogListItem[] = records.map((record) => ({
    id: record.id,
    userId: record.userId,
    email: record.user.email,
    action: record.action,
    movieId: record.movieId,
    movieTitle: record.movieId ? (titleById.get(record.movieId) ?? null) : null,
    rentalId: record.rentalId,
    recommendCount: recommendCountOf(record),
    createdAt: record.createdAt.toISOString(),
  }));

  return { items, total };
}
