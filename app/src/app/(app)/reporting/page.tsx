"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, FileText } from "lucide-react";
import { useSocReport, useRunReportingAgent } from "@/hooks/use-soc";
import { useBootstrap } from "@/hooks/use-platform";
import { formatDuration } from "@/lib/time";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";

export default function ReportingPage() {
  const q = useSocReport();
  const boot = useBootstrap();
  const draft = useRunReportingAgent();
  const nameOf = (id: string) => boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;
  const [shownDraft, setShownDraft] = React.useState<string | null>(null);

  if (q.isError) {
    return (
      <>
        <PageHeader title="SOAR Reporting" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Reporting needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  if (q.isLoading || !q.data) return <LoadingState label="Aggregating KPIs…" />;
  const { report: r, last_draft } = q.data;
  const activeDraft = shownDraft ?? draft.data?.narrative ?? last_draft?.preview ?? null;

  return (
    <>
      <PageHeader
        title="SOAR Reporting"
        description="Operational throughput KPIs for the demo sample — MTTD/MTTA/MTTR with the stage-by-stage pipeline breakdown, alert-to-case conversion, closure mix, agent-assisted ratio, SLA compliance, analyst workload, and the detection/defensive coverage % (computed by ZenC SIEM, surfaced here)."
      >
        <Button size="sm" variant="outline" disabled={draft.isPending} onClick={() => draft.mutate(undefined, { onSuccess: (d) => setShownDraft(d.narrative) })}>
          <Bot className="size-3.5" /> {draft.isPending ? "Drafting…" : "Draft report narrative"}
        </Button>
      </PageHeader>

      <StatGrid>
        <StatTile label="MTTD" value={fmt(r.latency.mttd_seconds)} sub="occurred → correlated (native)" tone="primary" />
        <StatTile label="MTTA" value={fmt(r.latency.mtta_seconds)} sub="received → triaged" />
        <StatTile label="MTTR" value={fmt(r.latency.mttr_seconds)} sub="opened → closed" />
        <StatTile
          label="SLA compliance"
          value={`${r.quality.sla_compliance_pct}%`}
          tone={r.quality.sla_breached ? "warning" : "success"}
          sub={`${r.quality.sla_breached} breached`}
        />
      </StatGrid>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pipeline latency breakdown</CardTitle>
          <p className="text-xs text-muted-foreground">The stage-by-stage timing that makes up MTTD/MTTR — not one black-box number.</p>
        </CardHeader>
        <CardContent>
          <PipelineBar stages={r.latency.pipeline} />
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Alert → case conversion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Accepted alerts" value={r.throughput.alerts_accepted} />
            <Row label="Grouped candidates" value={r.throughput.candidates} />
            <Row label="Cases opened" value={r.throughput.cases_opened} />
            <div className="mt-1 border-t border-border pt-1.5">
              <Row label="Conversion rate" value={`${r.throughput.alert_to_case_pct}%`} strong />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Closure mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {r.throughput.closure_mix.length === 0 && <p className="text-sm text-muted-foreground">No cases closed in the sample.</p>}
            {r.throughput.closure_mix.map((c) => (
              <div key={c.classification} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                <span className="capitalize">{c.classification.replace(/_/g, " ")}</span>
                <span className="font-mono tabular-nums">{c.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resolution &amp; coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Agent-assisted cases" value={`${r.quality.agent_assisted_cases}/${r.throughput.cases_opened} (${r.quality.agent_assisted_pct}%)`} />
            <Row label="Fully manual" value={r.quality.manual_cases} />
            {r.quality.agent_runs_reviewed > 0 && (
              <Row label="Agent acceptance" value={`${r.quality.agent_acceptance_pct}% (${r.quality.agent_runs_reviewed} reviewed)`} />
            )}
            <div className="mt-1 border-t border-border pt-1.5">
              {r.coverage ? (
                <>
                  <Row label="Detection coverage" value={`${r.coverage.detection_pct}%`} />
                  <Row label="Defensive coverage" value={`${r.coverage.response_pct}%`} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    across {r.coverage.techniques_in_scope} techniques —{" "}
                    <Link href="/coverage" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      matrix <ArrowUpRight className="size-3" />
                    </Link>
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Coverage % needs ZenC SIEM — not entitled for this tenant.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {r.workload.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Analyst workload — open cases per owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {r.workload.map((w) => (
              <div key={w.owner_id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                <span>{nameOf(w.owner_id)}</span>
                <span className="font-mono tabular-nums">{w.open_cases}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeDraft && (
        <Card className="mt-4 border-[var(--info)]/40">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" /> Reporting Agent draft
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Deterministic summary of the KPIs above. <Badge variant="warning">draft — not published</Badge> External-facing copy needs human review and sign-off.
              </p>
            </div>
            {(draft.data?.run_id || last_draft?.run_id) && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/agents/runs/${draft.data?.run_id ?? last_draft?.run_id}`}>agent run</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{activeDraft}</pre>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function fmt(s: number | null) {
  return s != null ? formatDuration(s) : "—";
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "font-mono font-semibold tabular-nums" : "font-mono tabular-nums"}>{value}</span>
    </div>
  );
}

function PipelineBar({ stages }: { stages: { key: string; label: string; seconds: number | null; note?: string }[] }) {
  const known = stages.filter((s) => s.seconds != null) as { key: string; label: string; seconds: number; note?: string }[];
  const total = known.reduce((sum, s) => sum + s.seconds, 0);
  const TONE: Record<string, string> = {
    collection: "var(--muted-foreground)",
    siem_detection: "var(--info)",
    handoff: "var(--warning)",
    soc_ack: "var(--primary)",
    resolve: "var(--success)",
  };
  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {known.map((s) => (
          <div
            key={s.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${total ? (s.seconds / total) * 100 : 0}%`, backgroundColor: `color-mix(in oklch, ${TONE[s.key] ?? "var(--border)"} 65%, transparent)` }}
            title={`${s.label}: ${formatDuration(s.seconds)}`}
          />
        ))}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((s) => (
          <li key={s.key} className="rounded-md border border-border p-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: `color-mix(in oklch, ${TONE[s.key] ?? "var(--border)"} 65%, transparent)` }} />
              <span className="font-medium">{s.label}</span>
            </div>
            <p className="mt-0.5 font-mono tabular-nums">{s.seconds != null ? formatDuration(s.seconds) : "—"}</p>
            {s.note && <p className="text-[10px] text-muted-foreground">{s.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
