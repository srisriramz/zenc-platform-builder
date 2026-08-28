"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { USERS, TENANT_MAP, ROLES } from "@/data/platform";
import { useSession } from "@/store/session";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

/**
 * Demo persona picker. NOT authentication — no passwords, no account creation.
 * It selects which seeded user/role/tenant the demo runs as so RBAC/ABAC and
 * entitlement gating are shown live.
 */
export default function LoginPage() {
  const router = useRouter();
  const hydrated = useSession((s) => s.hydrated);
  const signIn = useSession((s) => s.signIn);

  React.useEffect(() => {
    if (hydrated && useSession.getState().userId) router.replace("/siem-dashboard");
  }, [hydrated, router]);

  return (
    <div className="relative mx-auto grid min-h-[calc(100vh-1.75rem)] max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.85fr_1fr] lg:items-center lg:py-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(600px circle at 15% 20%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 60%), radial-gradient(500px circle at 85% 80%, color-mix(in oklch, var(--gold) 12%, transparent), transparent 55%)",
        }}
      />

      <div className="anim-rise space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_60%,var(--gold))] text-primary-foreground shadow-md">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">ZenC Security Intelligence Platform</p>
            <p className="text-xs text-muted-foreground">SIEM · SOAR — interactive demo</p>
          </div>
        </div>
        <h1 className="max-w-md text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
          Detect with the SIEM. Respond with SOAR. One governed platform.
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Pick a persona to explore. Each one carries a different role in different tenants, so role-based access,
          tenant isolation, and independent SIEM / SOAR entitlements all behave live.
        </p>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          {[
            "Deterministic correlation & detection — no LLM decides a match",
            "Agents recommend; humans and deterministic services execute",
            "Every response action is dry-run only",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 size-3.5 flex-none text-primary" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="anim-rise anim-delay-2 grid gap-3 sm:grid-cols-2">
        {USERS.map((u) => {
          const first = u.roles[0];
          return (
            <Card key={u.user_id} interactive className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                <div>
                  <p className="text-sm font-semibold">{u.display_name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-1 flex-wrap content-start gap-1.5">
                  {u.roles.map((r) => (
                    <Badge key={r.tenant_id} variant="outline" className="text-[10px]">
                      {ROLES[r.role].label} · {TENANT_MAP[r.tenant_id]?.name.replace(" (demo)", "")}
                    </Badge>
                  ))}
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => {
                    signIn(u.user_id, first.tenant_id);
                    router.replace("/siem-dashboard");
                  }}
                >
                  Continue as {u.display_name.split(" ")[0]}
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <p className="col-span-full mt-1 text-center text-xs text-muted-foreground">
          No real credentials are ever entered or stored.
        </p>
      </div>
    </div>
  );
}
