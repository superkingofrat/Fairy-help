import { request } from "./http";
import type {
  MemoryCreateInput,
  MemoryKind,
  MemoryListFeed,
  MemoryRecord,
  MemoryUpdateInput,
} from "@fairy/shared";

// FU-15：记忆管理面（admin-only /api/memories）的 web 客户端。
export async function fetchMemories(params: {
  page?: number;
  limit?: number;
  kind?: MemoryKind;
  keyword?: string;
} = {}): Promise<MemoryListFeed> {
  const query = new URLSearchParams();
  if (params.kind) query.set("kind", params.kind);
  if (params.keyword) query.set("keyword", params.keyword);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<MemoryListFeed>(`/api/memories?${query.toString()}`);
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
