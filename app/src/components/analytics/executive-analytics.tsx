"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, FileText, Info } from "lucide-react";
import { useSocDashboard, useSocReport, useActionLog, useRunReportingAgent } from "@/hooks/use-soc";
import { useCoverageMatrix } from "@/hooks/use-siem";
import { useCapabilities } from "@/hooks/use-platform";
import { formatDuration } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { BarList, type BarDatum } from "@/components/ui/bar-list";
import { QueryErrorState, TableSkeleton } from "@/components/states";

export function ExecutiveAnalytics() {
  const caps = useCapabilities();
  const dash = useSocDashboard();
  const report = useSocReport();
  const actions = useActionLog();
  const draft = useRunReportingAgent();
  const [shownDraft, setShownDraft] = React.useState<string | null>(null);

  const ent = caps.data?.tenant?.entitlements;
  const hasSiem = !!ent?.has_siem;
  const coverage = useCoverageMatrix(hasSiem);

  if (dash.isError || report.isError) return <QueryErrorState error={dash.error ?? report.error} onRetry={() => { dash.refetch(); report.refetch(); }} />;
  if (dash.isLoading || report.isLoading || !dash.data || !report.data) return <TableSkeleton rows={8} cols={4} />;

  const d = dash.data;
  const r = report.data.report;

  const criticalOpen = d.cases.bySeverity["critical"] ?? 0;

  // response success rate — verified / decided
  const decided = (actions.data ?? []).filter((a) => ["executed", "verified", "denied", "rolled_back", "expired"].includes(a.request.status));
  const succeeded = decided.filter((a) => a.request.status === "verified" || a.request.status === "executed").length;
  const responseSuccessPct = decided.length ? Math.round((succeeded / decided.length) * 100) : null;

  // top adversary techniques this period (from the KPI aggregate)
  const topTech: BarDatum[] = r.top_techniques.slice(0, 6).map((t) => ({
    key: t.technique_id,
    label: (
      <span className="text-xs">
        <span className="font-mono text-muted-foreground">{t.technique_id}</span> {t.technique_name}
      </span>
    ),
    value: t.count,
    display: String(t.count),
  }));

  const activeDraft = shownDraft ?? draft.data?.narrative ?? report.data.last_draft?.preview ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 flex-none" />
        <span>
          This tenant has{" "}
          <span className="font-medium text-foreground">
            {[ent?.has_siem && "ZenC SIEM", ent?.has_soc && "ZenC SOAR"].filter(Boolean).join(" + ") || "no live products"}
          </span>
          . An absent product is shown as a gap below, never silently omitted.
        </span>
      </div>

      <StatGrid>
        <StatTile
          label="Detection coverage"
          value={hasSiem && coverage.data ? `${coverage.data.kpis.detection_coverage_pct}%` : "—"}
          sub={hasSiem ? "ATT&CK techniques with an enabled rule" : "needs ZenC SIEM"}
          href={hasSiem ? "/coverage" : undefined}
          tone="primary"
        />
        <StatTile
          label="Defensive coverage"
          value={hasSiem && coverage.data ? `${coverage.data.kpis.response_coverage_pct}%` : "—"}
          sub={hasSiem ? "techniques with a response playbook" : "needs ZenC SIEM"}
          href={hasSiem ? "/coverage" : undefined}
        />
        <StatTile label="MTTD → MTTR" value={`${short(r.latency.mttd_seconds)} → ${short(r.latency.mttr_seconds)}`} sub="detect to resolve, mean" href="/reporting" />
        <StatTile
          label="Open critical incidents"
          value={criticalOpen}
          tone={criticalOpen ? "danger" : "success"}
          sub={`${d.cases.open} open cases total`}
          href="/cases"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline latency breakdown</CardTitle>
            <p className="text-xs text-muted-foreground">Where the time actually goes between an event and a closed case.</p>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {r.latency.pipeline.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {s.label} <span className="text-[10px]">({s.note})</span>
                </span>
                <span className="font-mono tabular-nums">{s.seconds != null ? formatDuration(s.seconds) : "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top adversary techniques — this period</CardTitle>
            <p className="text-xs text-muted-foreground">By alert count in the sample.</p>
          </CardHeader>
          <CardContent>{topTech.length ? <BarList data={topTech} /> : <p className="text-sm text-muted-foreground">No alerts with technique claims.</p>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>SLA compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{r.quality.sla_compliance_pct}%</span>
              <span className="text-sm text-muted-foreground">{r.quality.sla_breached} breached</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Response success</CardTitle>
          </CardHeader>
          <CardContent>
            {responseSuccessPct == null ? (
              <p className="text-sm text-muted-foreground">No response actions decided yet.</p>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{responseSuccessPct}%</span>
                <span className="text-sm text-muted-foreground">{succeeded}/{decided.length} verified (dry-run)</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Agent-assisted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{r.quality.agent_assisted_pct}%</span>
              <span className="text-sm text-muted-foreground">of {r.throughput.cases_opened} cases</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--info)]/40">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" /> Reporting Agent narrative
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              <Badge variant="warning">draft — not published</Badge> External-facing copy needs human review and sign-off.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={draft.isPending} onClick={() => draft.mutate(undefined, { onSuccess: (x) => setShownDraft(x.narrative) })}>
            <Bot className="size-3.5" /> {draft.isPending ? "Drafting…" : "Draft"}
          </Button>
        </CardHeader>
        <CardContent>
          {activeDraft ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{activeDraft}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No draft yet. The Reporting Agent composes a narrative from the KPI aggregates above.{" "}
              <Link href="/reporting" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                Full report <ArrowUpRight className="size-3" />
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function short(s: number | null): string {
  return s != null ? formatDuration(s) : "—";
}
