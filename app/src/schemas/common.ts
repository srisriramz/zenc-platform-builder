import { z } from "zod";

/**
 * Runtime schemas mirror the JSON Schema (draft-07) contracts in the repo's
 * top-level `schemas/` directory. When a JSON Schema changes, change the
 * matching file here and bump the version — do not let the two drift.
 */

export const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "not an ISO-8601 date-time" });

export const entityType = z.enum([
  "host",
  "user",
  "ip",
  "domain",
  "hash",
  "cloud_resource",
  "email_address",
]);

export const entitySchema = z.object({
  entity_type: entityType,
  value: z.string(),
});
export type Entity = z.infer<typeof entitySchema>;

export const severity = z.enum(["informational", "low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof severity>;

export const healthState = z.enum(["healthy", "degraded", "stale", "unknown"]);
export type HealthState = z.infer<typeof healthState>;
