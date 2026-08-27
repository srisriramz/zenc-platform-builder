import { z } from "zod";
import { entitySchema, isoDateTime, severity } from "./common";

/**
 * Mirrors schemas/alert-envelope.schema.json (schema_version 1.1).
 * Consumed by ZenC SOAR at intake. ZenC SIEM is the reference producer, not a
 * special case — SOAR logic must never branch on `source.system`.
 * Wired end to end in milestone M2 / M4; defined now so producers and the
 * seed layer share one shape.
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
    schema_version: z.literal("1.1"),
    tenant_id: z.string(),
    source: z.object({
      system: z.string(),
      connector_id: z.string(),
      health: z.enum(["healthy", "degraded", "stale", "unknown"]),
    }),
    source_alert_id: z.string(),
    occurred_at: isoDateTime,
    received_at: isoDateTime,
    severity,
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
