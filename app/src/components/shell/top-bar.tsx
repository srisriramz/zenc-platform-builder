"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronsUpDown,
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
import { useSession, type SimMode } from "@/store/session";
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

export function TopBar({ bootstrap, onOpenPalette }: { bootstrap: BootstrapData; onOpenPalette: () => void }) {
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

  const killEngaged =
    bootstrap.globalKillSwitch.engaged || !!activeTenant?.kill_switch.engaged;

  const canSiem = !!activeTenant?.entitlements.has_siem;
  const canSoc = !!activeTenant?.entitlements.has_soc;

  return (
    <header className="sticky top-7 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          <span className="hidden sm:inline">ZenC</span>
        </div>

        {/* product switcher */}
        <div className="flex items-center rounded-md border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setProduct("siem")}
            disabled={!canSiem}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors disabled:opacity-40",
              product === "siem" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            SIEM
          </button>
          <button
            type="button"
            onClick={() => setProduct("soc")}
            disabled={!canSoc}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors disabled:opacity-40",
              product === "soc" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            SOC
          </button>
        </div>

        {/* command palette trigger */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="group ml-1 hidden h-9 min-w-56 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search & commands…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <div className="flex-1 md:hidden" />

        {/* environment + simulation indicators */}
        <Badge variant="outline" className="hidden lg:inline-flex">
          <TestTube2 className="size-3" /> Demo env
        </Badge>

        <Menu
          align="end"
          trigger={
            <Button variant={sim === "normal" ? "ghost" : "outline"} size="sm" className={cn(sim !== "normal" && "border-[var(--warning)] text-[var(--warning)]")}>
              Sim: {SIM_OPTIONS.find((o) => o.value === sim)?.label}
              <ChevronsUpDown className="size-3" />
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Simulate a condition</MenuLabel>
              {SIM_OPTIONS.map((o) => (
                <MenuItem
                  key={o.value}
                  selected={o.value === sim}
                  onClick={() => {
                    setSim(o.value);
                    close();
                  }}
                >
                  <div>
                    <div>{o.label}</div>
                    <div className="text-[11px] text-muted-foreground">{o.desc}</div>
                  </div>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        {/* kill switch status — visible in chrome, not buried in settings */}
        <Badge
          variant={killEngaged ? "danger" : "outline"}
          className="hidden sm:inline-flex"
          title={killEngaged ? "A kill switch is engaged — action execution is halted for its scope" : "No kill switch engaged"}
        >
          {killEngaged ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
          {killEngaged ? "Kill switch ON" : "Kill switch clear"}
        </Badge>

        {/* tenant switcher */}
        <Menu
          align="end"
          trigger={
            <Button variant="outline" size="sm">
              <Building2 className="size-3.5" />
              <span className="max-w-[10rem] truncate">{activeTenant?.name ?? "Tenant"}</span>
              <ChevronsUpDown className="size-3" />
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Switch tenant</MenuLabel>
              {bootstrap.tenants.map((t) => (
                <MenuItem
                  key={t.tenant_id}
                  selected={t.tenant_id === tenantId}
                  onClick={() => {
                    setTenant(t.tenant_id);
                    close();
                  }}
                >
                  <div>
                    <div>{t.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.sector} · {[t.entitlements.has_siem && "SIEM", t.entitlements.has_soc && "SOC"].filter(Boolean).join(" + ") || "no products"} · {ROLES[t.role].label}
                    </div>
                  </div>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        {/* theme */}
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
              {(["light", "dark", "system"] as const).map((t) => (
                <MenuItem key={t} selected={theme === t} onClick={() => { setTheme(t); close(); }} className="capitalize">
                  {t}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        {/* user */}
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="sm">
              <UserCircle2 className="size-4" />
              <span className="hidden max-w-[8rem] truncate md:inline">{user.display_name}</span>
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>{user.display_name}</MenuLabel>
              <div className="px-2 pb-1 text-[11px] text-muted-foreground">
                {role?.label} in {activeTenant?.name}
              </div>
              <MenuSeparator />
              <MenuItem onClick={() => { close(); router.push("/login"); }}>Switch persona…</MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  signOut();
                  router.replace("/login");
                }}
              >
                Sign out
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
