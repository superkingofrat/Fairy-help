import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { borrowMovieTool } from "../tools/borrowMovieTool.js";
import { authHeader } from "./helpers/auth.js";
import { DEV_USER_ID } from "@fairy/shared";

vi.mock("../tools/borrowMovieTool.js");

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";

describe("POST /api/borrow", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("borrows for the token subject and returns 201", async () => {
    vi.mocked(borrowMovieTool).mockResolvedValue({
      success: true,
      data: { remainingStock: 2, rentalId: "r1" },
    });

    const response = await request(app)
      .post("/api/borrow")
      .set("Authorization", authHeader("user"))
      .send({ movieId: MOVIE_ID });

    expect(response.status).toBe(201);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toEqual({ rentalId: "r1", remainingStock: 2 });
    expect(borrowMovieTool).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      movieId: MOVIE_ID,
    });
  });

  it("ignores a userId in the body — identity comes from the token", async () => {
    vi.mocked(borrowMovieTool).mockResolvedValue({
      success: true,
      data: { remainingStock: 2, rentalId: "r1" },
    });

    await request(app)
      .post("/api/borrow")
      .set("Authorization", authHeader("user"))
      .send({ movieId: MOVIE_ID, userId: OTHER_USER_ID });

    expect(borrowMovieTool).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      movieId: MOVIE_ID,
    });
  });

  it("maps MOVIE_NOT_FOUND to 404", async () => {
    vi.mocked(borrowMovieTool).mockResolvedValue({ success: false, error: "MOVIE_NOT_FOUND" });

    const response = await request(app)
      .post("/api/borrow")
      .set("Authorization", authHeader("user"))
      .send({ movieId: MOVIE_ID });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("MOVIE_NOT_FOUND");
  });

  it("maps ALREADY_BORROWED to 409", async () => {
    vi.mocked(borrowMovieTool).mockResolvedValue({ success: false, error: "ALREADY_BORROWED" });

    const response = await request(app)
      .post("/api/borrow")
      .set("Authorization", authHeader("user"))
      .send({ movieId: MOVIE_ID });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ALREADY_BORROWED");
  });

  it("maps OUT_OF_STOCK to 409", async () => {
    vi.mocked(borrowMovieTool).mockResolvedValue({ success: false, error: "OUT_OF_STOCK" });

    const response = await request(app)
      .post("/api/borrow")
      .set("Authorization", authHeader("user"))
      .send({ movieId: MOVIE_ID });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("OUT_OF_STOCK");
  });

  it("returns 400 for an invalid movieId", async () => {
    const response = await request(app)
      .post("/api/borrow")
      .set("Authorization", authHeader("user"))
      .send({ movieId: "not-a-uuid" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(borrowMovieTool).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).post("/api/borrow").send({ movieId: MOVIE_ID });

    expect(response.status).toBe(401);
    expect(borrowMovieTool).not.toHaveBeenCalled();
  });
});
