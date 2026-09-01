import { request } from "./http";
import type { RentalListItem } from "@fairy/shared";

export async function listRentals(params?: { status?: "ACTIVE" }): Promise<RentalListItem[]> {
  const query = params?.status ? `?status=${params.status}` : "";
  return request<RentalListItem[]>(`/api/rentals${query}`);
}
