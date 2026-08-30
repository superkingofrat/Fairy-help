import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@fairy/database";
import type { AuthUser } from "@fairy/shared";

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  // 空哈希（@default("")）视为未设密码，无法登录
  if (!user?.passwordHash) {
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return null;
  }

  return { id: user.id, email: user.email, role: user.role };
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET as string, {
    expiresIn: "12h",
  });
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? { id: user.id, email: user.email, role: user.role } : null;
}
