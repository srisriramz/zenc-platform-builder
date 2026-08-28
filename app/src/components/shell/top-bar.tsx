"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronsUpDown,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  TestTube2,
  UserCircle2,
} from "lucide-react";
import type { BootstrapData } from "@/mock/api";
import { ROLES } from "@/data/platform";
import { PRODUCT_LABEL, useSession, type SimMode } from "@/store/session";
import { Button } from "@/components/ui/button";
import { Badge, Kbd } from "@/components/ui/primitives";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

const SIM_OPTIONS: { value: SimMode; label: string; desc: string }[] = [
  { value: "normal", label: "Normal", desc: "Healthy responses" },
  { value: "slow", label: "Slow network", desc: "~2.5s latency — exercises loading states" },
  { value: "timeout", label: "Timeout", desc: "Requests time out" },
  { value: "server_error", label: "Server error", desc: "Mock service returns an error" },
  { value: "degraded_source", label: "Degraded source", desc: "A connector reports degraded" },
  { value: "partial", label: "Partial results", desc: "Only half the rows return" },
];

export function TopBar({
  bootstrap,
  onOpenPalette,
  onOpenNav,
}: {
  bootstrap: BootstrapData;
  onOpenPalette: () => void;
  onOpenNav: () => void;
}) {
  const router = useRouter();
  const { user } = bootstrap;
  const tenantId = useSession((s) => s.tenantId);
  const setTenant = useSession((s) => s.setTenant);
  const product = useSession((s) => s.product);
  const setProduct = useSession((s) => s.setProduct);
  const theme = useSession((s) => s.theme);
  const setTheme = useSession((s) => s.setTheme);
  const sim = useSession((s) => s.sim);
  const setSim = useSession((s) => s.setSim);
  const signOut = useSession((s) => s.signOut);

  const activeTenant = bootstrap.tenants.find((t) => t.tenant_id === tenantId) ?? bootstrap.tenants[0];
  const role = activeTenant ? ROLES[activeTenant.role] : null;
  const killEngaged = bootstrap.globalKillSwitch.engaged || !!activeTenant?.kill_switch.engaged;
  const canSiem = !!activeTenant?.entitlements.has_siem;
  const canSoc = !!activeTenant?.entitlements.has_soc;

  return (
    <header className="glass sticky top-7 z-40 border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-[1640px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={onOpenNav}>
          <MenuIcon className="size-4" />
        </Button>

        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_60%,var(--gold))] text-primary-foreground shadow-sm">
            <ShieldCheck className="size-4" />
          </span>
          <span className="hidden font-display text-sm font-semibold tracking-tight sm:inline">ZenC</span>
        </div>

        {/* product switcher */}
        <div className="flex items-center rounded-lg border border-border bg-card/60 p-0.5 text-xs">
          {(["siem", "soc"] as const).map((p) => {
            const disabled = p === "siem" ? !canSiem : !canSoc;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setProduct(p)}
                disabled={disabled}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold tracking-wide transition-colors disabled:opacity-35",
                  product === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PRODUCT_LABEL[p]}
              </button>
            );
          })}
        </div>

        {/* command palette trigger */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="group ml-1 hidden h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-border bg-card/50 px-3 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:bg-accent md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search &amp; commands…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <div className="flex-1 md:hidden" />
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search and commands" onClick={onOpenPalette}>
          <Search className="size-4" />
        </Button>

        <Badge variant="outline" className="hidden xl:inline-flex">
          <TestTube2 className="size-3" /> Demo env
        </Badge>

        <Menu
          align="end"
          trigger={
            <Button
              variant={sim === "normal" ? "ghost" : "outline"}
              size="sm"
              className={cn("hidden md:inline-flex", sim !== "normal" && "border-[var(--warning)] text-[var(--warning)]")}
            >
              <span className={cn("size-1.5 rounded-full", sim === "normal" ? "bg-[var(--success)]" : "bg-[var(--warning)]")} />
              {SIM_OPTIONS.find((o) => o.value === sim)?.label}
              <ChevronsUpDown className="size-3" />
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Simulate a condition</MenuLabel>
              {SIM_OPTIONS.map((o) => (
                <MenuItem key={o.value} selected={o.value === sim} onClick={() => { setSim(o.value); close(); }}>
                  <div>
                    <div>{o.label}</div>
                    <div className="text-[11px] text-muted-foreground">{o.desc}</div>
                  </div>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        <Badge
          variant={killEngaged ? "danger" : "outline"}
          className="hidden lg:inline-flex"
          title={killEngaged ? "A kill switch is engaged — action execution is halted for its scope" : "No kill switch engaged"}
        >
          {killEngaged ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
          {killEngaged ? "Kill switch ON" : "Kill switch clear"}
        </Badge>

        <Menu
          align="end"
          trigger={
            <Button variant="outline" size="sm">
              <Building2 className="size-3.5" />
              <span className="hidden max-w-[9rem] truncate md:inline">{activeTenant?.name ?? "Tenant"}</span>
              <ChevronsUpDown className="size-3" />
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Switch tenant</MenuLabel>
              {bootstrap.tenants.map((t) => (
                <MenuItem key={t.tenant_id} selected={t.tenant_id === tenantId} onClick={() => { setTenant(t.tenant_id); close(); }}>
                  <div>
                    <div>{t.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.sector} · {[t.entitlements.has_siem && "SIEM", t.entitlements.has_soc && "SOAR"].filter(Boolean).join(" + ") || "no products"} · {ROLES[t.role].label}
                    </div>
                  </div>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="icon" aria-label="Theme">
              {theme === "dark" ? <Moon className="size-4" /> : theme === "light" ? <Sun className="size-4" /> : <Monitor className="size-4" />}
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Appearance</MenuLabel>
              {(["light", "dark", "system"] as const).map((t) => (
                <MenuItem key={t} selected={theme === t} onClick={() => { setTheme(t); close(); }} className="capitalize">
                  {t === "light" ? <Sun className="size-3.5" /> : t === "dark" ? <Moon className="size-3.5" /> : <Monitor className="size-3.5" />}
                  {t}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="sm">
              <UserCircle2 className="size-4" />
              <span className="hidden max-w-[8rem] truncate lg:inline">{user.display_name}</span>
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>{user.display_name}</MenuLabel>
              <div className="px-2 pb-1 text-[11px] text-muted-foreground">
                {role?.label} · {activeTenant?.name}
              </div>
              <MenuSeparator />
              <MenuItem onClick={() => { close(); router.push("/login"); }}>Switch persona…</MenuItem>
              <MenuItem onClick={() => { close(); signOut(); router.replace("/login"); }}>Sign out</MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
