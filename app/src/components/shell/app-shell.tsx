"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/store/session";
import { useBootstrap } from "@/hooks/use-platform";
import { LoadingState } from "@/components/states";
import { TopBar } from "./top-bar";
import { SideNav } from "./side-nav";
import { CommandPalette } from "./command-palette";
import { DemoController } from "@/components/demo/demo-controller";
import { Sheet } from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSession((s) => s.hydrated);
  const userId = useSession((s) => s.userId);
  const tenantId = useSession((s) => s.tenantId);
  const setTenant = useSession((s) => s.setTenant);
  const demoRunning = useSession((s) => !!s.guidedDemo);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const bootstrap = useBootstrap();

  React.useEffect(() => {
    if (hydrated && !userId) router.replace("/login");
  }, [hydrated, userId, router]);

  React.useEffect(() => {
    if (!bootstrap.data) return;
    const ids = bootstrap.data.tenants.map((t) => t.tenant_id);
    if (ids.length === 0) return;
    if (!tenantId || !ids.includes(tenantId)) setTenant(bootstrap.data.tenants[0].tenant_id);
  }, [bootstrap.data, tenantId, setTenant]);

  // Close the mobile nav on route change (adjust-while-rendering, no effect).
  const [navPath, setNavPath] = React.useState(pathname);
  if (pathname !== navPath) {
    setNavPath(pathname);
    if (mobileNavOpen) setMobileNavOpen(false);
  }

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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-9 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <TopBar bootstrap={bootstrap.data} onOpenPalette={() => setPaletteOpen(true)} onOpenNav={() => setMobileNavOpen(true)} />
      <div className="mx-auto flex w-full max-w-[1640px] flex-1">
        <SideNav bootstrap={bootstrap.data} />
        <main
          id="main-content"
          className={`min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 ${demoRunning ? "pb-44" : ""}`}
        >
          <div key={pathname} className="anim-rise">
            {children}
          </div>
        </main>
      </div>

      <Sheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} labelledBy="mobile-nav-title">
        <div className="border-b border-border p-4">
          <p id="mobile-nav-title" className="text-sm font-semibold">
            Navigation
          </p>
        </div>
        <SideNav bootstrap={bootstrap.data} variant="mobile" />
      </Sheet>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} bootstrap={bootstrap.data} />
      <DemoController />
    </div>
  );
}
