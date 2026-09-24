import "dotenv/config";
import { createApp } from "./app";
import { startScheduler } from "./services/suggestionScheduler";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("Missing required environment variable JWT_SECRET");
  process.exit(1);
}

const app = createApp();
const port = process.env.PORT ?? "3000";

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
