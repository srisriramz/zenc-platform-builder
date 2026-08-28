import type { AlertEnvelope, Entity, Severity } from "@/schemas";

/**
 * SOAR intake & triage types. These are internal to the mock backend — the
 * wire contract between SIEM and SOAR is the alert-envelope, nothing here.
 */

/** What intake decided about one inbound envelope. Nothing is ever dropped. */
export type IntakeDisposition = "accepted" | "quarantined" | "duplicate";

export interface IntakeItem {
  intake_id: string;
  tenant_id: string;
  envelope_id: string;
  /** the envelope as received — kept verbatim even when quarantined */
  envelope: AlertEnvelope;
  received_at: string;
  source_system: string;
  disposition: IntakeDisposition;
  /** why it was quarantined or marked duplicate (human-readable) */
  disposition_reason?: string;
  /** for a duplicate: the envelope_id this one repeats */
  duplicate_of?: string;
  /** intake-derived flag: the producing connector was not healthy */
  source_unhealthy: boolean;
}

/**
 * A proposed grouping of accepted alerts. A candidate is the pending unit a
 * human acts on — confirm-open (creates a Case) or suppress. It is NOT a case.
 */
export interface CaseCandidate {
  candidate_id: string;
  tenant_id: string;
  envelope_ids: string[];
  /** entities shared across / present on the grouped alerts */
  entities: Entity[];
  techniques: { technique_id: string; technique_name: string; tactic: string }[];
  first_occurred_at: string;
  last_occurred_at: string;
  max_severity: Severity;
  /** why these alerts grouped — shown to the analyst */
  grouping_rationale: string;
}

export type TriageRecommendation = "open" | "suppress";

/**
 * The Triage Agent's recommendation for a candidate. Deterministic in the demo
 * (a heuristic stands in for the model) but shaped exactly like a real agent
 * output: a claim, a confidence, supporting + contradictory evidence, and a
 * recommendation the agent CANNOT itself act on — a human confirms at L2.
 */
export interface TriageResult {
  candidate_id: string;
  recommendation: TriageRecommendation;
  recommended_severity: Severity;
  recommended_owner_id: string | null;
  confidence: number;
  claim: string;
  supporting: string[];
  contradictory: string[];
}
