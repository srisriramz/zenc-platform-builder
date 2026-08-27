import { z } from "zod";
import { entityType, isoDateTime } from "./common";

/**
 * Entity risk — the SEEDED, INDICATIVE UEBA fixture.
 *
 * UEBA as a full module (baselining, peer-group modelling, streaming anomaly
 * scores) is Phase 1.5 and deliberately out of scope
 * (references/native-siem-spec.md: "If a demo needs 'UEBA,' seed a static
 * risk-score fixture rather than building the module.").
 *
 * This score is a transparent weighted tally of signals observed in the
 * deterministic ~72h event sample — not an ML verdict. It informs a human's
 * triage; it never generates an alert or changes an agent's permissions, and
 * every score traces back to the contributing events. `is_indicative` is
 * always true.
 *
 * Not a cross-product contract — it lives only here for the demo.
 */
export const riskBand = z.enum(["low", "elevated", "high", "critical"]);
export type RiskBand = z.infer<typeof riskBand>;

export const riskSignalKind = z.enum(["auth", "access", "process", "network", "admin", "data", "anomaly"]);

export const riskSignalSchema = z.object({
  kind: riskSignalKind,
  label: z.string(),
  weight: z.number(),
  event_count: z.number().int().nonnegative(),
  /** structured query that isolates the contributing events in the Log Explorer */
  evidence_query: z.string().optional(),
});
export type RiskSignal = z.infer<typeof riskSignalSchema>;

export const entityRiskSchema = z.object({
  tenant_id: z.string(),
  entity_type: entityType,
  value: z.string(),
  score: z.number().min(0).max(100),
  band: riskBand,
  trend: z.enum(["rising", "steady", "falling"]),
  signals: z.array(riskSignalSchema),
  first_seen: isoDateTime,
  last_updated: isoDateTime,
  peer_context: z.string().optional(),
  is_indicative: z.literal(true),
});
export type EntityRisk = z.infer<typeof entityRiskSchema>;

export function bandForScore(score: number): RiskBand {
  if (score >= 85) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "elevated";
  return "low";
}
