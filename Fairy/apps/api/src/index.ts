import "dotenv/config";
import { prisma } from "@fairy/database";
import { createApp } from "./app";
import { warmUpDatabase } from "./dbWarmup";
import { startScheduler } from "./services/suggestionScheduler";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("Missing required environment variable JWT_SECRET");
  process.exit(1);
}

const app = createApp();
const port = process.env.PORT ?? "3000";

// 启动期先连上库再 listen：Neon 计算休眠后首次查询要数秒，而 Prisma 默认
// connect_timeout 为 5s——那段延迟若落在第一个用户请求上，注册就会 500 且重试即好。
// 连接失败不阻断启动（/health 仍可用、原因可诊断），只把事实记下来。
const databaseReady = await warmUpDatabase({
  connect: () => prisma.$connect(),
  onAttemptFailed: (attempt, attempts, error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({
        source: "dbWarmup",
        event: "connect_retry",
        attempt,
        attempts,
        reason,
      }),
    );
  },
  onGiveUp: (attempts) => {
    console.error(
      JSON.stringify({
        source: "dbWarmup",
        event: "connect_give_up",
        attempts,
        hint: "API 仍会监听，但首个数据库请求可能失败；检查 DATABASE_URL 与网络可达性",
      }),
    );
  },
});

if (databaseReady) {
  console.log(JSON.stringify({ source: "dbWarmup", event: "connected" }));
}

// 主动运营建议调度只挂在 server 入口：测试经 createApp() 不启动调度；
// 多实例部署下由 dedupeKey 唯一索引兜底去重（见 docs/deployment.md）。
const scheduler = startScheduler();

const server = app.listen(port, () => {
  console.log(`Fairy API listening on port ${port}`);
});

// 优雅关闭：先停调度（不再发起新的生成周期），再等在途请求结束；
// 兜底强退避免 keep-alive 连接把容器停止挂住。
function shutdown(): void {
  scheduler.stop();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
