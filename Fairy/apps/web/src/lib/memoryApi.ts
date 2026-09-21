import { request } from "./http";
import type {
  MemoryCreateInput,
  MemoryKind,
  MemoryListFeed,
  MemoryRecord,
  MemorySelfListFeed,
  MemoryUpdateInput,
} from "@fairy/shared";

// FU-15：记忆管理面（admin-only /api/memories）的 web 客户端。
export async function fetchMemories(
  params: {
    page?: number;
    limit?: number;
    kind?: MemoryKind;
    keyword?: string;
  } = {},
): Promise<MemoryListFeed> {
  const query = new URLSearchParams();
  if (params.kind) query.set("kind", params.kind);
  if (params.keyword) query.set("keyword", params.keyword);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<MemoryListFeed>(`/api/memories?${query.toString()}`);
}

// FU-17：自查面 GET /api/memories/me（任意已登录角色）——只返回本人记忆；身份由 token 决定，
// 该客户端不携带 userId/email 参数。
export async function listMyMemories(
  params: {
    page?: number;
    limit?: number;
    kind?: MemoryKind;
    keyword?: string;
  } = {},
): Promise<MemorySelfListFeed> {
  const query = new URLSearchParams();
  if (params.kind) query.set("kind", params.kind);
  if (params.keyword) query.set("keyword", params.keyword);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<MemorySelfListFeed>(`/api/memories/me?${query.toString()}`);
}

export async function createMemory(input: MemoryCreateInput): Promise<MemoryRecord> {
  return request<MemoryRecord>("/api/memories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMemory(id: string, input: MemoryUpdateInput): Promise<MemoryRecord> {
  return request<MemoryRecord>(`/api/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMemory(id: string): Promise<void> {
  await request<{ id: string }>(`/api/memories/${id}`, {
    method: "DELETE",
  });
}
