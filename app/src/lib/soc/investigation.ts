import type { AlertEnvelope, Case, NormalizedEvent } from "@/schemas";
import { hashString } from "@/lib/prng";
import { minus } from "@/lib/time";
import { parseQuery } from "@/lib/query/parser";
import { runQuery, type EvalContext } from "@/lib/query/evaluate";

/**
 * Investigation Agent logic (L1/L2). Runs BOUNDED, source-cited queries
 * against the normalized-event sample and drafts findings. Hard bounds
 * (references/agentic-architecture.md tool allowlist):
 *   - the safe query parser only — never raw SQL / regex / code
 *   - ≤ 24h per query window
 *   - ≤ 5000 events per call (the engine clamps lower)
 *
 * Every finding cites the exact `event_id`s it rests on. A finding that
 * cannot be traced to real events is not emitted (SKILL.md #10).
 */

const WINDOW_HOURS = 24;
const MAX_EVENTS = 5000;

/**
 * Below this, the Investigation Agent hands the case back to a human rather
 * than completing silently (agentic-architecture.md escalation criteria —
 * "its own stated confidence falls below the tenant-configured threshold").
 * A fixed value here; a real deployment reads it from tenant policy.
 */
export const INVESTIGATION_HANDOFF_CONFIDENCE = 0.4;

/** the agent's own confidence in the run — the max over its findings, or 0 with none */
export function investigationConfidence(findings: InvestigationFinding[]): number {
  return findings.length ? Math.max(...findings.map((f) => f.confidence)) : 0;
}

/** true when the run must escalate to a human instead of just completing */
export function investigationNeedsHandoff(findings: InvestigationFinding[]): boolean {
  return investigationConfidence(findings) < INVESTIGATION_HANDOFF_CONFIDENCE;
}
const QUERYABLE_ENTITY_FIELDS: Record<string, string> = {
  host: "entity.host",
  user: "entity.user",
  ip: "entity.ip",
  domain: "entity.domain",
  hash: "entity.hash",
  email_address: "entity.email_address",
};

export interface InvestigationFinding {
  finding_id: string;
  case_id: string;
  query: string;
  window: { fromIso: string; toIso: string };
  matched_count: number;
  cited_event_ids: string[];
  event_type_breakdown: { event_type: string; count: number }[];
  summary: string;
  confidence: number;
}

function quote(v: string): string {
  return `"${v.replace(/"/g, "")}"`;
}

export function investigateAlert(
  theCase: Case,
  alert: AlertEnvelope,
  events: NormalizedEvent[],
  evalCtx: EvalContext,
): InvestigationFinding | null {
  const terms = (alert.entities ?? [])
    .map((e) => {
      const field = QUERYABLE_ENTITY_FIELDS[e.entity_type];
      return field ? `${field}:${quote(e.value)}` : null;
    })
    .filter(Boolean)
    .slice(0, 6) as string[];
  if (terms.length === 0) return null;

  const query = terms.join(" OR ");
  const toIso = alert.occurred_at;
  const fromIso = minus(toIso, { hours: WINDOW_HOURS });

  const parsed = parseQuery(query);
  if (!parsed.ok) return null;
  const run = runQuery(events, parsed.ast, evalCtx, { timeRange: { fromIso, toIso }, limit: MAX_EVENTS });
  if ("error" in run) return null;

  const breakdown = new Map<string, number>();
  for (const e of run.rows) breakdown.set(e.event_type, (breakdown.get(e.event_type) ?? 0) + 1);
  const distinctHosts = new Set(run.rows.flatMap((e) => (e.entities ?? []).filter((x) => x.entity_type === "host").map((x) => x.value)));
  const distinctUsers = new Set(run.rows.flatMap((e) => (e.entities ?? []).filter((x) => x.entity_type === "user").map((x) => x.value)));

  const cited = run.rows.slice(0, 12).map((e) => e.event_id);
  const summary =
    run.totalMatched === 0
      ? `No activity for the alert entities in the 24h before ${toIso}. The alert stands on the source system's evidence alone.`
      : `${run.totalMatched} event(s) touching the alert entities in the 24h window (${distinctHosts.size} host(s), ${distinctUsers.size} user(s)). ` +
        `Top activity: ${[...breakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${t} ×${n}`).join(", ") || "—"}. ` +
        `Cited ${cited.length} representative event(s) for review.`;

  return {
    finding_id: `find-${(hashString(`${theCase.case_id}:${alert.envelope_id}`) >>> 0).toString(36)}`,
    case_id: theCase.case_id,
    query,
    window: { fromIso, toIso },
    matched_count: run.totalMatched,
    cited_event_ids: cited,
    event_type_breakdown: [...breakdown.entries()].map(([event_type, count]) => ({ event_type, count })).sort((a, b) => b.count - a.count),
    summary,
    confidence: run.totalMatched === 0 ? 0.35 : Math.min(0.8, 0.45 + run.totalMatched / 200),
  };
}

export function investigateCase(
  theCase: Case,
  linkedAlerts: AlertEnvelope[],
  events: NormalizedEvent[],
  evalCtx: EvalContext,
): InvestigationFinding[] {
  return linkedAlerts
    .map((a) => investigateAlert(theCase, a, events, evalCtx))
    .filter((f): f is InvestigationFinding => f !== null);
}
