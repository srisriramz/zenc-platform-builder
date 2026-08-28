"use client";

import Link from "next/link";
import { useSocDashboard } from "@/hooks/use-soc";
import { useBootstrap } from "@/hooks/use-platform";
import { drillHref } from "@/lib/use-nav";
import { formatDuration, formatRelative } from "@/lib/time";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { CaseStatusBadge, SeverityBadge, SlaBadge } from "@/components/domain-badges";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";

export default function SocDashboardPage() {
  const q = useSocDashboard();
  const boot = useBootstrap();
  const nameOf = (id: string) => boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;

  if (q.isError) {
    return (
      <>
        <PageHeader title="SOAR Dashboard" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="The SOAR Dashboard needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  if (q.isLoading || !q.data) return <LoadingState label="Loading SOAR dashboard…" />;
  const d = q.data;

  return (
    <>
      <PageHeader
        title="SOAR Dashboard"
        description="Respond layer. ZenC SOAR consumes the alert-envelope contract — it runs whether or not this tenant also has ZenC SIEM. Numbers below cover the demo sample."
      />

      <StatGrid>
        <StatTile
          label="Pending triage"
          value={d.intake.pending_triage}
          tone={d.intake.pending_triage ? "primary" : "success"}
          sub={`${d.intake.accepted} accepted of ${d.intake.received} received`}
          href="/alerts"
        />
        <StatTile label="Open cases" value={d.cases.open} sub={`${d.cases.closed} closed`} href="/cases" />
        <StatTile
          label="SLA breached"
          value={d.sla.breached}
          tone={d.sla.breached ? "danger" : d.sla.at_risk ? "warning" : "success"}
          sub={`${d.sla.at_risk} at risk`}
          href={drillHref("/cases", { status: "" })}
        />
        <StatTile
          label="Evidence pending review"
          value={d.investigation.evidence_pending_review}
          tone={d.investigation.evidence_pending_review ? "warning" : "success"}
          sub={`${d.investigation.tasks_overdue} task(s) overdue`}
          href="/evidence"
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Latency</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="MTTD — detect" hint="occurred → correlated (native)" value={fmt(d.latency.mttd_seconds)} />
            <Row label="MTTA — acknowledge" hint="opened → triaged" value={fmt(d.latency.mtta_seconds)} />
            <Row label="MTTR — resolve" hint="opened → closed" value={fmt(d.latency.mttr_seconds)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open cases by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.keys(d.cases.byStatus).length === 0 && <p className="text-sm text-muted-foreground">No open cases.</p>}
            {Object.entries(d.cases.byStatus).map(([status, n]) => (
              <Link
                key={status}
                href={drillHref("/cases", { status })}
                className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm hover:bg-accent"
              >
                <CaseStatusBadge status={status as never} />
                <span className="font-mono tabular-nums">{n}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Closure mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.keys(d.cases.closureMix).length === 0 && (
              <p className="text-sm text-muted-foreground">No closed cases in the sample.</p>
            )}
            {Object.entries(d.cases.closureMix).map(([cls, n]) => (
              <div key={cls} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                <span className="capitalize">{cls.replace(/_/g, " ")}</span>
                <span className="font-mono tabular-nums">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {d.workload.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Analyst workload — open cases per owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {d.workload.map((w) => (
              <div key={w.owner_id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                <span>{nameOf(w.owner_id)}</span>
                <span className="font-mono tabular-nums">{w.open_cases}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent cases</CardTitle>
          <Link href="/cases" className="text-xs text-primary hover:underline">
            All cases
          </Link>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {d.recentCases.map((c) => (
            <Link
              key={c.case_id}
              href={`/cases/${c.case_id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                {c.severity && <SeverityBadge severity={c.severity} />}
                <span className="font-medium">{c.title ?? c.case_id}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <CaseStatusBadge status={c.status} />
                {c.status !== "closed" && c.sla?.status && <SlaBadge status={c.sla.status} />}
                <span>{nameOf(c.owner_id)}</span>
                <span>· {formatRelative(c.created_at)}</span>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 rounded-xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Playbooks, the approval queue and the Response Executor — M4c.</span>{" "}
        Response planning, no-self-approval enforcement, and the deterministic dry-run executor land next.
      </div>
    </>
  );
}

function fmt(s: number | null) {
  return s != null ? formatDuration(s) : "—";
}

function Row({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">
        {label} <span className="text-[10px]">({hint})</span>
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
