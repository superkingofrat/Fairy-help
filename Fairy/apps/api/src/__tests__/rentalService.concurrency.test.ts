import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BorrowResult } from "../services/rentalService";

// 真实库并发用例：仅配置 TEST_DATABASE_URL 时运行，CI 与本地默认整体跳过。
// 并发借阅必须真实提交事务（无法共享回滚隔离），因此该 URL 必须指向独立测试库
// （fairy_test 或 Neon branch），绝不可与开发库共用。
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const databaseTest = TEST_DATABASE_URL ? describe : describe.skip;

const INITIAL_STOCK = 5;
const CONCURRENCY = 20;

databaseTest("rentalService.borrow under 20-way concurrency (real database)", () => {
  const testDatabaseUrl = TEST_DATABASE_URL ?? "";
  let database: typeof import("@fairy/database");
  let borrow: (userId: string, movieId: string) => Promise<BorrowResult>;
  let movieId = "";
  const userIds: string[] = [];

  beforeAll(async () => {
    // @fairy/database 的 prisma 单例在模块加载时读取 DATABASE_URL，因此这里刻意
    // 不做顶层静态 import：先改环境变量，再动态加载 rentalService（及其依赖的
    // 共享单例），让 borrow 打到测试库而不是开发库
    process.env.DATABASE_URL = testDatabaseUrl;
    database = await import("@fairy/database");
    ({ borrow } = await import("../services/rentalService"));

    const prisma = database.prisma;
    const suffix = Math.random().toString(36).slice(2, 10);
    const movie = await prisma.movie.create({
      data: {
        title: `并发测试片-${suffix}`,
        director: "测试",
        year: 2026,
        moods: [database.Mood.HEALING],
        scenes: [database.Scene.RAINY_DAY],
        genres: ["测试"],
        stock: INITIAL_STOCK,
        totalStock: INITIAL_STOCK,
      },
    });
    movieId = movie.id;
    for (let index = 0; index < CONCURRENCY; index += 1) {
      const user = await prisma.user.create({
        data: { email: `concurrency-${suffix}-${index}@test.local`, role: "user" },
      });
      userIds.push(user.id);
    }
  }, 60_000);

  afterAll(async () => {
    const prisma = database.prisma;
    await prisma.rental.deleteMany({ where: { movieId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.movie.delete({ where: { id: movieId } });
    await prisma.$disconnect();
  }, 60_000);

  it("never oversells: exactly stock-many succeed, the rest get OUT_OF_STOCK", async () => {
    const settled = await Promise.allSettled(userIds.map((userId) => borrow(userId, movieId)));

    const outcomes: BorrowResult[] = [];
    for (const result of settled) {
      // borrow 以返回码表达业务失败，任何 rejection 都应是缺陷
      expect(result.status).toBe("fulfilled");
      if (result.status === "fulfilled") {
        outcomes.push(result.value);
      }
    }
    expect(outcomes).toHaveLength(CONCURRENCY);

    const successes = outcomes.filter((outcome) => outcome.ok);
    const failures = outcomes.filter((outcome) => !outcome.ok);

    // 不超卖：成功数恰好等于库存，其余全部 OUT_OF_STOCK
    expect(successes).toHaveLength(INITIAL_STOCK);
    expect(failures).toHaveLength(CONCURRENCY - INITIAL_STOCK);
    expect(failures.every((outcome) => outcome.code === "OUT_OF_STOCK")).toBe(true);

    // 每个成功者看到的剩余库存互不相同（0..库存-1 各一次），证明没有重复扣减
    const remaining = successes.map((outcome) => outcome.remainingStock).sort((a, b) => a - b);
    expect(remaining).toEqual([0, 1, 2, 3, 4]);

    // 终态核对：库存归零、不出现负数、活跃租赁数等于成功数
    const movie = await database.prisma.movie.findUniqueOrThrow({ where: { id: movieId } });
    expect(movie.stock).toBe(0);
    expect(movie.stock).toBeGreaterThanOrEqual(0);
    const activeRentals = await database.prisma.rental.count({
      where: { movieId, status: "ACTIVE" },
    });
    expect(activeRentals).toBe(INITIAL_STOCK);
  }, 120_000);
});
