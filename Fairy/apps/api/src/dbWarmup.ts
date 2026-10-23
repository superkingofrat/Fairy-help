/**
 * 启动期把数据库连接的冷启动代价吃掉。
 *
 * Neon 的计算休眠后第一次查询要数秒才连上，而 Prisma 默认 `connect_timeout` 为 5s——
 * 这段延迟若落在第一个用户请求上，就表现为 `POST /api/auth/register` 直接 500
 * （全局错误处理器归一成 `Unexpected server error`），而紧接着重试立刻成功。
 * 评审者接触项目的第一件事就是注册，所以这个第一印象必须关掉：把连接挪到
 * `listen` 之前完成，冷启动的等待落在启动期而不是用户身上。
 *
 * 失败不抛错：库确实不可用时 API 仍要 listen（`/health` 可用、原因可诊断），
 * 崩溃循环反而会把真实错误埋进重启日志里。
 */

export interface WarmUpDatabaseOptions {
  /** 建立连接的动作，通常是 `() => prisma.$connect()`。 */
  connect: () => Promise<void>;
  /** 总尝试次数，默认 3。 */
  attempts?: number;
  /** 两次尝试之间的间隔，默认 2000ms。 */
  delayMs?: number;
  /** 可注入的等待函数，测试里用它消除真实耗时。 */
  sleep?: (ms: number) => Promise<void>;
  /** 单次尝试失败时回调（attempt 从 1 起）。 */
  onAttemptFailed?: (attempt: number, attempts: number, error: unknown) => void;
  /** 全部尝试耗尽时回调。 */
  onGiveUp?: (attempts: number) => void;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 2000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 尝试建立数据库连接，全部失败时返回 false 而不抛错。
 * 返回 true 表示连接已就绪，随后的请求不会再吃冷启动延迟。
 */
export async function warmUpDatabase(options: WarmUpDatabaseOptions): Promise<boolean> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await options.connect();
      return true;
    } catch (error) {
      options.onAttemptFailed?.(attempt, attempts, error);
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }

  options.onGiveUp?.(attempts);
  return false;
}
