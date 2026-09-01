import { describe, expect, it } from "vitest";
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  authUserSchema,
} from "./authSchemas";

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "user@fairy.local",
      password: "user123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "x" }).success,
    ).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ email: "user@fairy.local", password: "" }).success,
    ).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a valid email and password", () => {
    const result = registerSchema.safeParse({
      email: "new@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 6 characters", () => {
    expect(
      registerSchema.safeParse({
        email: "new@example.com",
        password: "12345",
      }).success,
    ).toBe(false);
  });

  it("rejects a password longer than 72 characters", () => {
    expect(
      registerSchema.safeParse({
        email: "new@example.com",
        password: "x".repeat(73),
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      registerSchema.safeParse({
        email: "not-an-email",
        password: "secret123",
      }).success,
    ).toBe(false);
  });
});

describe("refreshTokenSchema", () => {
  it("accepts a non-empty refresh token", () => {
    expect(refreshTokenSchema.safeParse({ refreshToken: "abc.def" }).success).toBe(
      true,
    );
  });

  it("rejects a blank refresh token", () => {
    expect(refreshTokenSchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });
});

describe("authUserSchema", () => {
  it("accepts a uuid id with email and role", () => {
    expect(
      authUserSchema.safeParse({
        id: "660e8400-e29b-41d4-a716-446655440000",
        email: "user@fairy.local",
        role: "user",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(
      authUserSchema.safeParse({
        id: "not-a-uuid",
        email: "user@fairy.local",
        role: "user",
      }).success,
    ).toBe(false);
  });
});
