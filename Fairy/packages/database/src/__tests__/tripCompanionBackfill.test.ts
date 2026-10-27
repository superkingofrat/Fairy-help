import { describe, expect, it } from "vitest";
import { readCompanionFromPayload } from "../tripCompanionBackfill.js";

// 回填脚本唯一需要判断的分支：payload 形状是否足以拼出一个完整快照。
// 这些用例守住的是「不写半截快照」与「不猜损坏数据」两条边界。

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    destination: "泉州",
    days: 2,
    tripId: "550e8400-e29b-41d4-a716-446655440000",
    validated: true,
    ...overrides,
  };
}

describe("readCompanionFromPayload", () => {
  it("reads a complete snapshot written after FU-20 logged the companion", () => {
    const read = readCompanionFromPayload(
      payload({ companionName: "莱卡恩", companionUserId: "00000000-0000-4000-8000-0000000000c1" }),
    );

    expect(read).toEqual({
      kind: "companion",
      snapshot: {
        tripId: "550e8400-e29b-41d4-a716-446655440000",
        name: "莱卡恩",
        userId: "00000000-0000-4000-8000-0000000000c1",
      },
    });
  });

  it("reports a name-only payload instead of building a half snapshot", () => {
    expect(readCompanionFromPayload(payload({ companionName: "莱卡恩" }))).toEqual({
      kind: "name-only",
    });
  });

  it("treats a non-string userId as name-only", () => {
    expect(
      readCompanionFromPayload(payload({ companionName: "莱卡恩", companionUserId: 42 })),
    ).toEqual({
      kind: "name-only",
    });
  });

  it("reports no companion when the key is absent, empty or not a string", () => {
    expect(readCompanionFromPayload(payload())).toEqual({ kind: "no-companion" });
    expect(readCompanionFromPayload(payload({ companionName: "" }))).toEqual({
      kind: "no-companion",
    });
    expect(readCompanionFromPayload(payload({ companionName: null }))).toEqual({
      kind: "no-companion",
    });
    expect(readCompanionFromPayload(payload({ companionName: 7 }))).toEqual({
      kind: "no-companion",
    });
  });

  it("reports malformed when the trip cannot be located", () => {
    expect(readCompanionFromPayload(payload({ tripId: undefined }))).toEqual({ kind: "malformed" });
    expect(readCompanionFromPayload(payload({ tripId: "" }))).toEqual({ kind: "malformed" });
    expect(readCompanionFromPayload(payload({ tripId: 12 }))).toEqual({ kind: "malformed" });
  });

  it("reports malformed for payloads that are not an object", () => {
    expect(readCompanionFromPayload(null)).toEqual({ kind: "malformed" });
    expect(readCompanionFromPayload(undefined)).toEqual({ kind: "malformed" });
    expect(readCompanionFromPayload("trip")).toEqual({ kind: "malformed" });
    expect(readCompanionFromPayload(7)).toEqual({ kind: "malformed" });
    expect(readCompanionFromPayload([])).toEqual({ kind: "malformed" });
  });
});
