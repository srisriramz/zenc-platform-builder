"use client";

import * as React from "react";
import { Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePolicies, useUpdateTenantPolicy } from "@/hooks/use-platform";
import { useKillSwitches, useToggleKillSwitch } from "@/hooks/use-soc";
import type { TenantPolicy } from "@/data/platform";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { QueryErrorState, LoadingState } from "@/components/states";

const AUTONOMY_LEVELS: { level: TenantPolicy["default_autonomy_level"]; label: string }[] = [
  { level: "L1", label: "L1 · Read-only investigation" },
  { level: "L2", label: "L2 · Recommend + approval" },
  { level: "L3", label: "L3 · Bounded reversible execution" },
  { level: "L4", label: "L4 · Narrow emergency + rollback" },
];

const ACTION_CLASSES: { cls: "A1" | "A2" | "A3"; label: string }[] = [
  { cls: "A1", label: "A1 · Read-only retrieval" },
  { cls: "A2", label: "A2 · Reversible internal change" },
  { cls: "A3", label: "A3 · Security-control change" },
];

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
          <KillSwitchCard />

          {policies.data.tenants.map((t) => (
            <Card key={t.tenant_id}>
              <CardHeader>
                <CardTitle>{t.name} — policy</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <AutonomyLevelField tenantId={t.tenant_id} value={t.policy.default_autonomy_level} editable={!!policies.data.can_edit_policy} />
                <ActionClassesField
                  tenantId={t.tenant_id}
                  value={t.policy.pre_authorized_action_classes}
                  editable={!!policies.data.can_edit_policy}
                />
                <Field
                  label="L3 pre-authorized A3 action types"
                  value={t.policy.l3_preauthorized_action_types?.join(", ") || "none — every A3 needs approval"}
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

function KillSwitchCard() {
  const q = useKillSwitches();
  const toggle = useToggleKillSwitch();
  const [reasonFor, setReasonFor] = React.useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kill switches</CardTitle>
        <p className="text-sm text-muted-foreground">
          A kill switch halts <span className="font-medium text-foreground">all pending and in-flight</span> action
          execution for its scope — the deterministic executor refuses to run, stopping a multi-step playbook between
          steps, not just blocking new approvals. Status is also shown in the top bar.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading && <LoadingState label="Loading…" />}
        {q.data?.switches.map((s) => (
          <div key={s.key} className="rounded-md border border-border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{s.label}</span>
              <span className="flex items-center gap-2">
                {s.engaged_reason && <span className="text-xs text-muted-foreground">{s.engaged_reason}</span>}
                <Badge variant={s.engaged ? "danger" : "success"}>
                  {s.engaged ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
                  {s.engaged ? "Engaged" : "Disarmed"}
                </Badge>
              </span>
            </div>
            {q.data?.can_toggle && (
              <div className="mt-2 flex items-center gap-1.5">
                {s.engaged ? (
                  <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate({ key: s.key, engaged: false })}>
                    Disarm
                  </Button>
                ) : (
                  <>
                    <Input
                      className="h-8 flex-1"
                      placeholder="Reason (required to engage)"
                      value={reasonFor[s.key] ?? ""}
                      onChange={(e) => setReasonFor((p) => ({ ...p, [s.key]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={toggle.isPending || !(reasonFor[s.key] ?? "").trim()}
                      onClick={() => toggle.mutate({ key: s.key, engaged: true, reason: reasonFor[s.key] })}
                    >
                      Engage
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {toggle.isError && <p className="text-xs text-[var(--destructive)]">{(toggle.error as Error)?.message}</p>}
      </CardContent>
    </Card>
  );
}

function AutonomyLevelField({
  tenantId,
  value,
  editable,
}: {
  tenantId: string;
  value: TenantPolicy["default_autonomy_level"];
  editable: boolean;
}) {
  const update = useUpdateTenantPolicy();
  if (!editable) return <Field label="Default autonomy level (new agent capability)" value={AUTONOMY_LEVELS.find((l) => l.level === value)?.label ?? value} />;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Default autonomy level (new agent capability)</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {AUTONOMY_LEVELS.map((l) => (
          <Button
            key={l.level}
            size="sm"
            variant={l.level === value ? "default" : "outline"}
            disabled={update.isPending}
            onClick={() => update.mutate({ tenantId, patch: { default_autonomy_level: l.level } })}
          >
            {l.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ActionClassesField({
  tenantId,
  value,
  editable,
}: {
  tenantId: string;
  value: ("A0" | "A1" | "A2" | "A3" | "A4")[];
  editable: boolean;
}) {
  const update = useUpdateTenantPolicy();
  if (!editable) return <Field label="Pre-authorized action classes" value={value.join(", ") || "none"} />;
  const toggle = (cls: "A1" | "A2" | "A3") => {
    const next = value.includes(cls) ? value.filter((c) => c !== cls) : [...value, cls];
    update.mutate({ tenantId, patch: { pre_authorized_action_classes: next } });
  };
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Pre-authorized action classes</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {ACTION_CLASSES.map((a) => (
          <Button
            key={a.cls}
            size="sm"
            variant={value.includes(a.cls) ? "default" : "outline"}
            disabled={update.isPending}
            onClick={() => toggle(a.cls)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">A4 is never offered here — it always requires independent human approval.</p>
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
