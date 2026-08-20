import { create } from "zustand";

interface ChatState {
  messages: string[];
}

export const useChatStore = create<ChatState>(() => ({
  messages: [],
}));
