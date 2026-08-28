import { prisma } from "@fairy/database";
import type { Profile } from "@fairy/shared";

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
