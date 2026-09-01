import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@fairy/database";
import type { AuthUser } from "@fairy/shared";

const ACCESS_TTL = "12h";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const REFRESH_TOKEN_BYTES = 48;

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

export type RegisterResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code: "EMAIL_ALREADY_EXISTS" };

export type RefreshResult =
  | { ok: true; token: string; refreshToken: string; user: AuthUser }
  | { ok: false; code: "INVALID_REFRESH_TOKEN" };

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

export async function registerUser(email: string, password: string): Promise<RegisterResult> {
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, role: "user" },
    });
    return { ok: true, user: { id: user.id, email: user.email, role: user.role } };
  } catch (error) {
    // P2002: unique constraint（email 已存在）
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return { ok: false, code: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET as string, {
    expiresIn: ACCESS_TTL,
  });
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? { id: user.id, email: user.email, role: user.role } : null;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newRefreshTokenValue(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

// 签发新的 refresh token：明文只返回这一次，DB 只存 sha256 哈希
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = newRefreshTokenValue();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return token;
}

// 旋转：旧 token 立即失效并记录被替换关系；复用已吊销/已替换的 token → 吊销该用户全部 refresh token
export async function rotateRefreshToken(refreshToken: string): Promise<RefreshResult> {
  const tokenHash = hashToken(refreshToken);

  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) {
    return { ok: false, code: "INVALID_REFRESH_TOKEN" };
  }
  if (existing.expiresAt <= new Date()) {
    return { ok: false, code: "INVALID_REFRESH_TOKEN" };
  }
  if (existing.revokedAt) {
    // 复用检测：已旋转/已吊销的 token 再次出现 → 全家吊销，强制重登
    await revokeAllUserRefreshTokens(existing.userId);
    return { ok: false, code: "INVALID_REFRESH_TOKEN" };
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user) {
    return { ok: false, code: "INVALID_REFRESH_TOKEN" };
  }

  const newToken = newRefreshTokenValue();
  const newId = crypto.randomUUID();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenId: newId },
    }),
    prisma.refreshToken.create({
      data: {
        id: newId,
        tokenHash: hashToken(newToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    }),
  ]);

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  return { ok: true, token: signToken(authUser), refreshToken: newToken, user: authUser };
}

export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!existing || existing.revokedAt) {
    return false;
  }
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return true;
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
