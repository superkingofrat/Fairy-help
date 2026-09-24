import { request } from "./http";
import type { BehaviorLogFeed } from "@fairy/shared";

interface FetchBehaviorLogsParams {
  action?: string;
  page?: number;
  limit?: number;
}

export async function fetchBehaviorLogs(
  params: FetchBehaviorLogsParams = {},
): Promise<BehaviorLogFeed> {
  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<BehaviorLogFeed>(`/api/behavior-logs?${query.toString()}`);
}
