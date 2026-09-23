import { request } from "./http";
import type { TripCreateRequest, TripDetail, TripListFeed, TripResult } from "@fairy/shared";

// FU-19（旅行规划二期）：/trips 历史行程面的 web 客户端。读取（列表/详情）任意已登录角色；
// 创建仅 admin/agent——普通用户前端不展示表单，403 TRIP_FORBIDDEN 由后端兜底。
// 401 单飞刷新与错误码归一化继承 lib/http。
export async function createTrip(input: TripCreateRequest): Promise<TripResult> {
  return request<TripResult>("/api/trips", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listTrips(
  params: {
    page?: number;
    limit?: number;
  } = {},
): Promise<TripListFeed> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<TripListFeed>(`/api/trips?${query.toString()}`);
}

export async function getTrip(tripId: string): Promise<TripDetail> {
  return request<TripDetail>(`/api/trips/${tripId}`);
}
