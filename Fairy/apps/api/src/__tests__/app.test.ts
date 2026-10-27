import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const originalHops = process.env.TRUST_PROXY_HOPS;

afterEach(() => {
  if (originalHops === undefined) {
    delete process.env.TRUST_PROXY_HOPS;
  } else {
    process.env.TRUST_PROXY_HOPS = originalHops;
  }
});

describe("trust proxy", () => {
  it("trusts one proxy hop by default so per-client rate limits survive a reverse proxy", () => {
    delete process.env.TRUST_PROXY_HOPS;
    expect(createApp().get("trust proxy")).toBe(1);
  });

  it("honors an explicit hop count", () => {
    process.env.TRUST_PROXY_HOPS = "2";
    expect(createApp().get("trust proxy")).toBe(2);
  });

  it("trusts no hop when set to zero (direct exposure)", () => {
    process.env.TRUST_PROXY_HOPS = "0";
    expect(createApp().get("trust proxy")).toBe(0);
  });

  it("falls back to one hop on an invalid value", () => {
    process.env.TRUST_PROXY_HOPS = "not-a-number";
    expect(createApp().get("trust proxy")).toBe(1);
  });
});
