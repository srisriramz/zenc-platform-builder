import { z } from "zod";
import { healthState, isoDateTime } from "./common";

/** Mirrors schemas/telemetry-source.schema.json */
export const telemetrySourceFamily = z.enum([
  "windows",
  "linux_syslog",
  "firewall",
  "cloud",
  "identity",
  "email",
]);
export type TelemetrySourceFamily = z.infer<typeof telemetrySourceFamily>;

export const telemetrySourceSchema = z.object({
  telemetry_source_id: z.string(),
  tenant_id: z.string(),
  family: telemetrySourceFamily,
  connector_id: z.string(),
  health: healthState,
  last_event_at: isoDateTime.optional(),
  ingestion_lag_seconds: z.number().optional(),
  events_ingested_24h: z.number().int().optional(),
  schema_validation_failures_24h: z.number().int().optional(),
});
export type TelemetrySource = z.infer<typeof telemetrySourceSchema>;
