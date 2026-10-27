import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("health", () => {
  it("returns healthy status", async () => {
    const app = createApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: "OK",
      data: { status: "healthy" },
      msg: "ok",
    });
  });
});
