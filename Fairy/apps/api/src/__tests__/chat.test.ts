import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as movieService from "../services/movieService";
import * as profileService from "../services/profileService";
import * as rentalService from "../services/rentalService";
import * as behaviorLogService from "../services/behaviorLogService";
import type { Movie, Profile } from "@fairy/shared";

vi.mock("../services/movieService");
vi.mock("../services/profileService");
vi.mock("../services/rentalService");
vi.mock("../services/behaviorLogService");

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

const zeroStock: Movie = { ...sampleMovie, id: "660e8400-e29b-41d4-a716-446655440000", title: "缺货片", stock: 0 };

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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid movieId with JSON envelope", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "", movieId: "bad" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("recommends in-stock mood/scene matches and writes a log", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([
      sampleMovie,
      { ...sampleMovie, id: "770e8400-e29b-41d4-a716-446655440000", title: "家庭片", genres: ["家庭"] },
    ]);

    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "雨天心情不好" });

    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
    const events = parseSse(response.text);
    const recommendation = events.find((event) => event.event === "recommendation");
    expect(recommendation).toBeDefined();
    const items = (recommendation?.data as { items: Movie[] }).items;
    expect(items[0].title).toBe("星际穿越");
    expect(items.every((movie) => movie.stock > 0)).toBe(true);
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RECOMMEND" })
    );
  });

  it("does not include zero-stock movies because the service only returns stock > 0", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([sampleMovie]);

    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "雨天" });

    const events = parseSse(response.text);
    const recommendation = events.find((event) => event.event === "recommendation");
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
      .set("X-Dev-Role", "user")
      .send({ message: "", movieId: sampleMovie.id });

    const events = parseSse(response.text);
    const borrow = events.find((event) => event.event === "borrow");
    expect(borrow?.data).toMatchObject({
      success: true,
      remainingStock: 2,
      code: "OK",
    });
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BORROW_SUCCESS" })
    );
  });

  it("returns ALREADY_BORROWED without a success log", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: false,
      code: "ALREADY_BORROWED",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "", movieId: sampleMovie.id });

    const events = parseSse(response.text);
    const borrow = events.find((event) => event.event === "borrow");
    expect(borrow?.data).toMatchObject({ success: false, code: "ALREADY_BORROWED" });
    expect(behaviorLogService.append).not.toHaveBeenCalled();
  });

  it("returns OUT_OF_STOCK and writes a failure log", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: false,
      code: "OUT_OF_STOCK",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "", movieId: sampleMovie.id });

    const events = parseSse(response.text);
    expect(events.find((event) => event.event === "borrow")?.data).toMatchObject({
      code: "OUT_OF_STOCK",
      success: false,
    });
    expect(behaviorLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BORROW_OUT_OF_STOCK" })
    );
  });

  it("unmatched messages do not recommend, borrow, or log", async () => {
    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "今天星期几" });

    const events = parseSse(response.text);
    expect(events.some((event) => event.event === "recommendation")).toBe(false);
    expect(events.some((event) => event.event === "borrow")).toBe(false);
    expect(events.some((event) => event.event === "text")).toBe(true);
    expect(behaviorLogService.append).not.toHaveBeenCalled();
    expect(rentalService.borrow).not.toHaveBeenCalled();
  });

  it("falls back to template text when no LLM provider is configured", async () => {
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([sampleMovie]);

    const response = await request(app)
      .post("/api/chat")
      .set("X-Dev-Role", "user")
      .send({ message: "雨天" });

    expect(response.status).toBe(200);
    const events = parseSse(response.text);
    const text = events.find((event) => event.event === "text");
    expect((text?.data as { content: string }).content).toBe(
      "为你找到这些可借的片子：《星际穿越》。点卡片就能借阅。"
    );
    expect(events.find((event) => event.event === "recommendation")).toBeDefined();
    expect(events[events.length - 1].event).toBe("done");
  });
});
