import { BehaviorAction, prisma, type Prisma } from "@fairy/database";

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
