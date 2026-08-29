import type {
  CreateProfileInput,
  Profile,
  ProfileListItem,
  UpdateProfileInput,
} from "@fairy/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Dev-Role": "admin",
      ...options.headers,
    },
  });

  const raw = await response.text();
  let payload: ApiResponse<T> | null = null;

  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as ApiResponse<T>;
    } catch {
      throw new Error(
        response.ok
          ? "Invalid API response"
          : `Request failed (${response.status}): API returned non-JSON response. Is the API running on port 3000?`
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.msg ??
        `Request failed (${response.status}). Check that pnpm --filter=@fairy/api dev is running.`
    );
  }

  if (!payload) {
    throw new Error("Empty API response. Check that pnpm --filter=@fairy/api dev is running.");
  }

  return payload;
}

export async function fetchProfiles(): Promise<ProfileListItem[]> {
  const result = await request<ProfileListItem[]>("/api/profiles");
  return result.data;
}

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  const result = await request<Profile>("/api/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<Profile> {
  const result = await request<Profile>(`/api/profiles/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.data;
}
