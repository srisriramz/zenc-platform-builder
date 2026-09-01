"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CornerDownLeft, FlaskConical, PlayCircle, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BootstrapData } from "@/mock/api";
import { ROLES } from "@/data/platform";
import { NAV_ITEMS } from "./nav";
import { useSession } from "@/store/session";
import { Dialog } from "@/components/ui/dialog";
import { Input, Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Group = "Navigate" | "Demo" | "Tenants" | "Simulation";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: Group;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  bootstrap,
}: {
  open: boolean;
  onClose: () => void;
  bootstrap: BootstrapData;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);

  const tenantId = useSession((s) => s.tenantId);
  const setTenant = useSession((s) => s.setTenant);
  const setProduct = useSession((s) => s.setProduct);
  const setSim = useSession((s) => s.setSim);

  const tenant = bootstrap.tenants.find((t) => t.tenant_id === tenantId) ?? bootstrap.tenants[0];
  const perms = tenant ? new Set(ROLES[tenant.role].permissions) : new Set<string>();

  const commands = React.useMemo<Command[]>(() => {
    const nav: Command[] = NAV_ITEMS.filter((i) => {
      if (i.requires && tenant && !tenant.entitlements[i.requires]) return false;
      if (i.permission && !perms.has(i.permission)) return false;
      return true;
    }).map((i) => ({
      id: `nav:${i.href}`,
      label: i.label,
      hint: i.section,
      group: "Navigate" as const,
      icon: i.icon,
      run: () => {
        if (i.product === "siem" || i.product === "soc") setProduct(i.product);
        router.push(i.href);
        onClose();
      },
    }));

    const demo: Command[] = [
      {
        id: "demo:open",
        label: "Guided demo",
        hint: "Scripted walkthroughs",
        group: "Demo" as const,
        icon: PlayCircle,
        run: () => {
          router.push("/demo");
          onClose();
        },
      },
    ];

    const tenants: Command[] = bootstrap.tenants.map((t) => ({
      id: `tenant:${t.tenant_id}`,
      label: t.name,
      hint: [t.entitlements.has_siem && "SIEM", t.entitlements.has_soc && "SOAR"].filter(Boolean).join(" + "),
      group: "Tenants" as const,
      icon: Building2,
      run: () => {
        setTenant(t.tenant_id);
        onClose();
      },
    }));

    const sims: Command[] = (
      [
        ["normal", "Normal"],
        ["slow", "Slow network"],
        ["timeout", "Timeout"],
        ["server_error", "Server error"],
        ["degraded_source", "Degraded source"],
        ["partial", "Partial results"],
      ] as const
    ).map(([value, label]) => ({
      id: `sim:${value}`,
      label,
      hint: "Simulate a condition",
      group: "Simulation" as const,
      icon: FlaskConical,
      run: () => {
        setSim(value);
        onClose();
      },
    }));

    return [...nav, ...demo, ...tenants, ...sims];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.tenants, tenant, router]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = !needle
      ? commands.filter((c) => c.group === "Navigate").slice(0, 8)
      : commands.filter((c) => c.label.toLowerCase().includes(needle) || c.hint?.toLowerCase().includes(needle)).slice(0, 14);
    return list;
  }, [q, commands]);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQ("");
      setActive(0);
    }
  }
  const [prevQ, setPrevQ] = React.useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setActive(0);
  }

  const groups: Group[] = ["Navigate", "Demo", "Tenants", "Simulation"];
  let flatIndex = -1;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="cmdk-title" className="max-w-xl">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-muted-foreground" />
        <h2 id="cmdk-title" className="sr-only">
          Search and commands
        </h2>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search screens, tenants, simulations…"
          className="h-12 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              filtered[active]?.run();
            }
          }}
        />
      </div>
      <div className="max-h-[22rem] overflow-y-auto p-1.5">
        {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{q}”.</p>}
        {groups.map((group) => {
          const rows = filtered.filter((c) => c.group === group);
          if (rows.length === 0) return null;
          return (
            <div key={group} className="mb-1">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{group}</p>
              {rows.map((c) => {
                flatIndex++;
                const i = flatIndex;
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => c.run()}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    )}
                  >
                    <Icon className="size-4 flex-none text-muted-foreground" />
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {c.hint}
                      {i === active ? <CornerDownLeft className="size-3" /> : <ArrowRight className="size-3 opacity-0" />}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
        <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
      </div>
    </Dialog>
  );
}
