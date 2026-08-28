"use client";

import Link from "next/link";
import { useSocDashboard, useSocReport } from "@/hooks/use-soc";
import { useAgentRuns, useCorrelationRules } from "@/hooks/use-siem";
import { useBootstrap } from "@/hooks/use-platform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { BarList, type BarDatum } from "@/components/ui/bar-list";
import { QueryErrorState, TableSkeleton } from "@/components/states";
import type { RuleLifecycleState } from "@/schemas";

const RULE_STATE_ORDER: RuleLifecycleState[] = ["draft", "test", "peer_review", "approved", "enabled", "disabled", "retired"];

export function ManagerAnalytics() {
  const dash = useSocDashboard();
  const report = useSocReport();
  const rules = useCorrelationRules();
  const runs = useAgentRuns();
  const boot = useBootstrap();
  const nameOf = (id: string) => boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;

  if (dash.isError || report.isError) return <QueryErrorState error={dash.error ?? report.error} onRetry={() => { dash.refetch(); report.refetch(); }} />;
  if (dash.isLoading || report.isLoading || !dash.data || !report.data) return <TableSkeleton rows={8} cols={4} />;

  const d = dash.data;
  const r = report.data.report;

  const workloadBars: BarDatum[] = r.workload.map((w) => ({ key: w.owner_id, label: nameOf(w.owner_id), value: w.open_cases, display: String(w.open_cases) }));
  const closureBars: BarDatum[] = r.throughput.closure_mix.map((c) => ({
    key: c.classification,
    label: <span className="capitalize">{c.classification.replace(/_/g, " ")}</span>,
    value: c.count,
    display: String(c.count),
  }));

  // detection-engineering throughput
  const ruleCounts = new Map<RuleLifecycleState, number>();
  for (const rule of rules.data ?? []) ruleCounts.set(rule.lifecycle_state, (ruleCounts.get(rule.lifecycle_state) ?? 0) + 1);
  const ruleBars: BarDatum[] = RULE_STATE_ORDER.filter((s) => (ruleCounts.get(s) ?? 0) > 0).map((s) => ({
    key: s,
    label: <span className="capitalize">{s.replace("_", " ")}</span>,
    value: ruleCounts.get(s) ?? 0,
    display: String(ruleCounts.get(s) ?? 0),
  }));

  // agent acceptance — of runs that reached a human, how many without a correction
  const humanTouched = (runs.data ?? []).filter((run) => run.human_touchpoints.length > 0);
  const corrected = humanTouched.filter((run) => run.human_touchpoints.some((h) => h.action === "corrected") || run.analyst_feedback);
  const acceptancePct = humanTouched.length ? Math.round(((humanTouched.length - corrected.length) / humanTouched.length) * 100) : null;

  return (
    <div className="space-y-6">
      <StatGrid>
        <StatTile label="Open cases" value={d.cases.open} sub={`${d.intake.pending_triage} pending triage`} href="/cases" tone="primary" />
        <StatTile
          label="SLA"
          value={`${r.quality.sla_compliance_pct}%`}
          tone={d.sla.breached ? "danger" : d.sla.at_risk ? "warning" : "success"}
          sub={`${d.sla.breached} breached · ${d.sla.at_risk} at risk`}
        />
        <StatTile
          label="Alert → case conversion"
          value={`${r.throughput.alert_to_case_pct}%`}
          sub={`${r.throughput.alerts_accepted} accepted → ${r.throughput.cases_opened} cases`}
        />
        <StatTile
          label="Agent-assisted resolution"
          value={`${r.quality.agent_assisted_pct}%`}
          sub={`${r.quality.agent_assisted_cases}/${r.throughput.cases_opened} cases`}
          href="/reporting"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Queue &amp; backlog</CardTitle>
            <p className="text-sm text-muted-foreground">Read-only oversight of where work is piling up.</p>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Pending triage" value={d.intake.pending_triage} href="/alerts" />
            <Row label="Evidence pending review" value={d.investigation.evidence_pending_review} href="/evidence" />
            <Row label="Tasks overdue" value={d.investigation.tasks_overdue} />
            <Row label="Approvals pending" value={d.response.approvals_pending} href="/approvals" />
            <Row label="Actions executed (dry-run)" value={d.response.actions_executed} href="/actions" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analyst workload</CardTitle>
            <p className="text-sm text-muted-foreground">Open cases per owner — for load balancing.</p>
          </CardHeader>
          <CardContent>{workloadBars.length ? <BarList data={workloadBars} /> : <p className="text-sm text-muted-foreground">No open cases.</p>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Case closure mix</CardTitle>
          </CardHeader>
          <CardContent>{closureBars.length ? <BarList data={closureBars} /> : <p className="text-sm text-muted-foreground">No cases closed in the sample.</p>}</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Detection-engineering throughput</CardTitle>
            <Link href="/detections" className="text-xs text-primary hover:underline">Rules</Link>
          </CardHeader>
          <CardContent>{ruleBars.length ? <BarList data={ruleBars} /> : <p className="text-sm text-muted-foreground">No rules.</p>}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent acceptance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Of the agent runs that reached a human, the share accepted without a correction. A low number means agents
            are being over-ruled — worth tuning a prompt or a threshold.
          </p>
        </CardHeader>
        <CardContent className="text-sm">
          {acceptancePct == null ? (
            <p className="text-muted-foreground">No agent runs have reached a human yet.</p>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums">{acceptancePct}%</span>
              <span className="text-muted-foreground">
                accepted — {humanTouched.length - corrected.length}/{humanTouched.length} runs, {corrected.length} corrected
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center justify-between rounded-md px-1 py-0.5 hover:bg-accent">{body}</Link>
  ) : (
    <div className="flex items-center justify-between px-1 py-0.5">{body}</div>
  );
}
