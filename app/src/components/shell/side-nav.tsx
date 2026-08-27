"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BootstrapData } from "@/mock/api";
import { ROLES } from "@/data/platform";
import { NAV_ITEMS, type NavItem } from "./nav";
import { useSession } from "@/store/session";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

export function SideNav({ bootstrap }: { bootstrap: BootstrapData }) {
  const pathname = usePathname();
  const tenantId = useSession((s) => s.tenantId);
  const product = useSession((s) => s.product);

  const tenant = bootstrap.tenants.find((t) => t.tenant_id === tenantId) ?? bootstrap.tenants[0];
  if (!tenant) return null;
  const perms = new Set(ROLES[tenant.role].permissions);

  const visible = NAV_ITEMS.filter((item) => {
    if (item.requires && !tenant.entitlements[item.requires]) return false;
    if (item.permission && !perms.has(item.permission)) return false;
    if (item.product === "siem" && product !== "siem") return false;
    if (item.product === "soc" && product !== "soc") return false;
    return true;
  });

  const sections: NavItem["section"][] = ["SIEM", "SOC", "Platform"];

  return (
    <nav className="hidden w-60 shrink-0 border-r border-border px-3 py-6 md:block" aria-label="Primary">
      {sections.map((section) => {
        const items = visible.filter((i) => i.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section} className="mb-6">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <span>{item.label}</span>
                      {item.milestone && (
                        <Badge variant="outline" className="px-1 py-0 text-[9px]">
                          {item.milestone}
                        </Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
