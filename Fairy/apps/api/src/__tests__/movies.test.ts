import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as movieService from "../services/movieService";
import type { Movie } from "@fairy/shared";
import { authHeader } from "./helpers/auth";

vi.mock("../services/movieService");

const sampleMovie: Movie = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "星际穿越",
  director: "Christopher Nolan",
  year: 2014,
  mood: ["治愈", "悬疑"],
  scene: ["雨天", "失眠夜"],
  genres: ["科幻", "冒险"],
  quote: "我们曾经仰望星空，思考我们在宇宙中的位置。",
  stock: 3,
  totalStock: 5,
  coverUrl: null,
  description: "地球末日临近，一队探险家穿越虫洞寻找新家园。",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

describe("movies routes", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists movies for user role", async () => {
    vi.mocked(movieService.listMovies).mockResolvedValue({
      items: [sampleMovie],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const response = await request(app)
      .get("/api/movies")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data.items).toHaveLength(1);
  });

  it("searches movies with mood filter", async () => {
    vi.mocked(movieService.searchMovies).mockResolvedValue({
      items: [sampleMovie],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const response = await request(app)
      .get("/api/movies/search?mood=治愈&keyword=星际")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(movieService.searchMovies).toHaveBeenCalled();
  });

  it("returns 400 when search criteria are missing", async () => {
    const response = await request(app)
      .get("/api/movies/search")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MISSING_SEARCH_CRITERIA");
  });

  it("returns 403 when non-admin creates a movie", async () => {
    const response = await request(app)
      .post("/api/movies")
      .set("Authorization", authHeader("user"))
      .send({
        title: "新片",
        director: "导演",
        year: 2024,
        mood: ["治愈"],
        scene: ["雨天"],
        genres: ["剧情"],
        stock: 1,
        totalStock: 1,
        description: "测试",
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(movieService.createMovie).not.toHaveBeenCalled();
  });

  it("creates a movie for admin", async () => {
    vi.mocked(movieService.createMovie).mockResolvedValue(sampleMovie);

    const response = await request(app)
      .post("/api/movies")
      .set("Authorization", authHeader("admin"))
      .send({
        title: "星际穿越",
        director: "Christopher Nolan",
        year: 2014,
        mood: ["治愈", "悬疑"],
        scene: ["雨天", "失眠夜"],
        genres: ["科幻", "冒险"],
        stock: 3,
        totalStock: 5,
        description: "测试",
      });

    expect(response.status).toBe(201);
    expect(response.body.code).toBe("OK");
    expect(movieService.createMovie).toHaveBeenCalled();
  });

  it("creates a movie when year is a string and coverUrl is empty", async () => {
    vi.mocked(movieService.createMovie).mockResolvedValue(sampleMovie);

    const response = await request(app)
      .post("/api/movies")
      .set("Authorization", authHeader("admin"))
      .send({
        title: "新片",
        director: "导演",
        year: "2024",
        mood: ["治愈"],
        scene: ["雨天"],
        genres: ["剧情"],
        stock: "1",
        totalStock: "1",
        coverUrl: "",
        quote: "",
        description: "测试",
      });

    expect(response.status).toBe(201);
    expect(movieService.createMovie).toHaveBeenCalled();
  });

  it("returns 400 for invalid mood count", async () => {
    const response = await request(app)
      .post("/api/movies")
      .set("Authorization", authHeader("admin"))
      .send({
        title: "新片",
        director: "导演",
        year: 2024,
        mood: [],
        scene: ["雨天"],
        genres: ["剧情"],
        stock: 1,
        totalStock: 1,
        description: "测试",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns movie by id", async () => {
    vi.mocked(movieService.getMovieById).mockResolvedValue(sampleMovie);

    const response = await request(app)
      .get(`/api/movies/${sampleMovie.id}`)
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe("星际穿越");
  });

  it("returns 404 when movie is missing", async () => {
    vi.mocked(movieService.getMovieById).mockResolvedValue(null);

    const response = await request(app)
      .get("/api/movies/missing-id")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("MOVIE_NOT_FOUND");
  });

  it("updates and deletes a movie for admin", async () => {
    vi.mocked(movieService.updateMovie).mockResolvedValue({
      ...sampleMovie,
      title: "更新后的片名",
    });
    vi.mocked(movieService.deleteMovie).mockResolvedValue(true);

    const patchResponse = await request(app)
      .patch(`/api/movies/${sampleMovie.id}`)
      .set("Authorization", authHeader("admin"))
      .send({ title: "更新后的片名" });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.data.title).toBe("更新后的片名");

    const deleteResponse = await request(app)
      .delete(`/api/movies/${sampleMovie.id}`)
      .set("Authorization", authHeader("admin"));

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.id).toBe(sampleMovie.id);
  });

  it("accepts bearer admin token", async () => {
    vi.mocked(movieService.listMovies).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const response = await request(app)
      .get("/api/movies")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
  });
});
