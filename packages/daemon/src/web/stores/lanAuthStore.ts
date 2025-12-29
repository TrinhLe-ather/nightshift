import { create } from "zustand";

interface LanAuthState {
  needsAuth: boolean;
  requireAuth: () => void;
  clearAuth: () => void;
}

export const useLanAuthStore = create<LanAuthState>((set) => ({
  needsAuth: false,
  requireAuth: () => set({ needsAuth: true }),
  clearAuth: () => set({ needsAuth: false }),
}));
