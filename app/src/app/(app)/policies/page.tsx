"use client";

import { Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePolicies } from "@/hooks/use-platform";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { QueryErrorState, LoadingState } from "@/components/states";

export default function PoliciesPage() {
  const policies = usePolicies();

  return (
    <>
      <PageHeader
        title="Policies & Kill Switches"
        description="Per-tenant autonomy, approval, and rule-promotion policy. Some guarantees are not tenant-configurable and are locked."
      />

      {policies.isLoading && <LoadingState label="Loading policy engine…" />}
      {policies.isError && <QueryErrorState error={policies.error} onRetry={() => policies.refetch()} />}

      {policies.data && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Kill switches</CardTitle>
              <p className="text-sm text-muted-foreground">
                A kill switch halts all pending and in-flight action execution for its scope. Status is always visible in
                the top bar, never buried here.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <KillRow scope="Global" engaged={policies.data.globalKillSwitch.engaged} reason={policies.data.globalKillSwitch.engaged_reason} />
              {policies.data.partners.map((p) => (
                <KillRow key={p.partner_id} scope={`Partner · ${p.name}`} engaged={p.kill_switch.engaged} reason={p.kill_switch.engaged_reason} />
              ))}
              {policies.data.tenants.map((t) => (
                <KillRow key={t.tenant_id} scope={`Tenant · ${t.name}`} engaged={t.policy.kill_switch.engaged} reason={t.policy.kill_switch.engaged_reason} />
              ))}
            </CardContent>
          </Card>

          {policies.data.tenants.map((t) => (
            <Card key={t.tenant_id}>
              <CardHeader>
                <CardTitle>{t.name} — policy</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field label="Default autonomy level (new agent capability)" value={t.policy.default_autonomy_level} />
                <Field
                  label="Pre-authorized action classes"
                  value={t.policy.pre_authorized_action_classes.join(", ") || "none"}
                />
                <LockedField label="Rule promotion to enabled" value="Always requires one independent human approver" />
                <LockedField label="Self-approval" value="Never permitted (schema-enforced)" />
                <LockedField label="A4 actions" value="Always require independent human approval, regardless of policy" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function KillRow({ scope, engaged, reason }: { scope: string; engaged: boolean; reason?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <span className="font-medium">{scope}</span>
      <span className="flex items-center gap-2">
        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
        <Badge variant={engaged ? "danger" : "success"}>
          {engaged ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
          {engaged ? "Engaged" : "Disarmed"}
        </Badge>
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Lock className="size-3" /> {label}
      </p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
