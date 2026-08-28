import { describe, expect, it } from "vitest";
import { createMovieSchema, parseCreateMovieInput } from "./movieSchemas";

const validMovie = {
  title: "测试片",
  director: "导演",
  year: 2024,
  mood: ["轻松"],
  scene: ["通勤路上"],
  genres: ["剧情"],
  stock: 1,
  totalStock: 2,
  description: "简介",
};

describe("createMovieSchema", () => {
  it("accepts a complete movie payload", () => {
    const result = createMovieSchema.safeParse(validMovie);
    expect(result.success).toBe(true);
  });

  it("coerces numeric strings and empty coverUrl", () => {
    const result = createMovieSchema.safeParse({
      ...validMovie,
      year: "2024",
      stock: "1",
      totalStock: "2",
      coverUrl: "",
      quote: "   ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2024);
      expect(result.data.coverUrl).toBeNull();
      expect(result.data.quote).toBeNull();
    }
  });

  it("rejects missing mood tags", () => {
    const result = parseCreateMovieInput({ ...validMovie, mood: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fields).toContain("mood");
    }
  });

  it("rejects stock greater than totalStock", () => {
    const result = parseCreateMovieInput({ ...validMovie, stock: 3, totalStock: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fields).toContain("totalStock");
    }
  });
});
