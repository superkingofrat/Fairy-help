import type { RentalListItem } from "@fairy/shared";
import { useAuthStore } from "../stores/authStore";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
}

export async function listRentals(params?: {
  status?: "ACTIVE";
}): Promise<RentalListItem[]> {
  const token = useAuthStore.getState().token;
  const query = params?.status ? `?status=${params.status}` : "";
  const response = await fetch(`${API_BASE}/api/rentals${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const raw = await response.text();
  let payload: ApiResponse<RentalListItem[]> | null = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as ApiResponse<RentalListItem[]>;
    } catch {
      throw new Error(
        response.ok
          ? "Invalid API response"
          : `Request failed (${response.status}): API returned non-JSON response. Is the API running on port 3000?`
      );
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clear();
      window.location.assign("/login");
      throw new Error("会话已失效，请重新登录");
    }
    throw new Error(
      payload?.msg ?? `Request failed (${response.status}). Check that pnpm --filter=@fairy/api dev is running.`
    );
  }

  return payload?.data ?? [];
}
