"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BootstrapData } from "@/mock/api";
import { ROLES } from "@/data/platform";
import { NAV_ITEMS, type NavItem } from "./nav";
import { useSession } from "@/store/session";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

export function SideNav({
  bootstrap,
  variant = "desktop",
}: {
  bootstrap: BootstrapData;
  variant?: "desktop" | "mobile";
}) {
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

  const body = (
    <>
      {sections.map((section) => {
        const items = visible.filter((i) => i.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section} className="mb-5">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
              {section}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-all",
                          active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                        )}
                      />
                      <Icon className={cn("size-4 flex-none transition-colors", active ? "text-primary" : "text-muted-foreground/70")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.milestone && (
                        <Badge variant="outline" className="px-1 py-0 text-[9px] font-medium">
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
    </>
  );

  if (variant === "mobile") {
    return <nav className="px-2 py-4" aria-label="Primary">{body}</nav>;
  }

  return (
    <nav className="sticky top-[5.75rem] hidden h-[calc(100vh-7rem)] w-60 shrink-0 overflow-y-auto border-r border-border px-3 py-6 lg:block" aria-label="Primary">
      {body}
    </nav>
  );
}
