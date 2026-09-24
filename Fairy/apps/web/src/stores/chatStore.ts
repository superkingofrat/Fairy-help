import { create } from "zustand";
import type { RentalListItem } from "@fairy/shared";
import { listRentals } from "../lib/rentalsApi";

interface ChatState {
  activeRentals: RentalListItem[];
  refreshRentals: () => Promise<void>;
  removeActiveRental: (rentalId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeRentals: [],
  refreshRentals: async () => {
    try {
      const rentals = (await listRentals({ status: "ACTIVE" })) ?? [];
      set({ activeRentals: rentals });
    } catch {
      // 401 由请求层跳转登录；其余失败保留旧状态，避免未处理拒绝
    }
  },
  removeActiveRental: (rentalId) => {
    set((state) => ({
      activeRentals: state.activeRentals.filter((rental) => rental.rentalId !== rentalId),
    }));
  },
}));
