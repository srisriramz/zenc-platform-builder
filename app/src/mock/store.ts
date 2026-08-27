/**
 * In-memory mock store. Assembled once per server/client module load from the
 * deterministic seed layer. This stands in for a backend — no product reads
 * another product's data except through the contract types in `@/schemas`.
 */
import type { AuditEvent, NormalizedEvent, RawEvent, TelemetrySource } from "@/schemas";
import { DEMO_NOW_ISO, minus, secondsBetween } from "@/lib/time";
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
import { ATTACK_TECHNIQUES, ATTACK_TACTICS } from "@/data/frameworks/attack";
import { D3FEND_TECHNIQUES } from "@/data/frameworks/d3fend";

export interface ConnectorRuntime extends TelemetrySource {
  connector_label: string;
  health_note?: string;
  quarantined_24h: number;
  events_total: number;
  /** steady-state throughput profile for the simulated-live ingestion view */
  nominal_eps: number;
  avg_event_bytes: number;
}

function buildTelemetrySources(normalized: NormalizedEvent[]): ConnectorRuntime[] {
  const dayAgo = minus(DEMO_NOW_ISO, { hours: 24 });
  return TELEMETRY_SOURCE_CONFIGS.map((cfg) => {
    const mine = normalized.filter((e) => e.telemetry_source_id === cfg.telemetry_source_id);
    const last24 = mine.filter((e) => Date.parse(e.ingested_at) >= Date.parse(dayAgo));
    const lastEvent = mine.reduce<string | undefined>((acc, e) => {
      return !acc || Date.parse(e.occurred_at) > Date.parse(acc) ? e.occurred_at : acc;
    }, undefined);
    const lags = last24.map((e) => secondsBetween(e.occurred_at, e.ingested_at)).filter((n) => n >= 0);
    const avgLag = lags.length ? lags.reduce((s, n) => s + n, 0) / lags.length : cfg.base_lag_seconds;
    return {
      telemetry_source_id: cfg.telemetry_source_id,
      tenant_id: cfg.tenant_id,
      family: cfg.family,
      connector_id: cfg.connector_id,
      connector_label: cfg.connector_label,
      health: cfg.health,
      health_note: cfg.health_note,
      last_event_at: lastEvent,
      ingestion_lag_seconds: Math.round(avgLag * 10) / 10,
      events_ingested_24h: last24.filter((e) => e.normalization_status === "normalized").length,
      schema_validation_failures_24h: last24.filter((e) => e.normalization_status === "quarantined").length,
      quarantined_24h: last24.filter((e) => e.normalization_status === "quarantined").length,
      events_total: mine.length,
      nominal_eps: nominalEps(cfg.family, cfg.volume_weight),
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
