import type { AlertEnvelope, Case, Entity } from "@/schemas";
import { hashString } from "@/lib/prng";
import { assetFor, identityFor, type Asset, type IdentityRecord } from "@/data/assets";

/**
 * Enrichment Agent logic (L1). Attaches READ-ONLY context to a case's
 * entities — asset registry, identity directory, threat-intel reputation,
 * and prior-sightings counts. It never changes case status and never writes
 * to the case store (references/agentic-architecture.md).
 *
 * Deterministic: reputation is a hash of the indicator, so a given IP always
 * gets the same verdict across reloads.
 */

export type TiReputation = "clean" | "unknown" | "suspicious" | "known_bad";

export interface EntityEnrichment {
  entity: Entity;
  asset?: Asset;
  identity?: IdentityRecord;
  ti?: { reputation: TiReputation; source: string; note: string };
  prior_alert_count: number;
  prior_case_count: number;
}

export interface EnrichmentResult {
  case_id: string;
  generated_at: string;
  entities: EntityEnrichment[];
  /** the agent's plain-language callouts a human should not miss */
  notable: string[];
}

const REP_SOURCES = ["community-ti-feed", "internal-blocklist", "partner-ti-exchange"];

function tiReputation(entity: Entity): { reputation: TiReputation; source: string; note: string } | undefined {
  if (entity.entity_type !== "ip" && entity.entity_type !== "domain" && entity.entity_type !== "hash") return undefined;
  const h = hashString(`${entity.entity_type}:${entity.value}`);
  const bucket = h % 100;
  const source = REP_SOURCES[h % REP_SOURCES.length];
  if (bucket < 55) return { reputation: "clean", source, note: "No adverse reports." };
  if (bucket < 78) return { reputation: "unknown", source, note: "Not seen by any configured feed." };
  if (bucket < 93) return { reputation: "suspicious", source, note: "Low-confidence association with scanning infrastructure." };
  return { reputation: "known_bad", source, note: "On an active blocklist within the last 7 days." };
}

function entityKey(e: Entity): string {
  return `${e.entity_type}:${e.value.toLowerCase()}`;
}

export function enrichCase(
  theCase: Case,
  linkedAlerts: AlertEnvelope[],
  allTenantAlerts: AlertEnvelope[],
  allTenantCases: Case[],
  generatedAt: string,
): EnrichmentResult {
  const seen = new Map<string, Entity>();
  for (const a of linkedAlerts) for (const e of a.entities ?? []) seen.set(entityKey(e), e);

  const linkedIds = new Set(theCase.linked_alert_ids);

  const entities: EntityEnrichment[] = [...seen.values()].map((entity) => {
    const key = entityKey(entity);
    const priorAlerts = allTenantAlerts.filter(
      (a) => !linkedIds.has(a.envelope_id) && (a.entities ?? []).some((x) => entityKey(x) === key),
    );
    const priorAlertIds = new Set(priorAlerts.map((a) => a.envelope_id));
    const priorCases = allTenantCases.filter(
      (c) => c.case_id !== theCase.case_id && c.linked_alert_ids.some((id) => priorAlertIds.has(id)),
    );

    return {
      entity,
      asset: entity.entity_type === "host" ? assetFor(theCase.tenant_id, entity.value) : undefined,
      identity:
        entity.entity_type === "user" || entity.entity_type === "email_address"
          ? identityFor(theCase.tenant_id, entity.value)
          : undefined,
      ti: tiReputation(entity),
      prior_alert_count: priorAlerts.length,
      prior_case_count: priorCases.length,
    };
  });

  const notable: string[] = [];
  for (const e of entities) {
    if (e.asset && (e.asset.criticality === "critical" || e.asset.criticality === "high")) {
      notable.push(`${e.entity.value} is a ${e.asset.criticality} ${e.asset.asset_type.replace(/_/g, " ")} owned by ${e.asset.owner_team}.`);
    }
    if (e.identity?.privileged && !e.identity.mfa_enrolled) {
      notable.push(`${e.entity.value} is a privileged ${e.identity.kind.replace(/_/g, " ")} with no MFA enrolled.`);
    }
    if (e.identity?.kind === "break_glass") {
      notable.push(`${e.entity.value} is a break-glass account — interactive use should always correlate to a change record.`);
    }
    if (e.identity?.status === "disabled") {
      notable.push(`${e.entity.value} resolves to a disabled / external identity.`);
    }
    if (e.ti && e.ti.reputation === "known_bad") {
      notable.push(`${e.entity.entity_type} ${e.entity.value} is on an active blocklist (${e.ti.source}).`);
    }
    if (e.prior_case_count > 0) {
      notable.push(`${e.entity.value} appears in ${e.prior_case_count} other case(s) in this tenant.`);
    }
  }
  if (notable.length === 0) notable.push("No high-signal context found for the case entities.");

  return { case_id: theCase.case_id, generated_at: generatedAt, entities, notable };
}
