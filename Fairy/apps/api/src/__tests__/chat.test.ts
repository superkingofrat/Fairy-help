import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as movieService from "../services/movieService";
import * as profileService from "../services/profileService";
import * as rentalService from "../services/rentalService";
import * as behaviorLogService from "../services/behaviorLogService";
import * as sessionService from "../services/sessionService";
import * as insightService from "../services/insightService";
import * as planTripTool from "../tools/planTripTool";
import * as llmClient from "../agent/llmClient";
import * as memoryService from "../memory/memoryService";
import * as memoryExtractor from "../memory/memoryExtractor";
import {
  DEV_USER_ID,
  type Movie,
  type Profile,
  type StoreInsightsOverview,
  type TripResult,
  type MemoryRecord,
} from "@fairy/shared";
import { authHeader } from "./helpers/auth";

vi.mock("../services/movieService");
vi.mock("../services/profileService");
vi.mock("../services/rentalService");
vi.mock("../services/behaviorLogService");
vi.mock("../services/sessionService");
vi.mock("../services/insightService");
vi.mock("../tools/planTripTool");
vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message,
  tryChat: vi.fn(),
}));
vi.mock("../memory/memoryService", () => ({
  searchMemories: vi.fn(),
}));
vi.mock("../memory/memoryExtractor", () => ({
  extractAndStoreMemories: vi.fn(),
}));

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const sampleMovie: Movie = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "星际穿越",
  director: "Christopher Nolan",
  year: 2014,
  mood: ["治愈", "悬疑"],
  scene: ["雨天", "失眠夜"],
  genres: ["科幻", "冒险"],
  quote: null,
  stock: 3,
  totalStock: 5,
  coverUrl: null,
  description: "测试",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

const zeroStock: Movie = {
  ...sampleMovie,
  id: "660e8400-e29b-41d4-a716-446655440000",
  title: "缺货片",
  stock: 0,
};

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      return { event, data: data ? (JSON.parse(data) as unknown) : null };
    });
}

const profile: Profile = {
  userId: "00000000-0000-4000-8000-000000000001",
  name: "铃",
  avatarUrl: null,
  styleTags: [],
  likeGenres: ["科幻"],
  avoidFood: [],
  dietPreference: null,
  travelStyle: null,
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

describe("POST /api/chat", () => {
  const app = createApp();

  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.clearAllMocks();
    vi.mocked(profileService.getByUserId).mockResolvedValue(profile);
    vi.mocked(behaviorLogService.append).mockResolvedValue();
    vi.mocked(movieService.listMoviesForTitleMatch).mockResolvedValue([
      { id: sampleMovie.id, title: sampleMovie.title },
    ]);
    vi.mocked(sessionService.createSession).mockResolvedValue({
      id: SESSION_ID,
      title: "",
      messageCount: 0,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    });
    vi.mocked(sessionService.getOwnedSession).mockResolvedValue({
      ok: true,
      id: SESSION_ID,
      title: "",
    });
    vi.mocked(sessionService.getRecentMessages).mockResolvedValue([]);
    vi.mocked(sessionService.appendTurn).mockResolvedValue({ ok: true });
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);
    vi.mocked(memoryService.searchMemories).mockResolvedValue([]);
    vi.mocked(memoryExtractor.extractAndStoreMemories).mockResolvedValue();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid movieId with JSON envelope", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: "bad" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects action return without movieId with 400", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", action: "return" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(rentalService.returnRental).not.toHaveBeenCalled();
  });

  it("one-click return executes deterministically with action, ignoring message", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: true,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      remainingStock: 4,
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({
        message: "随便说点什么",
        movieId: sampleMovie.id,
        action: "return",
      });

    const events = parseSse(response.text);
    expect(
      events.find((event) => event.event === "return")?.data,
    ).toMatchObject({
      success: true,
      remainingStock: 4,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      code: "OK",
    });
    expect(events.some((event) => event.event === "text")).toBe(true);
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RETURN_SUCCESS" }),
    );
  });

  it("one-click return failure degrades to apologetic text without 500", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: false,
      code: "RENTAL_NOT_FOUND",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: sampleMovie.id, action: "return" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    expect(
      events.find((event) => event.event === "return")?.data,
    ).toMatchObject({
      success: false,
      code: "RENTAL_NOT_FOUND",
    });
    const text = events.find((event) => event.event === "text");
    expect((text?.data as { content: string }).content).toBe(
      "你目前没有借这部片子。",
    );
    expect(behaviorLogService.append).not.toHaveBeenCalled();
  });

  it("recommends in-stock mood/scene matches and writes a log", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
      {
        ...sampleMovie,
        id: "770e8400-e29b-41d4-a716-446655440000",
        title: "家庭片",
        genres: ["家庭"],
      },
    ]);

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天心情不好" });

    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
    const events = parseSse(response.text);
    const recommendation = events.find(
      (event) => event.event === "recommendation",
    );
    expect(recommendation).toBeDefined();
    const items = (recommendation?.data as { items: Movie[] }).items;
    expect(items[0].title).toBe("星际穿越");
    expect(items.every((movie) => movie.stock > 0)).toBe(true);
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RECOMMEND" }),
    );
  });

  it("does not include zero-stock movies because the service only returns stock > 0", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
    ]);

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天" });

    const events = parseSse(response.text);
    const recommendation = events.find(
      (event) => event.event === "recommendation",
    );
    const items = (recommendation?.data as { items: Movie[] }).items;
    expect(items.find((movie) => movie.id === zeroStock.id)).toBeUndefined();
  });

  it("borrows with movieId and emits remaining stock", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: true,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      remainingStock: 2,
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: sampleMovie.id });

    const events = parseSse(response.text);
    const borrow = events.find((event) => event.event === "borrow");
    expect(borrow?.data).toMatchObject({
      success: true,
      remainingStock: 2,
      code: "OK",
    });
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BORROW_SUCCESS" }),
    );
  });

  it("returns ALREADY_BORROWED without a success log", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: false,
      code: "ALREADY_BORROWED",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: sampleMovie.id });

    const events = parseSse(response.text);
    const borrow = events.find((event) => event.event === "borrow");
    expect(borrow?.data).toMatchObject({
      success: false,
      code: "ALREADY_BORROWED",
    });
    expect(behaviorLogService.append).not.toHaveBeenCalled();
  });

  it("returns OUT_OF_STOCK and writes a failure log", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: false,
      code: "OUT_OF_STOCK",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: sampleMovie.id });

    const events = parseSse(response.text);
    expect(
      events.find((event) => event.event === "borrow")?.data,
    ).toMatchObject({
      code: "OUT_OF_STOCK",
      success: false,
    });
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BORROW_OUT_OF_STOCK" }),
    );
  });

  it("unmatched messages do not recommend, borrow, or log", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "今天星期几" });

    const events = parseSse(response.text);
    expect(events.some((event) => event.event === "recommendation")).toBe(
      false,
    );
    expect(events.some((event) => event.event === "borrow")).toBe(false);
    expect(events.some((event) => event.event === "text")).toBe(true);
    expect(behaviorLogService.append).not.toHaveBeenCalled();
    expect(rentalService.borrow).not.toHaveBeenCalled();
  });

  it("falls back to template text when no LLM provider is configured", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
    ]);

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    const text = events.find((event) => event.event === "text");
    expect((text?.data as { content: string }).content).toBe(
      "为你找到这些可借的片子：《星际穿越》。点卡片就能借阅。",
    );
    expect(
      events.find((event) => event.event === "recommendation"),
    ).toBeDefined();
    expect(events[events.length - 1].event).toBe("done");
  });

  it("returns a return event when a held movie is returned by title", async () => {
    vi.mocked(movieService.listMoviesForTitleMatch).mockResolvedValue([
      { id: "660e8400-e29b-41d4-a716-446655440000", title: "千与千寻" },
    ]);
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: true,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      remainingStock: 4,
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "还千与千寻" });

    const events = parseSse(response.text);
    expect(
      events.find((event) => event.event === "return")?.data,
    ).toMatchObject({
      success: true,
      remainingStock: 4,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      code: "OK",
    });
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RETURN_SUCCESS" }),
    );
  });

  it("emits a failed return event when nothing is held", async () => {
    vi.mocked(movieService.listMoviesForTitleMatch).mockResolvedValue([
      { id: "660e8400-e29b-41d4-a716-446655440000", title: "千与千寻" },
    ]);
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: false,
      code: "RENTAL_NOT_FOUND",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "还千与千寻" });

    const events = parseSse(response.text);
    expect(
      events.find((event) => event.event === "return")?.data,
    ).toMatchObject({
      success: false,
      code: "RENTAL_NOT_FOUND",
    });
    expect(behaviorLogService.append).not.toHaveBeenCalled();
  });

  it("does not misfire a return for the homograph 还 (still)", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "还可以" });

    const events = parseSse(response.text);
    expect(events.some((event) => event.event === "return")).toBe(false);
    expect(events.some((event) => event.event === "borrow")).toBe(false);
    expect(events.some((event) => event.event === "text")).toBe(true);
    expect(rentalService.returnRental).not.toHaveBeenCalled();
  });

  it("degrades in-stream tool errors to text+done instead of hanging", async () => {
    vi.mocked(movieService.listMoviesForTitleMatch).mockResolvedValue([
      { id: "660e8400-e29b-41d4-a716-446655440000", title: "千与千寻" },
    ]);
    vi.mocked(rentalService.returnRental).mockRejectedValue(
      new Error("db exploded"),
    );

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "还千与千寻" });

    const events = parseSse(response.text);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].event).toBe("done");
    expect(events.some((event) => event.event === "text")).toBe(true);
    expect(response.text).not.toContain("db exploded");
  });

  it("auto-creates a session for a message without sessionId and echoes it in done", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
    ]);

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天" });

    expect(sessionService.createSession).toHaveBeenCalledWith(DEV_USER_ID);
    expect(sessionService.getRecentMessages).toHaveBeenCalledWith(
      DEV_USER_ID,
      SESSION_ID,
      10,
    );
    const events = parseSse(response.text);
    const done = events[events.length - 1];
    expect(done.event).toBe("done");
    expect((done.data as { sessionId: string }).sessionId).toBe(SESSION_ID);
  });

  it("persists the turn with content and recommendation events as a side channel", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
    ]);

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天" });

    expect(response.status).toBe(200);
    expect(sessionService.appendTurn).toHaveBeenCalledWith(
      DEV_USER_ID,
      SESSION_ID,
      expect.objectContaining({
        userContent: "雨天",
        events: expect.arrayContaining([
          expect.objectContaining({ type: "recommendation" }),
        ]),
      }),
    );
  });

  it("does not create or persist a session for a one-click return without sessionId", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: true,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      remainingStock: 4,
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: sampleMovie.id, action: "return" });

    expect(sessionService.createSession).not.toHaveBeenCalled();
    expect(sessionService.appendTurn).not.toHaveBeenCalled();
    const events = parseSse(response.text);
    expect(
      (events[events.length - 1].data as { sessionId: null }).sessionId,
    ).toBeNull();
  });

  it("rejects an unknown sessionId with 404 JSON before any SSE", async () => {
    vi.mocked(sessionService.getOwnedSession).mockResolvedValue({
      ok: false,
      code: "SESSION_NOT_FOUND",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天", sessionId: SESSION_ID });

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toEqual({
      code: "SESSION_NOT_FOUND",
      data: null,
      msg: "会话不存在",
    });
    expect(sessionService.createSession).not.toHaveBeenCalled();
  });

  it("rejects another user's session with 403 JSON", async () => {
    vi.mocked(sessionService.getOwnedSession).mockResolvedValue({
      ok: false,
      code: "SESSION_FORBIDDEN",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天", sessionId: SESSION_ID });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("SESSION_FORBIDDEN");
  });

  it("still completes the stream when persisting the turn fails", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
    ]);
    vi.mocked(sessionService.appendTurn).mockRejectedValue(
      new Error("db down"),
    );

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    expect(events[events.length - 1].event).toBe("done");
    expect(response.text).not.toContain("db down");
  });

  it("answers an admin store-insight question with real data (FU-12)", async () => {
    const overview: StoreInsightsOverview = {
      popularMovies: [
        {
          movieId: sampleMovie.id,
          title: "星际穿越",
          borrowCount: 3,
          recommendCount: 5,
          inStock: true,
        },
      ],
      trend: [{ date: "2026-08-31", borrowCount: 1, returnCount: 0 }],
      inventory: { activeRentals: 1, borrowedRatio: 0.2, lowStockMovies: [] },
      moods: [{ value: "治愈", count: 1 }],
      scenes: [{ value: "雨天", count: 1 }],
      activity: { totalUsers: 3, activeUsers7d: 2, newUsers7d: 1 },
    };
    vi.mocked(insightService.getStoreInsightsOverview).mockResolvedValue(
      overview,
    );

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("admin"))
      .send({ message: "最近什么片最火" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    const textEvents = events.filter((event) => event.event === "text");
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0].data as { content: string }).toEqual(
      expect.objectContaining({ content: expect.stringContaining("星际穿越") }),
    );
    expect(events[events.length - 1].event).toBe("done");
  });

  it("denies a non-admin store-insight question without leaking data (FU-12)", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "库存怎么样" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    const textEvents = events.filter((event) => event.event === "text");
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0].data as { content: string }).toEqual(
      expect.objectContaining({ content: expect.stringContaining("管理员") }),
    );
    expect(insightService.getStoreInsightsOverview).not.toHaveBeenCalled();
    expect(events[events.length - 1].event).toBe("done");
  });

  it("emits a trip SSE event and persists it in the turn (FU-13)", async () => {
    const tripResult: TripResult = {
      tripId: "550e8400-e29b-41d4-a716-446655440000",
      destination: "杭州",
      days: 1,
      itinerary: [
        {
          day: 1,
          title: "西湖经典一日",
          steps: [
            {
              time: "09:00",
              name: "西湖",
              category: "景点",
              note: null,
              location: { lng: 120.15, lat: 30.25 },
              validated: true,
            },
          ],
        },
      ],
      route: null,
      validated: true,
    };
    vi.mocked(planTripTool.planTripTool).mockResolvedValue({
      success: true,
      data: tripResult,
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "帮我规划周末去杭州玩" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    const trip = events.find((event) => event.event === "trip");
    expect(trip?.data).toEqual({ trip: tripResult });
    expect(events.some((event) => event.event === "text")).toBe(true);
    expect(planTripTool.planTripTool).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      message: "帮我规划周末去杭州玩",
    });
    expect(sessionService.appendTurn).toHaveBeenCalledWith(
      DEV_USER_ID,
      SESSION_ID,
      expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({ type: "trip", trip: tripResult }),
        ]),
      }),
    );
  });

  it("retrieves only the current profile's memories and injects them into the reply prompt (FU-14)", async () => {
    const memory: MemoryRecord = {
      id: "m1",
      profileId: DEV_USER_ID,
      sessionId: null,
      kind: "preference",
      content: "喜欢科幻片",
      metadata: null,
      createdAt: "2026-09-01T10:00:00Z",
    };
    vi.mocked(memoryService.searchMemories).mockResolvedValue([memory]);
    vi.mocked(llmClient.tryChat).mockResolvedValue({
      text: "你最喜欢科幻片啦。",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: "test-model",
      provider: "deepseek",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "我喜欢什么类型的片子" });

    expect(response.status).toBe(200);
    expect(memoryService.searchMemories).toHaveBeenCalledWith(DEV_USER_ID, {
      query: "我喜欢什么类型的片子",
    });
    const userMessages = vi
      .mocked(llmClient.tryChat)
      .mock.calls.map((call) => call[1])
      .flat()
      .filter((message) => message.role === "user")
      .map((message) => message.content);
    expect(userMessages.join("\n")).toContain("【记忆】");
    expect(userMessages.join("\n")).toContain("- [preference] 喜欢科幻片");
    const events = parseSse(response.text);
    expect(events[events.length - 1].event).toBe("done");
  });

  it("runs memory extraction after the stream without affecting the response (FU-14)", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
    ]);
    vi.mocked(memoryExtractor.extractAndStoreMemories).mockRejectedValue(
      new Error("extract down"),
    );

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "雨天" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    expect(events[events.length - 1].event).toBe("done");
    expect(memoryExtractor.extractAndStoreMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: DEV_USER_ID,
        userMessage: "雨天",
      }),
    );
    expect(response.text).not.toContain("extract down");
  });

  it("passes an undefined sessionId to extraction for one-click returns (FU-14)", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: true,
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
      remainingStock: 4,
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader("user"))
      .send({ message: "", movieId: sampleMovie.id, action: "return" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    expect(events[events.length - 1].event).toBe("done");
    expect(memoryExtractor.extractAndStoreMemories).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: undefined }),
    );
  });
});
