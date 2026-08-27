import { z } from "zod";
import { entitySchema, isoDateTime } from "./common";

/** Mirrors schemas/normalized-event.schema.json */
export const normalizationStatus = z.enum(["normalized", "quarantined"]);

export const normalizedEventSchema = z
  .object({
    event_id: z.string(),
    tenant_id: z.string(),
    telemetry_source_id: z.string(),
    occurred_at: isoDateTime,
    ingested_at: isoDateTime,
    event_type: z.string(),
    entities: z.array(entitySchema).optional(),
    attack_technique_refs: z.array(z.string()).optional(),
    parser_version: z.string().optional(),
    schema_version: z.string().optional(),
    raw_payload_ref: z.string(),
    normalization_status: normalizationStatus,
    quarantine_reason: z.string().optional(),
  })
  .refine(
    (e) => e.normalization_status !== "quarantined" || !!e.quarantine_reason,
    { message: "quarantined events require quarantine_reason", path: ["quarantine_reason"] },
  );
export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;

/**
 * The preserved raw event, kept alongside the normalized form. Not a shared
 * cross-product contract, so it lives only here — but lineage from a
 * normalized event back to this shape is a hard requirement of the SIEM spec.
 */
export const rawEventSchema = z.object({
  raw_payload_ref: z.string(),
  tenant_id: z.string(),
  telemetry_source_id: z.string(),
  received_at: isoDateTime,
  format: z.enum(["evtx_json", "syslog_rfc5424", "cef", "json", "eml_headers"]),
  raw: z.record(z.string(), z.unknown()),
});
export type RawEvent = z.infer<typeof rawEventSchema>;
