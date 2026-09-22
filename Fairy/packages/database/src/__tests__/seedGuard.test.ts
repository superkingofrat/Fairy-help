import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// seed 的 production 守卫必须在 Prisma 连接建立之前生效：这里以子进程跑真实入口，
// DATABASE_URL 指向必然连接失败的地址——被守卫拦下时根本到不了连接那一步
const SEED_ENTRY = "prisma/seed.ts";
const UNREACHABLE_DATABASE_URL = "postgresql://user:password@127.0.0.1:1/fairy_test";

function runSeed(env: Record<string, string>): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, ["--import", "tsx", SEED_ENTRY], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: UNREACHABLE_DATABASE_URL, ...env },
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 60_000,
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stderr?: Buffer };
    return {
      status: failure.status ?? -1,
      stderr: failure.stderr?.toString() ?? "",
    };
  }
}

describe("seed production guard", () => {
  it("refuses to run when NODE_ENV is production", () => {
    const result = runSeed({ NODE_ENV: "production" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing to seed");
  }, 30_000);

  it("does not refuse when NODE_ENV is unset (local dev convention)", () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;
    delete env.NODE_ENV;

    const result = runSeed(env);

    // 守卫不误伤：越过守卫后才会因为连不上库而失败，错误里不应出现拒绝语
    expect(result.stderr).not.toContain("refusing to seed");
  }, 30_000);
});
