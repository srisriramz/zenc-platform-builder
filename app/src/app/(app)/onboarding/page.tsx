"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useCreateTenant, useCreateUser, useAddTelemetrySource } from "@/hooks/use-platform";
import { ROLES, type RoleId } from "@/data/platform";
import { FAMILY_INGESTION_PROFILE } from "@/data/ingestion-profile";
import type { TelemetrySourceFamily } from "@/schemas";
import { formatTimestamp } from "@/lib/time";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

const STEPS = ["Create tenant", "Invite user", "Add data source", "Done"] as const;

export default function OnboardingPage() {
  const [step, setStep] = React.useState(0);
  const createTenant = useCreateTenant();
  const createUser = useCreateUser();
  const addSource = useAddTelemetrySource();

  const tenant = createTenant.data ?? null;
  const invitedUser = createUser.data ?? null;
  const sourceResult = addSource.data ?? null;

  const restart = () => {
    createTenant.reset();
    createUser.reset();
    addSource.reset();
    setStep(0);
  };

  return (
    <>
      <PageHeader
        title="Onboarding wizard"
        description="Create a tenant, invite its first user, and validate a data source — end to end, no code required."
      />

      <ol className="mb-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={`rounded-full border px-3 py-1 ${i === step ? "border-primary bg-primary/10 font-semibold text-primary" : i < step ? "border-border text-muted-foreground line-through" : "border-border text-muted-foreground"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && <CreateTenantStep mutation={createTenant} onDone={() => setStep(1)} />}

      {step === 1 && tenant && <InviteUserStep tenantId={tenant.tenant_id} tenantName={tenant.name} mutation={createUser} onDone={() => setStep(2)} />}

      {step === 2 && tenant && (
        <AddDataSourceStep
          tenantId={tenant.tenant_id}
          hasSiem={tenant.entitlements.has_siem}
          mutation={addSource}
          onDone={() => setStep(3)}
          onSkip={() => setStep(3)}
        />
      )}

      {step === 3 && tenant && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-[var(--success)]" /> Tenant ready
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{tenant.name}</span>{" "}
              <span className="text-muted-foreground">({tenant.sector})</span> —{" "}
              {tenant.entitlements.has_siem && <Badge variant="primary">SIEM</Badge>}{" "}
              {tenant.entitlements.has_soc && <Badge variant="primary">SOAR</Badge>}{" "}
              {!tenant.entitlements.has_siem && !tenant.entitlements.has_soc && <span className="text-muted-foreground">no products</span>}
            </p>
            {invitedUser && (
              <p>
                Invited <span className="font-medium">{invitedUser.display_name}</span> ({invitedUser.email}) as{" "}
                {ROLES[invitedUser.roles[0].role].label}.
              </p>
            )}
            {sourceResult ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 font-medium text-[var(--success)]">
                  <CheckCircle2 className="size-3.5" /> First event received
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {sourceResult.firstEvent.event_id} · {sourceResult.source.connector_label} · {formatTimestamp(sourceResult.firstEvent.ingested_at)}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">No data source was added for this tenant.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm">
                <Link href="/tenants">Go to Tenants</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/login">Log in as {invitedUser?.display_name ?? "the new user"}</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={restart}>
                Onboard another tenant
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function CreateTenantStep({
  mutation,
  onDone,
}: {
  mutation: ReturnType<typeof useCreateTenant>;
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [hasSiem, setHasSiem] = React.useState(true);
  const [hasSoc, setHasSoc] = React.useState(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Create tenant</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            mutation.mutate({ name: name.trim(), sector: sector.trim(), has_siem: hasSiem, has_soc: hasSoc }, { onSuccess: onDone });
          }}
        >
          <div>
            <Label htmlFor="t-name">Tenant name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fairview Regional Bank" />
          </div>
          <div>
            <Label htmlFor="t-sector">Sector</Label>
            <Input id="t-sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="e.g. BFSI" />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasSiem} onChange={(e) => setHasSiem(e.target.checked)} /> ZenC SIEM
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasSoc} onChange={(e) => setHasSoc(e.target.checked)} /> ZenC SOAR
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground" title="Assessment stays off until Phase 2 is explicitly reactivated.">
              <input type="checkbox" checked={false} disabled /> ZenC Assessment (Phase 2 — off everywhere)
            </label>
          </div>
          <Button type="submit" size="sm" disabled={mutation.isPending || !name.trim()}>
            Create tenant
          </Button>
          {mutation.isError && <p className="text-xs text-[var(--destructive)]">{(mutation.error as Error)?.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function InviteUserStep({
  tenantId,
  tenantName,
  mutation,
  onDone,
}: {
  tenantId: string;
  tenantName: string;
  mutation: ReturnType<typeof useCreateUser>;
  onDone: () => void;
}) {
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<RoleId>("analyst");

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Invite user to {tenantName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!displayName.trim() || !email.trim()) return;
            mutation.mutate({ display_name: displayName.trim(), email: email.trim(), tenant_id: tenantId, role }, { onSuccess: onDone });
          }}
        >
          <div>
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Jordan Lee" />
          </div>
          <div>
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan.lee@demo.zenc.example" />
          </div>
          <div>
            <Label htmlFor="u-role">Role</Label>
            <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as RoleId)} className="max-w-xs">
              {Object.values(ROLES)
                .filter((r) => r.id !== "super_admin")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={mutation.isPending || !displayName.trim() || !email.trim()}>
            Invite
          </Button>
          {mutation.isError && <p className="text-xs text-[var(--destructive)]">{(mutation.error as Error)?.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function AddDataSourceStep({
  tenantId,
  hasSiem,
  mutation,
  onDone,
  onSkip,
}: {
  tenantId: string;
  hasSiem: boolean;
  mutation: ReturnType<typeof useAddTelemetrySource>;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [family, setFamily] = React.useState<TelemetrySourceFamily>("windows");
  const [connectorName, setConnectorName] = React.useState("");

  if (!hasSiem) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>3. Add data source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">This tenant isn&apos;t entitled to ZenC SIEM, so there&apos;s no telemetry to connect.</p>
          <Button size="sm" onClick={onSkip}>
            Finish
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Add data source</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ tenant_id: tenantId, family, connector_name: connectorName.trim() || undefined }, { onSuccess: onDone });
          }}
        >
          <div>
            <Label htmlFor="src-family">Source family</Label>
            <Select id="src-family" value={family} onChange={(e) => setFamily(e.target.value as TelemetrySourceFamily)} className="max-w-xs">
              {Object.entries(FAMILY_INGESTION_PROFILE).map(([key, profile]) => (
                <option key={key} value={key}>
                  {profile.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="src-name">Connector name (optional)</Label>
            <Input id="src-name" value={connectorName} onChange={(e) => setConnectorName(e.target.value)} placeholder="e.g. Branch Firewall (CEF)" />
          </div>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            Add &amp; validate first event
          </Button>
          {mutation.isError && <p className="text-xs text-[var(--destructive)]">{(mutation.error as Error)?.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
