"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import type { BootstrapData } from "@/mock/api";
import { ROLES } from "@/data/platform";
import { NAV_ITEMS } from "./nav";
import { useSession } from "@/store/session";
import { Dialog } from "@/components/ui/dialog";
import { Input, Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
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
      label: `Go to ${i.label}`,
      hint: i.section + (i.milestone ? ` · ${i.milestone}` : ""),
      run: () => {
        if (i.product === "siem" || i.product === "soc") setProduct(i.product);
        router.push(i.href);
        onClose();
      },
    }));

    const tenants: Command[] = bootstrap.tenants.map((t) => ({
      id: `tenant:${t.tenant_id}`,
      label: `Switch tenant → ${t.name}`,
      hint: "Tenant",
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
      label: `Simulate: ${label}`,
      hint: "Simulation",
      run: () => {
        setSim(value);
        onClose();
      },
    }));

    return [...nav, ...tenants, ...sims];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.tenants, tenant, router]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands.slice(0, 8);
    return commands.filter((c) => c.label.toLowerCase().includes(needle) || c.hint?.toLowerCase().includes(needle)).slice(0, 12);
  }, [q, commands]);

  // Reset on open, and reset the active row when the query changes — both via
  // the "adjust state while rendering" pattern rather than an effect.
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
          className="h-11 border-0 shadow-none focus-visible:ring-0"
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
      <ul className="max-h-80 overflow-y-auto p-1">
        {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>}
        {filtered.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => c.run()}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <span>{c.label}</span>
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {c.hint}
                {i === active && <CornerDownLeft className="size-3" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
        <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
      </div>
    </Dialog>
  );
}
