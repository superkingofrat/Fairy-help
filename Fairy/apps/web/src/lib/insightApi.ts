import { request } from "./http";
import type { StoreInsightsOverview } from "@fairy/shared";

export async function fetchInsightsOverview(): Promise<StoreInsightsOverview> {
  return request<StoreInsightsOverview>("/api/insights/overview");
}
