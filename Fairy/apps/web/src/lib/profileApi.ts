import { request } from "./http";
import type {
  Profile,
  ProfileListItem,
  CreateProfileInput,
  UpdateProfileInput,
} from "@fairy/shared";

export async function fetchProfiles(): Promise<ProfileListItem[]> {
  return request<ProfileListItem[]>("/api/profiles");
}

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  return request<Profile>("/api/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
  return request<Profile>(`/api/profiles/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
