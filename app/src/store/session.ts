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

/**
 * Display names for the two live products. The Respond product is branded
 * "ZenC SOAR" in the UI (it houses the SOAR / playbook automation work); the
 * internal key stays `"soc"` and the entitlement stays `has_soc` to avoid
 * churning the contract layer. See references/domain-model.md.
 */
export const PRODUCT_LABEL: Record<ProductArea, string> = { siem: "SIEM", soc: "SOAR" };
export const PRODUCT_LABEL_FULL: Record<ProductArea, string> = { siem: "ZenC SIEM", soc: "ZenC SOAR" };

export type ThemePref = "light" | "dark" | "system";
export type SimMode = "normal" | "slow" | "timeout" | "server_error" | "degraded_source" | "partial";

/**
 * The guided-demo controller (references/launch-demo-spec.md). It is runtime
 * state only — deliberately NOT persisted, so a page reload ends the walkthrough
 * cleanly rather than resuming it in a half-mutated state. `vars` carries IDs
 * the script resolves as it runs (the case it opened, the action request it
 * submitted) so later steps can act on them.
 */
export interface GuidedDemoState {
  scriptId: string;
  stepIndex: number;
  vars: Record<string, string>;
  status: "running" | "error";
  error?: string;
}

interface SessionState {
  userId: string | null;
  tenantId: string | null;
  product: ProductArea;
  theme: ThemePref;
  sim: SimMode;
  sidebarCollapsed: boolean;
  hydrated: boolean;
  guidedDemo: GuidedDemoState | null;

  signIn: (userId: string, tenantId: string) => void;
  signOut: () => void;
  setTenant: (tenantId: string) => void;
  setProduct: (p: ProductArea) => void;
  setTheme: (t: ThemePref) => void;
  setSim: (s: SimMode) => void;
  toggleSidebar: () => void;
  startDemo: (scriptId: string) => void;
  setDemoStep: (stepIndex: number) => void;
  setDemoVars: (vars: Record<string, string>) => void;
  setDemoStatus: (status: GuidedDemoState["status"], error?: string) => void;
  exitDemo: () => void;
  _setHydrated: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      tenantId: null,
      product: "siem",
      theme: "dark",
      sim: "normal",
      sidebarCollapsed: false,
      hydrated: false,
      guidedDemo: null,

      signIn: (userId, tenantId) => set({ userId, tenantId }),
      signOut: () => set({ userId: null, tenantId: null, sim: "normal", guidedDemo: null }),
      setTenant: (tenantId) => set({ tenantId }),
      setProduct: (product) => set({ product }),
      setTheme: (theme) => set({ theme }),
      setSim: (sim) => set({ sim }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      startDemo: (scriptId) => set({ guidedDemo: { scriptId, stepIndex: 0, vars: {}, status: "running" } }),
      setDemoStep: (stepIndex) =>
        set((s) => (s.guidedDemo ? { guidedDemo: { ...s.guidedDemo, stepIndex, status: "running", error: undefined } } : {})),
      setDemoVars: (vars) =>
        set((s) => (s.guidedDemo ? { guidedDemo: { ...s.guidedDemo, vars: { ...s.guidedDemo.vars, ...vars } } } : {})),
      setDemoStatus: (status, error) =>
        set((s) => (s.guidedDemo ? { guidedDemo: { ...s.guidedDemo, status, error } } : {})),
      exitDemo: () => set({ guidedDemo: null }),
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
