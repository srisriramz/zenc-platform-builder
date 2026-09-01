/**
 * SOC reporting KPIs (soc-spec.md "SOC KPIs") — pure aggregation.
 *
 * These are operational throughput metrics, distinct from any Assessment
 * risk/control scoring. Detection / defensive coverage % are NOT recomputed
 * here — they come from the SIEM coverage matrix and are passed in.
 */
import type { AgentRun, AlertEnvelope, Case } from "@/schemas";
import { secondsBetween } from "@/lib/time";

export interface PipelineStage {
  key: string;
  label: string;
  seconds: number | null;
  note?: string;
}

export interface SocReport {
  window_label: string;
  totals: { open_cases: number; closed_cases: number };
  latency: {
    mttd_seconds: number | null;
    mtta_seconds: number | null;
    mttr_seconds: number | null;
    pipeline: PipelineStage[];
  };
  throughput: {
    alerts_accepted: number;
    candidates: number;
    cases_opened: number;
    alert_to_case_pct: number;
    closure_mix: { classification: string; count: number }[];
  };
  quality: {
    agent_assisted_cases: number;
    manual_cases: number;
    agent_assisted_pct: number;
    /**
     * % of reviewed agent runs a human accepted as-is — distinct from
     * `agent_assisted_pct`, which only measures whether an agent touched a
     * case at all, not whether its recommendation held up under review.
     */
    agent_acceptance_pct: number;
    agent_runs_reviewed: number;
    sla_compliance_pct: number;
    sla_breached: number;
  };
  coverage: { detection_pct: number; response_pct: number; techniques_in_scope: number } | null;
  workload: { owner_id: string; open_cases: number }[];
  /** most-cited ATT&CK techniques across the tenant's alert stream */
  top_techniques: { technique_id: string; technique_name: string; count: number }[];
}

export interface SocReportInputs {
  cases: Case[];
  nativeAlerts: AlertEnvelope[];
  /** every alert the SOC side saw (native + third-party) — for the technique tally */
  allSocAlerts: AlertEnvelope[];
  /** first linked alert's received_at per case (across native + third-party) */
  receivedAtByCase: Map<string, string>;
  candidateCount: number;
  intakeAcceptedCount: number;
  /** API-computed per-stage second samples (need store access to resolve events) */
  stageSamples: { collection: number[]; siem_detection: number[]; handoff: number[] };
  /** cases that had at least one non-triage agent run */
  agentAssistedCaseIds: Set<string>;
  /** every tenant-scoped agent run, for the acceptance-rate KPI */
  agentRuns: AgentRun[];
  coverage: { detection_pct: number; response_pct: number; techniques_in_scope: number } | null;
  windowLabel?: string;
}

function mean(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null;
}
function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export function buildSocReport(input: SocReportInputs): SocReport {
  const open = input.cases.filter((c) => c.status !== "closed");
  const closed = input.cases.filter((c) => c.status === "closed");

  // latency
  const mttd = mean(input.nativeAlerts.filter((a) => a.correlated_at).map((a) => secondsBetween(a.occurred_at, a.correlated_at!)));
  const ackSamples: number[] = [];
  const resolveSamples: number[] = [];
  for (const c of input.cases) {
    const firstReceived = input.receivedAtByCase.get(c.case_id);
    if (c.triaged_at && firstReceived) ackSamples.push(secondsBetween(firstReceived, c.triaged_at));
    if (c.status === "closed" && c.triaged_at && c.closed_at) resolveSamples.push(secondsBetween(c.triaged_at, c.closed_at));
  }
  const mtta = mean(ackSamples);
  const mttr = mean(closed.map((c) => secondsBetween(c.created_at, c.closed_at!)));

  const pipeline: PipelineStage[] = [
    { key: "collection", label: "Collection lag", seconds: mean(input.stageSamples.collection), note: "occurred → ingested" },
    { key: "siem_detection", label: "SIEM detection", seconds: mean(input.stageSamples.siem_detection), note: "ingested → correlated" },
    { key: "handoff", label: "Handoff to SOC", seconds: mean(input.stageSamples.handoff), note: "correlated → received" },
    { key: "soc_ack", label: "SOC acknowledge", seconds: mean(ackSamples), note: "received → triaged" },
    { key: "resolve", label: "Resolve", seconds: mean(resolveSamples), note: "triaged → closed" },
  ];

  // throughput
  const closureMix = new Map<string, number>();
  for (const c of closed) if (c.closure) closureMix.set(c.closure.classification, (closureMix.get(c.closure.classification) ?? 0) + 1);

  // quality
  const agentAssisted = input.cases.filter((c) => input.agentAssistedCaseIds.has(c.case_id)).length;
  let slaOk = 0;
  let slaBreached = 0;
  for (const c of input.cases) {
    if (c.status === "closed") {
      // closed on or before its due_at counts as compliant
      const compliant = !c.sla?.due_at || !c.closed_at || Date.parse(c.closed_at) <= Date.parse(c.sla.due_at);
      if (compliant) slaOk++;
      else slaBreached++;
    } else if ((c.sla?.status ?? "on_track") === "breached") {
      slaBreached++;
    } else {
      slaOk++;
    }
  }

  // agent acceptance — of runs a human actually reviewed, how many did they accept as-is?
  const reviewedRuns = input.agentRuns.filter((r) => r.analyst_feedback?.acceptance);
  const acceptedRuns = reviewedRuns.filter((r) => r.analyst_feedback!.acceptance === "accepted");

  // workload
  const workload = new Map<string, number>();
  for (const c of open) workload.set(c.owner_id, (workload.get(c.owner_id) ?? 0) + 1);

  // top techniques across the alert stream
  const techTally = new Map<string, { technique_id: string; technique_name: string; count: number }>();
  for (const a of input.allSocAlerts) {
    for (const t of a.attack_techniques ?? []) {
      const cur = techTally.get(t.technique_id) ?? { technique_id: t.technique_id, technique_name: t.technique_name, count: 0 };
      cur.count++;
      techTally.set(t.technique_id, cur);
    }
  }

  return {
    window_label: input.windowLabel ?? "demo sample",
    totals: { open_cases: open.length, closed_cases: closed.length },
    latency: { mttd_seconds: mttd, mtta_seconds: mtta, mttr_seconds: mttr, pipeline },
    throughput: {
      alerts_accepted: input.intakeAcceptedCount,
      candidates: input.candidateCount,
      cases_opened: input.cases.length,
      alert_to_case_pct: pct(input.cases.length, input.intakeAcceptedCount),
      closure_mix: [...closureMix.entries()].map(([classification, count]) => ({ classification, count })).sort((a, b) => b.count - a.count),
    },
    quality: {
      agent_assisted_cases: agentAssisted,
      manual_cases: input.cases.length - agentAssisted,
      agent_assisted_pct: pct(agentAssisted, input.cases.length),
      agent_acceptance_pct: pct(acceptedRuns.length, reviewedRuns.length),
      agent_runs_reviewed: reviewedRuns.length,
      sla_compliance_pct: pct(slaOk, slaOk + slaBreached),
      sla_breached: slaBreached,
    },
    coverage: input.coverage,
    workload: [...workload.entries()].map(([owner_id, open_cases]) => ({ owner_id, open_cases })).sort((a, b) => b.open_cases - a.open_cases),
    top_techniques: [...techTally.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Reporting Agent — drafts narrative from the KPI aggregate (deterministic).
// It never publishes; external-facing copy needs human sign-off.
// ---------------------------------------------------------------------------

function fmtDur(s: number | null): string {
  if (s == null) return "n/a";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

export function draftReportNarrative(report: SocReport, nameOf: (id: string) => string): string {
  const r = report;
  const lines: string[] = [];
  lines.push(`SOC operational summary — ${r.window_label}.`);
  lines.push(
    `${r.totals.open_cases} open case(s), ${r.totals.closed_cases} closed. ` +
      (r.throughput.closure_mix.length
        ? `Closure mix: ${r.throughput.closure_mix.map((c) => `${c.count} ${c.classification.replace(/_/g, " ")}`).join(", ")}.`
        : "No cases closed in the window."),
  );
  lines.push(
    `MTTD ${fmtDur(r.latency.mttd_seconds)}, MTTA ${fmtDur(r.latency.mtta_seconds)}, MTTR ${fmtDur(r.latency.mttr_seconds)}. ` +
      `Pipeline: ${r.latency.pipeline.map((p) => `${p.label.toLowerCase()} ${fmtDur(p.seconds)}`).join(", ")}.`,
  );
  lines.push(
    `Alert-to-case conversion ${r.throughput.alert_to_case_pct}% ` +
      `(${r.throughput.alerts_accepted} accepted alerts → ${r.throughput.cases_opened} case(s)).`,
  );
  lines.push(
    `Agent-assisted resolution on ${r.quality.agent_assisted_pct}% of cases (${r.quality.agent_assisted_cases}/${r.throughput.cases_opened}). ` +
      (r.quality.agent_runs_reviewed
        ? `Of ${r.quality.agent_runs_reviewed} agent run(s) a human reviewed, ${r.quality.agent_acceptance_pct}% were accepted as-is. `
        : "") +
      `SLA compliance ${r.quality.sla_compliance_pct}%${r.quality.sla_breached ? ` — ${r.quality.sla_breached} breached` : ""}.`,
  );
  if (r.coverage) {
    lines.push(
      `Detection coverage ${r.coverage.detection_pct}%, defensive coverage ${r.coverage.response_pct}% ` +
        `across ${r.coverage.techniques_in_scope} ATT&CK techniques in scope (from the SIEM coverage matrix).`,
    );
  } else {
    lines.push(`Coverage % not available — this tenant has no ZenC SIEM.`);
  }
  if (r.workload.length) {
    lines.push(`Analyst workload: ${r.workload.map((w) => `${nameOf(w.owner_id)} ${w.open_cases}`).join(", ")}.`);
  }
  lines.push(`— DRAFT. Not published. External-facing copy requires human review and sign-off.`);
  return lines.join("\n\n");
}
