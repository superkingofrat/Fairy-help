import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@fairy/shared";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setSession: (token, user, refreshToken) => set({ token, user, refreshToken }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: "fairy-auth" },
  ),
);
