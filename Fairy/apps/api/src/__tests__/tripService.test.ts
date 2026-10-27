import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { getTripDetail } from "../services/tripService.js";

// 只替换 prisma：tripService 经 planTripTool 间接拉进 behaviorLogService/profileService，
// 它们需要真实的 BehaviorAction 与 Prisma 值导出，故用 importOriginal 保留原模块其余部分。
vi.mock("@fairy/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fairy/database")>();
  return {
    ...actual,
    prisma: {
      trip: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

const TRIP_ID = "550e8400-e29b-41d4-a716-446655440000";
const COMPANION_USER_ID = "00000000-0000-4000-8000-0000000000c1";

const itinerary = [
  {
    day: 1,
    title: "西湖经典一日",
    steps: [
      {
        name: "西湖",
        category: "景点",
        time: "09:00",
        note: null,
        location: { lng: 120.15, lat: 30.25 },
        validated: true,
      },
    ],
  },
];

function tripRow(overrides: {
  companionName?: string | null;
  companionUserId?: string | null;
}): Record<string, unknown> {
  return {
    id: TRIP_ID,
    userId: "00000000-0000-4000-8000-000000000001",
    destination: "杭州",
    days: 1,
    itinerary,
    route: null,
    status: "DRAFT",
    companionName: null,
    companionUserId: null,
    createdAt: new Date("2026-10-11T10:00:00.000Z"),
    updatedAt: new Date("2026-10-11T10:00:00.000Z"),
    ...overrides,
  };
}

describe("tripService.getTripDetail companion projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("projects the companion snapshot when both columns are present", async () => {
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(
      tripRow({ companionName: "莱卡恩", companionUserId: COMPANION_USER_ID }) as never,
    );

    const result = await getTripDetail(TRIP_ID);

    expect(result?.trip.companion).toEqual({ name: "莱卡恩", userId: COMPANION_USER_ID });
  });

  it("projects null when either column is missing", async () => {
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(
      tripRow({ companionName: "莱卡恩" }) as never,
    );
    const nameOnly = await getTripDetail(TRIP_ID);
    expect(nameOnly?.trip.companion).toBe(null);

    vi.mocked(prisma.trip.findUnique).mockResolvedValue(
      tripRow({ companionUserId: COMPANION_USER_ID }) as never,
    );
    const idOnly = await getTripDetail(TRIP_ID);
    expect(idOnly?.trip.companion).toBe(null);
  });

  it("projects null for trips planned before the companion columns existed", async () => {
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(tripRow({}) as never);

    const result = await getTripDetail(TRIP_ID);

    expect(result?.trip.companion).toBe(null);
    expect(result?.trip.destination).toBe("杭州");
  });

  it("returns null for an unknown trip", async () => {
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(null);

    expect(await getTripDetail(TRIP_ID)).toBe(null);
  });
});
