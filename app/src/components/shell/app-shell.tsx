"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/store/session";
import { useBootstrap } from "@/hooks/use-platform";
import { LoadingState } from "@/components/states";
import { TopBar } from "./top-bar";
import { SideNav } from "./side-nav";
import { CommandPalette } from "./command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useSession((s) => s.hydrated);
  const userId = useSession((s) => s.userId);
  const tenantId = useSession((s) => s.tenantId);
  const setTenant = useSession((s) => s.setTenant);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const bootstrap = useBootstrap();

  React.useEffect(() => {
    if (hydrated && !userId) router.replace("/login");
  }, [hydrated, userId, router]);

  // Reconcile a stale persisted tenant against what this user can actually see.
  React.useEffect(() => {
    if (!bootstrap.data) return;
    const ids = bootstrap.data.tenants.map((t) => t.tenant_id);
    if (ids.length === 0) return;
    if (!tenantId || !ids.includes(tenantId)) setTenant(bootstrap.data.tenants[0].tenant_id);
  }, [bootstrap.data, tenantId, setTenant]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hydrated || (userId && bootstrap.isLoading)) {
    return (
      <div className="p-10">
        <LoadingState label="Starting the demo environment…" />
      </div>
    );
  }
  if (!userId) return null;
  if (bootstrap.isError || !bootstrap.data) {
    return (
      <div className="p-10">
        <LoadingState label="Could not load the session. Reloading may help." />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-1.75rem)] flex-col">
      <TopBar bootstrap={bootstrap.data} onOpenPalette={() => setPaletteOpen(true)} />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        <SideNav bootstrap={bootstrap.data} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} bootstrap={bootstrap.data} />
    </div>
  );
}
