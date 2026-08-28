/**
 * In-memory mock store. Assembled once per server/client module load from the
 * deterministic seed layer. This stands in for a backend — no product reads
 * another product's data except through the contract types in `@/schemas`.
 */
import type { AgentMessage, AgentRun, AuditEvent, NormalizedEvent, RawEvent, TelemetrySource } from "@/schemas";
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
import { THIRD_PARTY_ALERTS } from "@/data/third-party-alerts";
import { buildSocLayer } from "@/data/soc-seed";
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

function seedAgentActivity(): { runs: AgentRun[]; messages: AgentMessage[] } {
  // The Detection Engineer Agent proposed rule-nwb-offhours-role-grant and
  // escalated it to human peer review — it could not enable it.
  const runId = "run-seed-de-0001";
  const t = (daysAgo: number, hoursAgo = 0) => minus(DEMO_NOW_ISO, { days: daysAgo, hours: hoursAgo });
  const messages: AgentMessage[] = [
    {
      message_id: "msg-seed-de-0001",
      agent_run_id: runId,
      agent_name: "detection-engineer-agent",
      tenant_id: "tenant-northwind-bank",
      occurred_at: t(9, 3),
      prompt_version: "detection-engineer-agent-prompt-v2.3",
      tool_version: "rule-read-tool-v1.2",
      input_ref: "coverage-gap:T1078",
      tool_calls: [{ tool_name: "rule-read", called_at: t(9, 3), scope_or_bound: "tenant rule catalog, 8 rules" }],
      claim:
        "Technique T1078 (Valid Accounts) has an enabled rule for the cloud sub-technique but no coverage for off-hours privileged role grants. Proposing a single-event rule.",
      confidence: 0.58,
      evidence: [{ evidence_ref: "coverage-matrix:T1078", supports: true, freshness: t(9, 3) }],
      escalated: false,
    },
    {
      message_id: "msg-seed-de-0002",
      agent_run_id: runId,
      agent_name: "detection-engineer-agent",
      tenant_id: "tenant-northwind-bank",
      occurred_at: t(9, 2),
      prompt_version: "detection-engineer-agent-prompt-v2.3",
      tool_version: "rule-test-tool-v1.0",
      rule_or_playbook_version: "rule-nwb-offhours-role-grant-v0.2.0",
      input_ref: "rule-nwb-offhours-role-grant",
      tool_calls: [
        { tool_name: "rule-draft", called_at: t(9, 2), scope_or_bound: "draft state only" },
        { tool_name: "rule-test", called_at: t(9, 2), scope_or_bound: "synthetic corpus, 48k events" },
      ],
      claim:
        "Draft tested against the synthetic corpus: 5 observed vs 4 expected, 1 missed, 2 unexpected — noise indicator 0.4. The rule fires but is noisier than the tenant threshold; recommend a human tune the time window or add an exclusion before enabling.",
      confidence: 0.44,
      evidence: [
        { evidence_ref: "regression:rule-nwb-offhours-role-grant:v0.2.0", supports: true, freshness: t(9, 2) },
        { evidence_ref: "regression:unexpected-matches", supports: false, freshness: t(9, 2) },
      ],
      escalated: true,
      escalation_reason: "low_confidence",
      policy_outcome: "handed to human peer-review queue — agent cannot advance past peer_review",
    },
  ];
  const runs: AgentRun[] = [
    {
      agent_run_id: runId,
      tenant_id: "tenant-northwind-bank",
      case_id: "rule-nwb-offhours-role-grant",
      subject_type: "detection_rule",
      started_at: t(9, 3),
      completed_at: t(9, 2),
      message_ids: messages.map((m) => m.message_id),
      total_tool_calls: 4,
      elapsed_seconds: 3600,
      human_touchpoints: [],
      outcome: "escalated_pending_human",
      analyst_feedback: null,
    },
  ];
  return { runs, messages };
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

  // SOAR intake & triage — runs over native alerts + the third-party fixtures,
  // through the same intake → grouping → triage path a live system would use.
  const socAlerts = [...alerts, ...THIRD_PARTY_ALERTS];
  const soc = buildSocLayer(socAlerts);
  const seededAgents = seedAgentActivity();

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
    // everything the SOAR side can see: native alert-envelopes + third-party
    thirdPartyAlerts: THIRD_PARTY_ALERTS,
    socAlerts,
    intakeItems: soc.intakeItems,
    caseCandidates: soc.candidates,
    triageResults: soc.triageResults,
    cases: soc.cases,
    candidateCaseId: soc.candidateCaseId,
    agentActivity: {
      runs: [...seededAgents.runs, ...soc.triageRuns],
      messages: [...seededAgents.messages, ...soc.triageMessages],
    },
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
