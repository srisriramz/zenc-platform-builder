import { alertEnvelopeSchema, type AlertEnvelope } from "@/schemas";
import { hashString } from "@/lib/prng";
import type { IntakeItem } from "./types";

/**
 * SOAR intake boundary. Every inbound alert — native ZenC SIEM or third-party —
 * arrives as an alert-envelope and passes through here. Rules:
 *
 *  1. Validate against the current contract. Supported schema versions are
 *     "1.1" and "1.2" (current + previous, per inter-product-contracts.md).
 *     A malformed or unsupported envelope is QUARANTINED, never dropped
 *     (build-soc.md, SKILL.md — "schema validation with quarantine").
 *  2. Deduplicate by `dedupe_key`. A repeat is kept as a `duplicate` intake
 *     item pointing at the original — again, not dropped.
 *  3. Tag the source health so triage can weigh it. Intake NEVER branches on
 *     `source.system` for anything else (SKILL.md — SOAR must treat a
 *     third-party alert identically to a native one).
 */

const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.1", "1.2"]);

export interface IntakeOutcome {
  items: IntakeItem[];
  accepted: AlertEnvelope[];
}

function intakeId(envelopeId: string): string {
  return `intk-${(hashString(`intake:${envelopeId}`) >>> 0).toString(36)}`;
}

/** Validate one envelope. Returns null when it is well-formed and supported. */
export function envelopeRejectionReason(raw: unknown): string | null {
  // Version negotiation happens before full validation: an envelope on a
  // version we don't speak is rejected as such, not as "malformed".
  const version = (raw as { schema_version?: unknown } | null)?.schema_version;
  if (typeof version === "string" && !SUPPORTED_SCHEMA_VERSIONS.has(version)) {
    return `unsupported schema_version "${version}" (supported: ${[...SUPPORTED_SCHEMA_VERSIONS].join(", ")})`;
  }
  const parsed = alertEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return `schema invalid: ${first ? `${first.path.join(".") || "root"} — ${first.message}` : "does not match alert-envelope"}`;
  }
  return null;
}

/**
 * Run intake over a batch of raw envelopes for one tenant. Deterministic and
 * order-stable: the first occurrence of a `dedupe_key` wins.
 */
export function runIntake(rawEnvelopes: unknown[], tenantId: string): IntakeOutcome {
  const seenDedupeKeys = new Map<string, string>(); // dedupe_key -> envelope_id
  const items: IntakeItem[] = [];
  const accepted: AlertEnvelope[] = [];

  for (const raw of rawEnvelopes) {
    // We still want an id + source for the queue row even if it is malformed,
    // so pull those defensively without trusting the rest of the shape.
    const loose = (raw ?? {}) as Partial<AlertEnvelope>;
    if (loose.tenant_id !== tenantId) continue;

    const envelopeId = loose.envelope_id ?? `unknown-${items.length}`;
    const sourceSystem = loose.source?.system ?? "unknown";
    const sourceHealth = loose.source?.health ?? "unknown";
    const base = {
      intake_id: intakeId(envelopeId),
      tenant_id: tenantId,
      envelope_id: envelopeId,
      envelope: loose as AlertEnvelope,
      received_at: loose.received_at ?? loose.occurred_at ?? "",
      source_system: sourceSystem,
      source_unhealthy: sourceHealth !== "healthy",
    };

    const rejection = envelopeRejectionReason(raw);
    if (rejection) {
      items.push({ ...base, disposition: "quarantined", disposition_reason: rejection });
      continue;
    }

    const envelope = alertEnvelopeSchema.parse(raw);
    const key = envelope.dedupe_key;
    if (key && seenDedupeKeys.has(key)) {
      items.push({
        ...base,
        disposition: "duplicate",
        disposition_reason: `repeats ${seenDedupeKeys.get(key)} (same dedupe_key)`,
        duplicate_of: seenDedupeKeys.get(key),
      });
      continue;
    }
    if (key) seenDedupeKeys.set(key, envelope.envelope_id);

    items.push({ ...base, envelope, disposition: "accepted" });
    accepted.push(envelope);
  }

  return { items, accepted };
}
