import type { AgentRun, AlertEnvelope, Case, Evidence, Task } from "@/schemas";
import { AGENT_MAP } from "@/data/agents";

/**
 * The case timeline is a DERIVED view (references/domain-model.md — "derived
 * view over Case's alerts / evidence / tasks / actions"). Nothing here is
 * stored; it is recomposed from the case's linked records every time.
 */

export type TimelineKind =
  | "alert_occurred"
  | "alert_correlated"
  | "case_created"
  | "triaged"
  | "status_changed"
  | "evidence_added"
  | "evidence_reviewed"
  | "task_created"
  | "task_completed"
  | "agent_run"
  | "closed";

export interface TimelineEntry {
  at: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  ref?: { type: "alert" | "evidence" | "task" | "agent_run"; id: string };
}

export function buildCaseTimeline(input: {
  theCase: Case;
  linkedAlerts: AlertEnvelope[];
  evidence: Evidence[];
  tasks: Task[];
  agentRuns: AgentRun[];
  statusChanges: { at: string; detail: string }[];
}): TimelineEntry[] {
  const { theCase, linkedAlerts, evidence, tasks, agentRuns, statusChanges } = input;
  const out: TimelineEntry[] = [];

  for (const a of linkedAlerts) {
    out.push({ at: a.occurred_at, kind: "alert_occurred", title: `Alert: ${a.title}`, detail: `${a.source.system} · ${a.severity}`, ref: { type: "alert", id: a.envelope_id } });
    if (a.correlated_at) {
      out.push({ at: a.correlated_at, kind: "alert_correlated", title: "Alert correlated by ZenC SIEM", ref: { type: "alert", id: a.envelope_id } });
    }
  }

  out.push({ at: theCase.created_at, kind: "case_created", title: "Case opened" });
  if (theCase.triaged_at) out.push({ at: theCase.triaged_at, kind: "triaged", title: "Case triaged" });

  for (const s of statusChanges) out.push({ at: s.at, kind: "status_changed", title: "Status changed", detail: s.detail });

  for (const e of evidence) {
    const who = AGENT_MAP[e.submitted_by]?.label ?? e.submitted_by;
    out.push({
      at: e.submitted_at,
      kind: "evidence_added",
      title: `Evidence added: ${e.title ?? e.evidence_id}`,
      detail: `by ${who}${e.supersedes_evidence_id ? ` (supersedes ${e.supersedes_evidence_id})` : ""}`,
      ref: { type: "evidence", id: e.evidence_id },
    });
    if (e.reviewed_at) {
      out.push({
        at: e.reviewed_at,
        kind: "evidence_reviewed",
        title: `Evidence ${e.review_state}: ${e.title ?? e.evidence_id}`,
        detail: e.reviewer_comment ? `${e.reviewer_id}: “${e.reviewer_comment}”` : `by ${e.reviewer_id}`,
        ref: { type: "evidence", id: e.evidence_id },
      });
    }
  }

  for (const t of tasks) {
    out.push({ at: t.created_at, kind: "task_created", title: `Task: ${t.title}`, detail: t.source === "agent" ? `proposed by ${AGENT_MAP[t.proposed_by_agent ?? ""]?.label ?? t.proposed_by_agent}` : `by ${t.created_by}`, ref: { type: "task", id: t.task_id } });
    if (t.completed_at) out.push({ at: t.completed_at, kind: "task_completed", title: `Task done: ${t.title}`, detail: `by ${t.completed_by}`, ref: { type: "task", id: t.task_id } });
  }

  for (const r of agentRuns) {
    const label = AGENT_MAP[messageAgent(r)]?.label ?? "Agent";
    out.push({
      at: r.started_at,
      kind: "agent_run",
      title: `${label} run`,
      detail: r.outcome.replace(/_/g, " "),
      ref: { type: "agent_run", id: r.agent_run_id },
    });
  }

  if (theCase.closed_at) {
    out.push({
      at: theCase.closed_at,
      kind: "closed",
      title: `Case closed — ${theCase.closure?.classification.replace(/_/g, " ") ?? "unclassified"}`,
      detail: theCase.closure?.reason,
    });
  }

  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || kindRank(a.kind) - kindRank(b.kind));
}

function messageAgent(run: AgentRun): string {
  // agent_run_id convention: run-<agent>-<...>
  const m = run.agent_run_id.match(/^run-([a-z]+)-/);
  const map: Record<string, string> = { triage: "triage-agent", enrich: "enrichment-agent", investigate: "investigation-agent", advisor: "digital-advisor-agent", hunt: "hunt-agent", de: "detection-engineer-agent" };
  return map[m?.[1] ?? ""] ?? "";
}

function kindRank(k: TimelineKind): number {
  const order: TimelineKind[] = ["alert_occurred", "alert_correlated", "case_created", "triaged", "agent_run", "evidence_added", "evidence_reviewed", "task_created", "task_completed", "status_changed", "closed"];
  return order.indexOf(k);
}
