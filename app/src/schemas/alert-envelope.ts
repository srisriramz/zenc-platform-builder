import { z } from "zod";
import { entitySchema, isoDateTime, severity } from "./common";

/**
 * Mirrors schemas/alert-envelope.schema.json.
 * Consumed by ZenC SOAR at intake. ZenC SIEM is the reference producer, not a
 * special case — SOAR logic must never branch on `source.system`.
 *
 * Versions: 1.1 is the original shape. 1.2 (M2) adds `correlated_at`,
 * `confidence`, and `sector_tags` — all optional and additive, so a 1.1
 * consumer keeps working. Per inter-product-contracts.md, consumers support
 * the current and previous version.
 */
export const attackTechniqueClaimSchema = z.object({
  tactic: z.string(),
  technique_id: z.string(),
  technique_name: z.string(),
  sub_technique_id: z.string().optional(),
  contributing_event_refs: z.array(z.string()).min(1),
  source_rule_id: z.string().optional(),
});
export type AttackTechniqueClaim = z.infer<typeof attackTechniqueClaimSchema>;

export const alertEnvelopeSchema = z
  .object({
    envelope_id: z.string(),
    schema_version: z.enum(["1.1", "1.2"]),
    tenant_id: z.string(),
    source: z.object({
      system: z.string(),
      connector_id: z.string(),
      health: z.enum(["healthy", "degraded", "stale", "unknown"]),
    }),
    source_alert_id: z.string(),
    occurred_at: isoDateTime,
    /** v1.2+ — occurred_at → correlated_at is the SIEM detection pipeline stage */
    correlated_at: isoDateTime.optional(),
    received_at: isoDateTime,
    severity,
    /** v1.2+ — 0..1; deterministic for a native rule */
    confidence: z.number().min(0).max(1).optional(),
    /** v1.2+ — sector/context tags inherited from the producing rule */
    sector_tags: z.array(z.string()).optional(),
    title: z.string(),
    description: z.string().optional(),
    entities: z.array(entitySchema).optional(),
    attack_techniques: z.array(attackTechniqueClaimSchema).optional(),
    dedupe_key: z.string().optional(),
    raw_payload_ref: z.string(),
    validation_status: z.enum(["valid", "quarantined"]).optional(),
    quarantine_reason: z.string().optional(),
  })
  .refine(
    (a) => a.validation_status !== "quarantined" || !!a.quarantine_reason,
    { message: "quarantined envelopes require quarantine_reason", path: ["quarantine_reason"] },
  );
export type AlertEnvelope = z.infer<typeof alertEnvelopeSchema>;
