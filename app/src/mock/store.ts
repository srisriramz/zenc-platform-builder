/**
 * In-memory mock store. Assembled once per server/client module load from the
 * deterministic seed layer. This stands in for a backend — no product reads
 * another product's data except through the contract types in `@/schemas`.
 */
import type { AuditEvent, NormalizedEvent, RawEvent, TelemetrySource } from "@/schemas";
import { DEMO_NOW_ISO, minus } from "@/lib/time";
import {
  TENANTS,
  USERS,
  PARTNERS,
  GLOBAL_KILL_SWITCH,
  type Tenant,
} from "@/data/platform";
import { TELEMETRY_SOURCE_CONFIGS } from "@/data/telemetry-sources";
import { FAMILY_INGESTION_PROFILE, nominalEps } from "@/data/ingestion-profile";
import { generateEvents } from "@/data/events";
import { deriveEntityRisk } from "@/data/entity-risk";
import { CORRELATION_RULES } from "@/data/correlation-rules";
import { runCorrelation } from "@/lib/correlation/engine";
import { ATTACK_TECHNIQUES, ATTACK_TACTICS } from "@/data/frameworks/attack";
import { D3FEND_TECHNIQUES } from "@/data/frameworks/d3fend";

export interface ConnectorRuntime extends TelemetrySource {
  connector_label: string;
  health_note?: string;
  /** quarantined events IN THE MATERIALISED SAMPLE (what the review queue shows) */
  quarantined_in_sample: number;
  /** normalized events for this source in the materialised 72h sample */
  sample_events: number;
  /** steady-state throughput profile for the simulated-live ingestion view */
  nominal_eps: number;
  avg_event_bytes: number;
}

/**
 * The demo distinguishes two things:
 *  - the STREAM: real-rate ingestion, summarised as 24h totals here and shown
 *    live on /ingestion (millions of events, GB/day);
 *  - the SAMPLE: a deterministic ~72h slice materialised into normalized_events
 *    so the Log Explorer, correlation, and the quarantine review queue are
 *    reproducible.
 * 24h counters below are STREAM figures derived from the ingestion profile;
 * `sample_events` / `quarantined_in_sample` are SAMPLE figures.
 */
const HEALTH_24H_FACTOR: Record<string, number> = {
  healthy: 1,
  degraded: 0.55,
  unknown: 0.7,
  stale: 0.33, // feed stopped ~16h ago → ~8h of the window carried data
};

function buildTelemetrySources(normalized: NormalizedEvent[]): ConnectorRuntime[] {
  return TELEMETRY_SOURCE_CONFIGS.map((cfg) => {
    const mine = normalized.filter((e) => e.telemetry_source_id === cfg.telemetry_source_id);
    const sampleLastEvent = mine.reduce<string | undefined>((acc, e) => {
      return !acc || Date.parse(e.occurred_at) > Date.parse(acc) ? e.occurred_at : acc;
    }, undefined);

    const eps = nominalEps(cfg.family, cfg.volume_weight);
    const streamed24h = Math.round(eps * 86_400 * HEALTH_24H_FACTOR[cfg.health]);
    const failures24h = Math.round(streamed24h * 0.001); // ~0.1% fail schema validation on arrival

    const lag =
      cfg.health === "degraded" ? cfg.base_lag_seconds : Math.round(cfg.base_lag_seconds * (0.7 + (cfg.family.length % 5) / 10));
    const lastEventAt =
      cfg.health === "stale" ? sampleLastEvent : minus(DEMO_NOW_ISO, { seconds: lag });

    return {
      telemetry_source_id: cfg.telemetry_source_id,
      tenant_id: cfg.tenant_id,
      family: cfg.family,
      connector_id: cfg.connector_id,
      connector_label: cfg.connector_label,
      health: cfg.health,
      health_note: cfg.health_note,
      last_event_at: lastEventAt,
      ingestion_lag_seconds: lag,
      events_ingested_24h: streamed24h,
      schema_validation_failures_24h: failures24h,
      quarantined_in_sample: mine.filter((e) => e.normalization_status === "quarantined").length,
      sample_events: mine.filter((e) => e.normalization_status === "normalized").length,
      nominal_eps: eps,
      avg_event_bytes: FAMILY_INGESTION_PROFILE[cfg.family].avg_event_bytes,
    };
  });
}

function seedAudit(): AuditEvent[] {
  const mk = (
    i: number,
    tenant_id: string,
    action: AuditEvent["action"],
    target_type: AuditEvent["target_type"],
    target_id: string,
    principal_id: string,
    principal_type: AuditEvent["actor"]["principal_type"],
    detail: string,
    hoursAgo: number,
  ): AuditEvent => ({
    audit_id: `aud-${String(i).padStart(4, "0")}`,
    tenant_id,
    occurred_at: minus(DEMO_NOW_ISO, { hours: hoursAgo }),
    actor: { principal_id, principal_type },
    action,
    target_type,
    target_id,
    detail,
  });
  return [
    mk(1, "tenant-northwind-bank", "entitlement_changed", "entitlement", "tenant-northwind-bank", "user-sam-admin", "human", "Enabled ZenC SOAR (has_soc) for Northwind Bank", 720),
    mk(2, "tenant-northwind-markets", "entitlement_changed", "entitlement", "tenant-northwind-markets", "user-sam-admin", "human", "Confirmed ZenC SOAR off (has_soc:false) — SIEM-only tenant", 512),
    mk(3, "tenant-northwind-bank", "role_changed", "role", "user-marcus-senior", "user-sam-admin", "human", "Granted senior_analyst (detection engineering) to Marcus Bell", 300),
    mk(4, "tenant-northwind-bank", "kill_switch_toggled", "policy", "tenant-northwind-bank", "system", "system", "Tenant kill switch verified disarmed on nightly check", 12),
  ];
}

function assemble() {
  const { raw, normalized } = generateEvents();
  const telemetrySources = buildTelemetrySources(normalized);
  const siemTenantIds = [...new Set(telemetrySources.map((s) => s.tenant_id))];
  const entityRisk = siemTenantIds.flatMap((tid) => deriveEntityRisk(normalized, tid));

  const familyMap = new Map(telemetrySources.map((s) => [s.telemetry_source_id, s.family]));
  const healthMap = new Map(telemetrySources.map((s) => [s.telemetry_source_id, s.health]));
  const firings = runCorrelation(normalized, CORRELATION_RULES, {
    familyOf: (id) => familyMap.get(id),
    healthOf: (id) => healthMap.get(id),
  });
  const alerts = firings.flatMap((f) => f.alerts).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  const ruleFireCounts = Object.fromEntries(firings.map((f) => [f.rule.rule_id, f.alerts.length]));

  return {
    demoNowIso: DEMO_NOW_ISO,
    partners: PARTNERS,
    tenants: TENANTS as Tenant[],
    users: USERS,
    killSwitches: {
      global: { ...GLOBAL_KILL_SWITCH },
    },
    telemetrySources,
    rawEvents: raw as RawEvent[],
    normalizedEvents: normalized,
    entityRisk,
    correlationRules: CORRELATION_RULES,
    alerts,
    ruleFireCounts,
    audit: seedAudit(),
    frameworks: {
      attackTactics: ATTACK_TACTICS,
      attackTechniques: ATTACK_TECHNIQUES,
      d3fendTechniques: D3FEND_TECHNIQUES,
    },
  };
}

// module singleton
let _store: ReturnType<typeof assemble> | null = null;
export function getStore() {
  if (!_store) _store = assemble();
  return _store;
}

export type MockStore = ReturnType<typeof assemble>;
