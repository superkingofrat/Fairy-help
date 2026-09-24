import { Prisma, prisma } from "@fairy/database";
import type {
  CreateProfileInput,
  Profile,
  ProfileListItem,
  UpdateProfileInput,
} from "@fairy/shared";

function toProfile(record: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  styleTags: string[];
  likeGenres: string[];
  avoidFood: string[];
  dietPreference: string | null;
  travelStyle: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Profile {
  return {
    userId: record.userId,
    name: record.name,
    avatarUrl: record.avatarUrl,
    styleTags: record.styleTags,
    likeGenres: record.likeGenres,
    avoidFood: record.avoidFood,
    dietPreference: record.dietPreference,
    travelStyle: record.travelStyle,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function getByUserId(userId: string): Promise<Profile | null> {
  const record = await prisma.profile.findUnique({ where: { userId } });
  return record ? toProfile(record) : null;
}

export async function listUsersWithProfiles(): Promise<ProfileListItem[]> {
  const users = await prisma.user.findMany({
    include: { profile: true },
    orderBy: { createdAt: "asc" },
  });

  return users.map((user) => ({
    userId: user.id,
    email: user.email,
    role: user.role,
    profile: user.profile ? toProfile(user.profile) : null,
  }));
}

export type CreateProfileResult =
  { ok: true; profile: Profile } | { ok: false; code: "USER_NOT_FOUND" | "PROFILE_ALREADY_EXISTS" };

export async function createForExistingUser(
  input: CreateProfileInput,
): Promise<CreateProfileResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { profile: true },
  });

  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND" };
  }

  if (user.profile) {
    return { ok: false, code: "PROFILE_ALREADY_EXISTS" };
  }

  try {
    const record = await prisma.profile.create({
      data: {
        userId: input.userId,
        name: input.name,
        avatarUrl: input.avatarUrl,
        styleTags: input.styleTags,
        likeGenres: input.likeGenres,
        avoidFood: input.avoidFood,
        dietPreference: input.dietPreference,
        travelStyle: input.travelStyle,
      },
    });

    return { ok: true, profile: toProfile(record) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, code: "PROFILE_ALREADY_EXISTS" };
    }
    throw error;
  }
}

export async function updateByUserId(
  userId: string,
  input: UpdateProfileInput,
): Promise<Profile | null> {
  try {
    const record = await prisma.profile.update({
      where: { userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.styleTags !== undefined ? { styleTags: input.styleTags } : {}),
        ...(input.likeGenres !== undefined ? { likeGenres: input.likeGenres } : {}),
        ...(input.avoidFood !== undefined ? { avoidFood: input.avoidFood } : {}),
        ...(input.dietPreference !== undefined ? { dietPreference: input.dietPreference } : {}),
        ...(input.travelStyle !== undefined ? { travelStyle: input.travelStyle } : {}),
      },
    });

    return toProfile(record);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

// FU-18 画像反向回写：仅接受与影片库词表一致的片型，避免模型幻觉词（如「科幻片」类口语）直接进画像。
// 脏值过滤：空串/纯数字剔除（库内 Movie.genres 存在如 "1233" 的历史脏数据）。
// 缓存失效规则：进程内 TTL 5 分钟——新入库的片型最长延迟 5 分钟后才可被回写命中；
// dev/单实例规模不上分布式缓存。白名单查询失败 → 返回空名单（自然无命中），绝不抛出。
const GENRE_WHITELIST_TTL_MS = 5 * 60 * 1000;
let genreWhitelistCache: { values: string[]; fetchedAt: number } | null = null;

/** 测试专用：清空白名单进程内缓存（与 resetLlmProviderForTests 同级约定）。 */
export function resetGenreWhitelistForTests(): void {
  genreWhitelistCache = null;
}

export async function loadGenreWhitelist(): Promise<string[]> {
  const now = Date.now();
  if (genreWhitelistCache && now - genreWhitelistCache.fetchedAt < GENRE_WHITELIST_TTL_MS) {
    return genreWhitelistCache.values;
  }
  try {
    const movies = await prisma.movie.findMany({ select: { genres: true } });
    const unique = new Set<string>();
    for (const movie of movies) {
      for (const raw of movie.genres) {
        const genre = raw.trim();
        if (genre !== "" && !/^\d+$/.test(genre)) {
          unique.add(genre);
        }
      }
    }
    genreWhitelistCache = { values: [...unique], fetchedAt: now };
    return genreWhitelistCache.values;
  } catch (error) {
    console.warn("[profile] genre whitelist query failed; writeback skipped", error);
    return [];
  }
}

// 将抽取候选增量并入 Profile.likeGenres：事务内读 profile（缺失静默跳过）→ Set 并集去重 →
// 与既有标签无差异则不写（幂等，不无谓翻动 updatedAt）；只增不减，绝不覆盖/删除已有标签。
// 业务失败不抛出：调用方（记忆抽取旁路）无需感知。
export async function mergeLikeGenres(profileId: string, candidates: string[]): Promise<void> {
  const whitelist = await loadGenreWhitelist();
  if (whitelist.length === 0) {
    return;
  }
  const accepted = [...new Set(candidates.filter((candidate) => whitelist.includes(candidate)))];
  if (accepted.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { userId: profileId },
      select: { likeGenres: true },
    });
    if (!profile) {
      return;
    }
    const merged = [...new Set([...profile.likeGenres, ...accepted])];
    if (merged.length === profile.likeGenres.length) {
      return;
    }
    await tx.profile.update({
      where: { userId: profileId },
      data: { likeGenres: merged },
    });
  });
}
