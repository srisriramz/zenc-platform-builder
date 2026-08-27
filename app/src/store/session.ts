"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Zustand is used ONLY for: the demo auth session, the active tenant, the
 * active product, UI preferences, the simulation control, and (later) the
 * guided-demo controller. Server-shaped data lives in TanStack Query, never
 * here (references/frontend-ux-spec.md).
 *
 * Persistence: a single versioned, non-sensitive key. No credentials, no
 * security evidence — just which demo persona/tenant/theme is selected.
 */
export type ProductArea = "siem" | "soc";
export type ThemePref = "light" | "dark" | "system";
export type SimMode = "normal" | "slow" | "timeout" | "server_error" | "degraded_source" | "partial";

interface SessionState {
  userId: string | null;
  tenantId: string | null;
  product: ProductArea;
  theme: ThemePref;
  sim: SimMode;
  sidebarCollapsed: boolean;
  hydrated: boolean;

  signIn: (userId: string, tenantId: string) => void;
  signOut: () => void;
  setTenant: (tenantId: string) => void;
  setProduct: (p: ProductArea) => void;
  setTheme: (t: ThemePref) => void;
  setSim: (s: SimMode) => void;
  toggleSidebar: () => void;
  _setHydrated: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      tenantId: null,
      product: "siem",
      theme: "system",
      sim: "normal",
      sidebarCollapsed: false,
      hydrated: false,

      signIn: (userId, tenantId) => set({ userId, tenantId }),
      signOut: () => set({ userId: null, tenantId: null, sim: "normal" }),
      setTenant: (tenantId) => set({ tenantId }),
      setProduct: (product) => set({ product }),
      setTheme: (theme) => set({ theme }),
      setSim: (sim) => set({ sim }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "zenc.session.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        userId: s.userId,
        tenantId: s.tenantId,
        product: s.product,
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => state?._setHydrated(),
    },
  ),
);
