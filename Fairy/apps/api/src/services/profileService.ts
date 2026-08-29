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
  | { ok: true; profile: Profile }
  | { ok: false; code: "USER_NOT_FOUND" | "PROFILE_ALREADY_EXISTS" };

export async function createForExistingUser(
  input: CreateProfileInput
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
  input: UpdateProfileInput
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
        ...(input.dietPreference !== undefined
          ? { dietPreference: input.dietPreference }
          : {}),
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
