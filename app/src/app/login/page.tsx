"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { USERS, TENANT_MAP, ROLES } from "@/data/platform";
import { useSession } from "@/store/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";

/**
 * Demo persona picker. This is NOT authentication — no passwords, no account
 * creation (prohibited actions). It selects which seeded user/role/tenant the
 * demo runs as, so RBAC/ABAC and entitlement gating can be shown live.
 */
export default function LoginPage() {
  const router = useRouter();
  const hydrated = useSession((s) => s.hydrated);
  const signIn = useSession((s) => s.signIn);

  React.useEffect(() => {
    if (hydrated && useSession.getState().userId) router.replace("/siem-dashboard");
  }, [hydrated, router]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-1.75rem)] max-w-3xl flex-col justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <ShieldCheck className="size-7 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">ZenC Security Intelligence Platform</h1>
          <p className="text-sm text-muted-foreground">Choose a demo persona to explore ZenC SIEM and ZenC SOC.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {USERS.map((u) => {
          const first = u.roles[0];
          return (
            <Card key={u.user_id}>
              <CardHeader>
                <CardTitle>{u.display_name}</CardTitle>
                <CardDescription>{u.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {u.roles.map((r) => (
                    <Badge key={r.tenant_id} variant="outline">
                      {ROLES[r.role].label} · {TENANT_MAP[r.tenant_id]?.name.replace(" (demo)", "")}
                    </Badge>
                  ))}
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    signIn(u.user_id, first.tenant_id);
                    router.replace("/siem-dashboard");
                  }}
                >
                  Continue as {u.display_name.split(" ")[0]}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Interactive demo with mock data. No real credentials are ever entered or stored.
      </p>
    </div>
  );
}
