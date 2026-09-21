import { BehaviorAction, prisma, type Prisma } from "@fairy/database";
import type { BehaviorLogListItem, BehaviorLogQuery } from "@fairy/shared";
import * as movieService from "./movieService";

export interface BehaviorLogInput {
  userId: string;
  action: BehaviorAction;
  movieId?: string;
  rentalId?: string;
  payload?: Prisma.InputJsonValue;
}

async function append(input: BehaviorLogInput): Promise<void> {
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

/**
 * 尽力而为的日志写入：失败仅记 warn，不向调用方抛出。
 *
 * 用于借阅/归还/推荐/行程等**已成功执行**的路径——库存或行程已经落库，
 * 日志 insert 失败不应把既成事实翻成 500（契约错误表里没有 500 这一档），
 * 可观测性损失优于功能损失（同会话落库旁路的取舍）。
 */
export async function appendQuietly(input: BehaviorLogInput): Promise<void> {
  try {
    await append(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[behaviorLog] append ${input.action} for ${input.userId} failed: ${message}`);
  }
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
  const movies = movieIds.length > 0 ? await movieService.listMoviesByIds(movieIds) : [];
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
