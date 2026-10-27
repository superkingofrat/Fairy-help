import { describe, expect, it, vi } from "vitest";
import { warmUpDatabase, type WarmUpDatabaseOptions } from "../dbWarmup.js";

function optionsWith(overrides: Partial<WarmUpDatabaseOptions> = {}): WarmUpDatabaseOptions {
  return {
    connect: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("warmUpDatabase", () => {
  it("returns true on the first successful connect without retrying", async () => {
    const connect = vi.fn(async () => {});
    const sleep = vi.fn(async () => {});

    const connected = await warmUpDatabase(optionsWith({ connect, sleep }));

    expect(connected).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries until a later attempt succeeds and stops immediately after", async () => {
    const connect = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("P1001"))
      .mockRejectedValueOnce(new Error("P1001"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(async () => {});
    const onGiveUp = vi.fn();

    const connected = await warmUpDatabase(optionsWith({ connect, sleep, onGiveUp }));

    expect(connected).toBe(true);
    expect(connect).toHaveBeenCalledTimes(3);
    // 只在失败之后、且还有下一次尝试时才等待：2 次失败 → 2 次 sleep
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it("returns false and reports give-up when every attempt fails", async () => {
    const connect = vi.fn(async () => {
      throw new Error("P1001");
    });
    const onGiveUp = vi.fn();

    const connected = await warmUpDatabase(
      optionsWith({ connect, onGiveUp, sleep: vi.fn(async () => {}) }),
    );

    expect(connected).toBe(false);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledWith(3);
  });

  it("never throws even when connect keeps rejecting", async () => {
    const connect = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(
      warmUpDatabase(optionsWith({ connect, sleep: vi.fn(async () => {}) })),
    ).resolves.toBe(false);
  });

  it("reports each failed attempt with 1-based numbering", async () => {
    const connect = vi.fn(async () => {
      throw new Error("P1001");
    });
    const onAttemptFailed = vi.fn();

    await warmUpDatabase(optionsWith({ connect, onAttemptFailed, sleep: vi.fn(async () => {}) }));

    expect(onAttemptFailed.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    expect(onAttemptFailed.mock.calls.map((call) => call[1])).toEqual([3, 3, 3]);
  });

  it("honours custom attempts and delay", async () => {
    const connect = vi.fn(async () => {
      throw new Error("P1001");
    });
    const sleep = vi.fn(async () => {});

    await warmUpDatabase(optionsWith({ connect, sleep, attempts: 5, delayMs: 50 }));

    expect(connect).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("does not sleep after the final failed attempt", async () => {
    const connect = vi.fn(async () => {
      throw new Error("P1001");
    });
    const sleep = vi.fn(async () => {});

    await warmUpDatabase(optionsWith({ connect, sleep, attempts: 2 }));

    // 2 次尝试只失败 1 次间隔，最后一次失败后直接放弃
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
