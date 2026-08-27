import type { HealthState } from "@/schemas";
import type { TelemetrySourceFamily } from "@/schemas";

/**
 * Connector configuration per tenant. Runtime counters (events_ingested_24h,
 * ingestion_lag_seconds, last_event_at, schema_validation_failures_24h) are
 * derived from the generated event stream when the store is assembled, so the
 * Telemetry screen and the Log Explorer never disagree.
 *
 * tenant-summit-cu has has_siem:false and therefore no telemetry sources — it
 * proves SOC can run with SIEM entirely absent.
 */
export interface TelemetrySourceConfig {
  telemetry_source_id: string;
  tenant_id: string;
  family: TelemetrySourceFamily;
  connector_id: string;
  connector_label: string;
  health: HealthState;
  /** relative daily volume weight used by the generator */
  volume_weight: number;
  /** base ingestion lag in seconds for healthy operation */
  base_lag_seconds: number;
  /** notes surfaced in the connector-health detail panel */
  health_note?: string;
}

export const TELEMETRY_SOURCE_CONFIGS: TelemetrySourceConfig[] = [
  // ---- Northwind Bank: full 6-family estate ----
  {
    telemetry_source_id: "ts-nwb-windows-01",
    tenant_id: "tenant-northwind-bank",
    family: "windows",
    connector_id: "conn-nwb-winevt-01",
    connector_label: "Windows Event Forwarding — Domain",
    health: "healthy",
    volume_weight: 34,
    base_lag_seconds: 6,
  },
  {
    telemetry_source_id: "ts-nwb-linux-01",
    tenant_id: "tenant-northwind-bank",
    family: "linux_syslog",
    connector_id: "conn-nwb-syslog-01",
    connector_label: "Linux syslog (RFC 5424) — Core Banking Hosts",
    health: "healthy",
    volume_weight: 18,
    base_lag_seconds: 9,
  },
  {
    telemetry_source_id: "ts-nwb-firewall-01",
    tenant_id: "tenant-northwind-bank",
    family: "firewall",
    connector_id: "conn-nwb-fw-01",
    connector_label: "Perimeter Firewall (CEF)",
    health: "degraded",
    volume_weight: 30,
    base_lag_seconds: 210,
    health_note: "Collector reporting elevated ingestion lag since 2026-08-28T08:00Z; events still arriving.",
  },
  {
    telemetry_source_id: "ts-nwb-cloud-01",
    tenant_id: "tenant-northwind-bank",
    family: "cloud",
    connector_id: "conn-nwb-cloudtrail-01",
    connector_label: "Cloud Control-Plane Audit Log",
    health: "healthy",
    volume_weight: 12,
    base_lag_seconds: 30,
  },
  {
    telemetry_source_id: "ts-nwb-identity-01",
    tenant_id: "tenant-northwind-bank",
    family: "identity",
    connector_id: "conn-nwb-idp-01",
    connector_label: "Identity Provider Sign-in & Audit",
    health: "healthy",
    volume_weight: 14,
    base_lag_seconds: 12,
  },
  {
    telemetry_source_id: "ts-nwb-email-01",
    tenant_id: "tenant-northwind-bank",
    family: "email",
    connector_id: "conn-nwb-email-01",
    connector_label: "Secure Email Gateway",
    health: "stale",
    volume_weight: 8,
    base_lag_seconds: 45,
    health_note: "No events received since 2026-08-27T20:12Z. Connector heartbeat missing — treat email coverage as a gap until restored.",
  },

  // ---- Northwind Markets: partial estate (windows, firewall, cloud, identity) ----
  {
    telemetry_source_id: "ts-nwm-windows-01",
    tenant_id: "tenant-northwind-markets",
    family: "windows",
    connector_id: "conn-nwm-winevt-01",
    connector_label: "Windows Event Forwarding — Trading Floor",
    health: "healthy",
    volume_weight: 26,
    base_lag_seconds: 7,
  },
  {
    telemetry_source_id: "ts-nwm-firewall-01",
    tenant_id: "tenant-northwind-markets",
    family: "firewall",
    connector_id: "conn-nwm-fw-01",
    connector_label: "Edge Firewall (CEF)",
    health: "healthy",
    volume_weight: 22,
    base_lag_seconds: 15,
  },
  {
    telemetry_source_id: "ts-nwm-cloud-01",
    tenant_id: "tenant-northwind-markets",
    family: "cloud",
    connector_id: "conn-nwm-cloud-01",
    connector_label: "Cloud Control-Plane Audit Log",
    health: "healthy",
    volume_weight: 10,
    base_lag_seconds: 28,
  },
  {
    telemetry_source_id: "ts-nwm-identity-01",
    tenant_id: "tenant-northwind-markets",
    family: "identity",
    connector_id: "conn-nwm-idp-01",
    connector_label: "Identity Provider Sign-in & Audit",
    health: "unknown",
    volume_weight: 9,
    base_lag_seconds: 20,
    health_note: "Connector added 2026-08-28T10:00Z; awaiting first health check.",
  },
];
