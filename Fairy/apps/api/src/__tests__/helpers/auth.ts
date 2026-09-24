import jwt from "jsonwebtoken";
import { DEV_ADMIN_ID, DEV_USER_ID } from "@fairy/shared";

// 测试进程不加载 .env：helper 被导入时注入固定测试密钥（中间件在请求期读取）
process.env.JWT_SECRET ??= "test-jwt-secret";

export type TestRole = "admin" | "agent" | "user";

const USER_ID_BY_ROLE: Record<TestRole, string> = {
  admin: DEV_ADMIN_ID,
  agent: DEV_USER_ID,
  user: DEV_USER_ID,
};

export function authToken(role: TestRole): string {
  return jwt.sign({ userId: USER_ID_BY_ROLE[role], role }, process.env.JWT_SECRET as string, {
    expiresIn: "1h",
  });
}

export function authHeader(role: TestRole): string {
  return `Bearer ${authToken(role)}`;
}
