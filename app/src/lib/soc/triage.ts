import type { AlertEnvelope, Severity } from "@/schemas";
import { hashString } from "@/lib/prng";
import type { CaseCandidate, TriageResult } from "./types";

/**
 * Triage Agent recommendation logic. In the demo this is a deterministic
 * heuristic standing in for the model — but its OUTPUT is shaped like a real
 * agent message (claim, confidence, supporting + contradictory evidence) and
 * carries a recommendation the agent may not act on. A human confirms
 * open-vs-suppress at L2 (references/agentic-architecture.md — Triage Agent
 * "never opens or suppresses a case itself").
 *
 * The alert `description` and `title` are untrusted source text: they are
 * summarised, never interpreted as instructions (SKILL.md #8).
 */

const SEV_RANK: Record<Severity, number> = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function triageCandidate(
  candidate: CaseCandidate,
  alerts: AlertEnvelope[],
  eligibleOwnerIds: string[],
): TriageResult {
  const members = alerts.filter((a) => candidate.envelope_ids.includes(a.envelope_id));
  const corroborated = members.length > 1;
  const anyUnhealthy = members.some((a) => a.source.health !== "healthy");
  const hasTechniques = candidate.techniques.length > 0;
  const lowSeverity = SEV_RANK[candidate.max_severity] <= SEV_RANK.low;
  const avgConfidence =
    members.reduce((s, a) => s + (a.confidence ?? 0.5), 0) / Math.max(1, members.length);

  // Suppress only weak, uncorroborated, low-severity signal — otherwise open.
  const recommendSuppress = lowSeverity && !corroborated && (anyUnhealthy || !hasTechniques);
  const recommendation = recommendSuppress ? "suppress" : "open";

  let confidence = 0.5;
  if (corroborated) confidence += 0.2;
  if (hasTechniques) confidence += 0.1;
  if (SEV_RANK[candidate.max_severity] >= SEV_RANK.high) confidence += 0.1;
  if (anyUnhealthy) confidence -= 0.15;
  confidence = Math.max(0.2, Math.min(0.95, Number(confidence.toFixed(2))));

  const recommended_owner_id =
    recommendation === "open" && eligibleOwnerIds.length > 0
      ? eligibleOwnerIds[hashString(candidate.candidate_id) % eligibleOwnerIds.length]
      : null;

  const supporting: string[] = [];
  const contradictory: string[] = [];
  for (const a of members) supporting.push(`alert:${a.envelope_id} (${a.severity}, source ${a.source.system})`);
  if (corroborated) supporting.push(`${members.length} alerts share an entity within the correlation window`);
  if (hasTechniques) supporting.push(`ATT&CK: ${candidate.techniques.map((t) => t.technique_id).join(", ")}`);
  if (anyUnhealthy) contradictory.push("one or more contributing connectors are not healthy — coverage may be partial");
  if (!hasTechniques) contradictory.push("no ATT&CK technique claim on the source alert(s)");
  if (avgConfidence < 0.5) contradictory.push(`source confidence is low (avg ${Math.round(avgConfidence * 100)}%)`);

  const claim =
    recommendation === "open"
      ? `Recommend opening a ${candidate.max_severity} case${corroborated ? ` from ${members.length} correlated alerts` : ""}. ` +
        `Primary entity ${candidate.entities[0] ? `${candidate.entities[0].entity_type} ${candidate.entities[0].value}` : "unknown"}.` +
        (recommended_owner_id ? ` Suggested owner: ${recommended_owner_id}.` : "")
      : `Recommend suppressing: ${candidate.max_severity} severity, single uncorroborated alert` +
        `${anyUnhealthy ? " from a degraded source" : ""}${!hasTechniques ? ", no technique mapping" : ""}. ` +
        `A human should confirm before this is dismissed.`;

  return {
    candidate_id: candidate.candidate_id,
    recommendation,
    recommended_severity: candidate.max_severity,
    recommended_owner_id,
    confidence,
    claim,
    supporting,
    contradictory,
  };
}
