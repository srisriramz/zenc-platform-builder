/**
 * Simulated API layer. Every call:
 *  - runs a fault-injection check first (so every required UI state is reachable),
 *  - enforces tenant entitlement + RBAC,
 *  - only ever returns data scoped to ctx.tenantId,
 *  - adds deterministic-ish latency.
 *
 * No real network. This is the seam a real backend would replace.
 */
import { getStore } from "./store";
import {
  addAgentRun,
  addProposedRule,
  appendAudit,
  getSession,
  updateAgentRun,
  updateProposedRule,
  upsertRuleOverride,
} from "./session-store";
import { AccessError, assertCan, assertEntitlement, can, permissionsFor, roleInTenant, type SessionContext } from "./rbac";
import { parseQuery, type ParseError } from "@/lib/query/parser";
import { runQuery, type EvalContext, type RunQueryError, type RunQueryResult } from "@/lib/query/evaluate";
import { validateTransition } from "@/lib/detection/lifecycle";
import { runRegression } from "@/lib/detection/regression";
import { runCorrelation, type CorrelationContext } from "@/lib/correlation/engine";
import { CORRELATION_RULES, type SeededRule } from "@/data/correlation-rules";
import { AGENTS } from "@/data/agents";
import { ATTACK_TECHNIQUE_MAP } from "@/data/frameworks/attack";
import { TENANT_MAP } from "@/data/platform";
import { dailyVolumeSeries } from "@/data/ingestion-profile";
import { DEMO_NOW_ISO } from "@/lib/time";
import type {
  AgentMessage,
  AlertEnvelope,
  AnalystFeedback,
  CorrelationRule,
  NormalizedEvent,
  RuleLifecycleState,
} from "@/schemas";
import type { RuleDefinition } from "@/lib/correlation/types";

export type SimMode = "normal" | "slow" | "timeout" | "server_error" | "degraded_source" | "partial";

export class SimulatedFault extends Error {
  constructor(public kind: "timeout" | "server_error", message: string) {
    super(message);
    this.name = "SimulatedFault";
  }
}
export class QueryParseFault extends Error {
  constructor(public detail: ParseError) {
    super(detail.message);
    this.name = "QueryParseFault";
  }
}

let currentSim: SimMode = "normal";
export function setSimMode(mode: SimMode) {
  currentSim = mode;
}
export function getSimMode(): SimMode {
  return currentSim;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gate(op: string, cost = 180) {
  switch (currentSim) {
    case "timeout":
      await delay(1200);
      throw new SimulatedFault("timeout", `The request for "${op}" timed out (simulated).`);
    case "server_error":
      await delay(300);
      throw new SimulatedFault("server_error", `The mock service returned an error for "${op}" (simulated).`);
    case "slow":
      await delay(cost + 2200);
      return;
    default:
      await delay(cost);
  }
}

// ---------------------------------------------------------------------------
// Shared / platform
// ---------------------------------------------------------------------------

export async function fetchBootstrap(userId: string) {
  await gate("bootstrap", 90);
  const store = getStore();
  const user = store.users.find((u) => u.user_id === userId);
  if (!user) throw new AccessError("not_authenticated", "Unknown demo user.");
  return {
    demoNowIso: store.demoNowIso,
    user,
    tenants: store.tenants
      .filter((t) => user.roles.some((r) => r.tenant_id === t.tenant_id))
      .map((t) => ({
        tenant_id: t.tenant_id,
        name: t.name,
        sector: t.sector,
        entitlements: t.entitlements,
        role: user.roles.find((r) => r.tenant_id === t.tenant_id)!.role,
        kill_switch: t.policy.kill_switch,
      })),
    globalKillSwitch: store.killSwitches.global,
    allUsers: store.users.map((u) => ({ user_id: u.user_id, display_name: u.display_name })),
  };
}

export type BootstrapData = Awaited<ReturnType<typeof fetchBootstrap>>;
export type TenantView = BootstrapData["tenants"][number];
export type SessionCapabilities = Awaited<ReturnType<typeof fetchSessionCapabilities>>;

export async function fetchSessionCapabilities(ctx: SessionContext) {
  await gate("capabilities", 60);
  return {
    role: roleInTenant(ctx),
    permissions: permissionsFor(ctx),
    tenant: TENANT_MAP[ctx.tenantId]
      ? {
          name: TENANT_MAP[ctx.tenantId].name,
          entitlements: TENANT_MAP[ctx.tenantId].entitlements,
          policy: TENANT_MAP[ctx.tenantId].policy,
        }
      : null,
  };
}

export async function fetchAudit(ctx: SessionContext) {
  await gate("audit");
  assertCan(ctx, "audit.view");
  return [...getSession().audit, ...getStore().audit]
    .filter((a) => a.tenant_id === ctx.tenantId)
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
}

export async function fetchAdminTenants(ctx: SessionContext) {
  await gate("admin-tenants");
  assertCan(ctx, "admin.identity");
  return getStore().tenants;
}

export async function fetchAdminUsers(ctx: SessionContext) {
  await gate("admin-users");
  assertCan(ctx, "admin.identity");
  return getStore().users;
}

export async function fetchPolicies(ctx: SessionContext) {
  await gate("policies");
  if (!can(ctx, "admin.policy") && !can(ctx, "audit.view")) {
    assertCan(ctx, "admin.policy");
  }
  const store = getStore();
  return {
    globalKillSwitch: store.killSwitches.global,
    partners: store.partners,
    tenants: store.tenants.map((t) => ({ tenant_id: t.tenant_id, name: t.name, policy: t.policy })),
  };
}

export async function fetchFrameworks() {
  await gate("frameworks", 70);
  return getStore().frameworks;
}

// ---------------------------------------------------------------------------
// SIEM — telemetry
// ---------------------------------------------------------------------------

export async function fetchTelemetrySources(ctx: SessionContext) {
  await gate("telemetry-sources");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const rows = getStore().telemetrySources.filter((s) => s.tenant_id === ctx.tenantId);
  if (currentSim === "degraded_source") {
    return rows.map((r, i) => (i === 0 ? { ...r, health: "degraded" as const, health_note: "Injected degraded state (simulation)." } : r));
  }
  return rows;
}

export interface QuarantineItem {
  event: NormalizedEvent;
  source_family: string;
}

export async function fetchQuarantineQueue(ctx: SessionContext): Promise<QuarantineItem[]> {
  await gate("quarantine");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const store = getStore();
  const familyOf = makeFamilyResolver(ctx.tenantId);
  return store.normalizedEvents
    .filter((e) => e.tenant_id === ctx.tenantId && e.normalization_status === "quarantined")
    .map((event) => ({ event, source_family: familyOf(event.telemetry_source_id) ?? "unknown" }));
}

// ---------------------------------------------------------------------------
// SIEM — Entity risk (seeded, indicative UEBA fixture)
// ---------------------------------------------------------------------------

export async function fetchEntityRisk(ctx: SessionContext) {
  await gate("entity-risk", 140);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  return getStore().entityRisk.filter((r) => r.tenant_id === ctx.tenantId);
}

export async function fetchEntityRiskDetail(ctx: SessionContext, entityType: string, value: string) {
  await gate("entity-risk-detail");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const risk = getStore().entityRisk.find(
    (r) => r.tenant_id === ctx.tenantId && r.entity_type === entityType && r.value === value,
  );
  if (!risk) throw new AccessError("permission_denied", "No risk record for that entity in this tenant.");
  return risk;
}

// ---------------------------------------------------------------------------
// SIEM — Correlation & alerts
// ---------------------------------------------------------------------------

export type RuleView = CorrelationRule & {
  definition: Record<string, unknown>;
  alert_title: string;
  fired_count: number;
  /** the transitions the current viewer is allowed to make right now */
  allowed_transitions: RuleLifecycleState[];
  is_agent_proposed: boolean;
};

const HUMAN_TRANSITIONS: Partial<Record<RuleLifecycleState, RuleLifecycleState[]>> = {
  draft: ["test"],
  test: ["draft", "peer_review"],
  peer_review: ["draft", "approved"],
  approved: ["draft", "enabled"],
  enabled: ["disabled"],
  disabled: ["enabled", "retired"],
};

/** the full merged rule set for a tenant (seed ∪ session overrides ∪ proposed) */
function mergedRules(tenantId: string): SeededRule[] {
  const session = getSession();
  const merged = CORRELATION_RULES.filter((r) => r.tenant_id === tenantId).map((r) => {
    const o = session.ruleOverrides.get(r.rule_id);
    if (!o) return r;
    return {
      ...r,
      lifecycle_state: o.lifecycle_state ?? r.lifecycle_state,
      enabled_by: o.enabled_by ?? r.enabled_by,
      version: o.version ?? r.version,
      history: o.history ?? r.history,
      regression_test_results: o.regression_test_results ?? r.regression_test_results,
    };
  });
  return [...merged, ...session.proposedRules.filter((r) => r.tenant_id === tenantId)];
}

function getMergedRule(tenantId: string, ruleId: string): SeededRule | undefined {
  return mergedRules(tenantId).find((r) => r.rule_id === ruleId);
}

function toRuleView(rule: SeededRule, ctx: SessionContext): RuleView {
  const { alert_summary: _summary, alert_title, definition, expected_test_matches: _e, ...rest } = rule;
  void _summary;
  void _e;
  const perms = permissionsFor(ctx);
  const allowed = (HUMAN_TRANSITIONS[rule.lifecycle_state] ?? []).filter(
    (to) => validateTransition(rule, to, { principal_id: ctx.userId, principal_type: "human", permissions: perms }).ok,
  );
  return {
    ...rest,
    alert_title,
    definition: definition as unknown as Record<string, unknown>,
    fired_count: getStore().ruleFireCounts[rule.rule_id] ?? (rule.lifecycle_state === "enabled" ? recomputeFireCount(rule) : 0),
    allowed_transitions: allowed,
    is_agent_proposed: rule.proposed_by === "detection-engineer-agent",
  };
}

function correlationCtxFor(): CorrelationContext {
  const store = getStore();
  const familyMap = new Map(store.telemetrySources.map((s) => [s.telemetry_source_id, s.family]));
  const healthMap = new Map(store.telemetrySources.map((s) => [s.telemetry_source_id, s.health]));
  return { familyOf: (id) => familyMap.get(id), healthOf: (id) => healthMap.get(id) };
}

function recomputeFireCount(rule: SeededRule): number {
  const [firing] = runCorrelation(getStore().normalizedEvents, [rule], correlationCtxFor());
  return firing?.alerts.length ?? 0;
}

export async function fetchCorrelationRules(ctx: SessionContext): Promise<RuleView[]> {
  await gate("correlation-rules");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "rule.view");
  return mergedRules(ctx.tenantId).map((r) => toRuleView(r, ctx));
}

export async function fetchRuleDetail(ctx: SessionContext, ruleId: string) {
  await gate("rule-detail");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "rule.view");
  const rule = getMergedRule(ctx.tenantId, ruleId);
  if (!rule) throw new AccessError("permission_denied", "No such rule in this tenant.");
  const store = getStore();
  const runsForRule = getSession()
    .agentRuns.concat(store.agentActivity.runs)
    .filter((run) => run.tenant_id === ctx.tenantId && run.subject_type === "detection_rule" && run.case_id === ruleId);
  return {
    rule: toRuleView(rule, ctx),
    alerts: store.alerts.filter((a) => a.tenant_id === ctx.tenantId && (a.attack_techniques ?? []).some((t) => t.source_rule_id === ruleId)),
    agent_runs: runsForRule,
  };
}

export interface AlertFilter {
  severity?: string;
  ruleId?: string;
  techniqueId?: string;
}

export async function fetchAlerts(ctx: SessionContext, filter: AlertFilter = {}): Promise<AlertEnvelope[]> {
  await gate("alerts", 220);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  let alerts = getStore().alerts.filter((a) => a.tenant_id === ctx.tenantId);
  if (filter.severity) alerts = alerts.filter((a) => a.severity === filter.severity);
  if (filter.ruleId) alerts = alerts.filter((a) => (a.attack_techniques ?? []).some((t) => t.source_rule_id === filter.ruleId));
  if (filter.techniqueId) alerts = alerts.filter((a) => (a.attack_techniques ?? []).some((t) => t.technique_id === filter.techniqueId));
  return alerts;
}

export async function fetchAlertDetail(ctx: SessionContext, envelopeId: string) {
  await gate("alert-detail");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const store = getStore();
  const alert = store.alerts.find((a) => a.envelope_id === envelopeId && a.tenant_id === ctx.tenantId);
  if (!alert) throw new AccessError("permission_denied", "No such alert in this tenant.");

  // resolve the contributing normalized events for the technique breakdown
  const allRefs = new Set<string>();
  for (const t of alert.attack_techniques ?? []) for (const r of t.contributing_event_refs) allRefs.add(r);
  const eventsById = new Map(
    store.normalizedEvents.filter((e) => allRefs.has(e.event_id)).map((e) => [e.event_id, e] as const),
  );
  const ruleId = (alert.attack_techniques ?? []).map((t) => t.source_rule_id).find(Boolean);
  const rule = ruleId ? getMergedRule(ctx.tenantId, ruleId) : undefined;

  return {
    alert,
    rule: rule ? toRuleView(rule, ctx) : null,
    contributingEvents: [...eventsById.values()],
  };
}

// ---------------------------------------------------------------------------
// M3 — Detection engineering workflow (agent + rule lifecycle)
// ---------------------------------------------------------------------------

export async function fetchAgents(ctx: SessionContext) {
  await gate("agents", 60);
  if (!can(ctx, "soc.view") && !can(ctx, "rule.view")) assertCan(ctx, "soc.view");
  return AGENTS;
}

export async function fetchAgentRuns(ctx: SessionContext) {
  await gate("agent-runs");
  if (!can(ctx, "soc.view") && !can(ctx, "rule.view")) assertCan(ctx, "soc.view");
  const store = getStore();
  const runs = [...getSession().agentRuns, ...store.agentActivity.runs].filter((r) => r.tenant_id === ctx.tenantId);
  return runs.map((r) => ({
    ...r,
    subject_label:
      r.subject_type === "detection_rule"
        ? getMergedRule(ctx.tenantId, r.case_id)?.name ?? r.case_id
        : r.case_id,
  }));
}

export async function fetchAgentRun(ctx: SessionContext, runId: string) {
  await gate("agent-run");
  if (!can(ctx, "soc.view") && !can(ctx, "rule.view")) assertCan(ctx, "soc.view");
  const store = getStore();
  const run = [...getSession().agentRuns, ...store.agentActivity.runs].find(
    (r) => r.agent_run_id === runId && r.tenant_id === ctx.tenantId,
  );
  if (!run) throw new AccessError("permission_denied", "No such agent run in this tenant.");
  const messages = [...getSession().agentMessages, ...store.agentActivity.messages]
    .filter((m) => m.agent_run_id === runId)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  return { run, messages, rule: run.subject_type === "detection_rule" ? getMergedRule(ctx.tenantId, run.case_id) ?? null : null };
}

export interface ProposeRuleInput {
  name: string;
  rule_type: CorrelationRule["rule_type"];
  severity: CorrelationRule["severity"];
  definition: RuleDefinition;
  attack_mapping: CorrelationRule["attack_mapping"];
  d3fend_mapping?: CorrelationRule["d3fend_mapping"];
  d3fend_unmapped?: boolean;
  confidence?: number;
  alert_title: string;
}

export async function proposeRule(ctx: SessionContext, input: ProposeRuleInput): Promise<{ rule_id: string }> {
  await gate("propose-rule", 120);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "rule.propose");
  const rule_id = `rule-${ctx.tenantId.replace("tenant-", "")}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${Date.now().toString(36).slice(-4)}`;
  const now = DEMO_NOW_ISO;
  addProposedRule({
    rule_id,
    tenant_id: ctx.tenantId,
    name: input.name,
    version: "0.1.0",
    lifecycle_state: "draft",
    proposed_by: ctx.userId,
    rule_type: input.rule_type,
    severity: input.severity,
    confidence: input.confidence,
    sector_tags: TENANT_MAP[ctx.tenantId] ? [TENANT_MAP[ctx.tenantId].sector] : undefined,
    attack_mapping: input.attack_mapping,
    d3fend_mapping: input.d3fend_mapping,
    d3fend_unmapped: input.d3fend_unmapped,
    regression_test_results: [],
    history: [{ from_state: "—", to_state: "draft", changed_by: ctx.userId, changed_at: now }],
    definition: input.definition,
    alert_title: input.alert_title,
    alert_summary: (n, key) => `${input.name}${key ? ` — ${key}` : ""} (${n} contributing event${n === 1 ? "" : "s"})`,
  });
  return { rule_id };
}

export async function runRuleRegression(ctx: SessionContext, ruleId: string) {
  await gate("run-regression", 600); // regression is "slow" on purpose
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "rule.propose");
  const rule = getMergedRule(ctx.tenantId, ruleId);
  if (!rule) throw new AccessError("permission_denied", "No such rule.");

  const result = runRegression(rule, getStore().normalizedEvents, correlationCtxFor(), DEMO_NOW_ISO);
  const nextResults = [...(rule.regression_test_results ?? []), result];

  // draft → test on the first successful run
  const advance = rule.lifecycle_state === "draft";
  applyTransition(ctx, rule, advance ? "test" : rule.lifecycle_state, "reviewed", nextResults, "regression run");
  return result;
}

export async function transitionRule(
  ctx: SessionContext,
  ruleId: string,
  to: RuleLifecycleState,
  note?: string,
) {
  await gate("transition-rule", 140);
  assertEntitlement(ctx, "has_siem");
  const rule = getMergedRule(ctx.tenantId, ruleId);
  if (!rule) throw new AccessError("permission_denied", "No such rule.");

  const verdict = validateTransition(rule, to, {
    principal_id: ctx.userId,
    principal_type: "human",
    permissions: permissionsFor(ctx),
  });
  if (!verdict.ok) throw new AccessError("permission_denied", verdict.message);

  applyTransition(ctx, rule, to, "reviewed", rule.regression_test_results ?? [], note);
  return { lifecycle_state: to };
}

function applyTransition(
  ctx: SessionContext,
  rule: SeededRule,
  to: RuleLifecycleState,
  _action: "approved" | "reviewed",
  regression: NonNullable<SeededRule["regression_test_results"]>,
  note?: string,
) {
  void _action;
  void note;
  const now = DEMO_NOW_ISO;
  const from = rule.lifecycle_state;
  const history = [
    ...(rule.history ?? []),
    ...(to !== from ? [{ from_state: from, to_state: to, changed_by: ctx.userId, changed_at: now }] : []),
  ];
  const patch = {
    lifecycle_state: to,
    history,
    regression_test_results: regression,
    ...(to === "enabled" ? { enabled_by: ctx.userId } : {}),
  };

  const isProposed = getSession().proposedRules.some((r) => r.rule_id === rule.rule_id);
  if (isProposed) updateProposedRule(rule.rule_id, patch as Partial<SeededRule>);
  else upsertRuleOverride(rule.rule_id, patch);

  if (to !== from) {
    appendAudit({
      tenant_id: ctx.tenantId,
      occurred_at: now,
      actor: { principal_id: ctx.userId, principal_type: "human" },
      action: "rule_state_changed",
      target_type: "correlation_rule",
      target_id: rule.rule_id,
      detail: `${rule.name}: ${from} → ${to}${note ? ` (${note})` : ""}`,
    });
  }
}

export async function askAgentToProposeRule(ctx: SessionContext, techniqueId: string) {
  await gate("agent-propose", 900);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "rule.propose");
  const tech = ATTACK_TECHNIQUE_MAP[techniqueId];
  if (!tech) throw new AccessError("permission_denied", "Unknown technique.");

  const now = DEMO_NOW_ISO;
  const rule_id = `rule-${ctx.tenantId.replace("tenant-", "")}-agent-${techniqueId.toLowerCase().replace(".", "-")}`;
  const runId = `run-de-${Date.now().toString(36)}`;
  const tactic = tech.tactic_shortnames[0] ?? "execution";

  // a single_event draft targeting an event type tagged to the technique
  const draft: SeededRule = {
    rule_id,
    tenant_id: ctx.tenantId,
    name: `${tech.name} — activity observed`,
    version: "0.1.0",
    lifecycle_state: "peer_review",
    proposed_by: "detection-engineer-agent",
    rule_type: "single_event",
    severity: "medium",
    confidence: 0.5,
    sector_tags: TENANT_MAP[ctx.tenantId] ? [TENANT_MAP[ctx.tenantId].sector] : undefined,
    attack_mapping: [{ tactic: titleCase(tactic), technique_id: techniqueId, technique_name: tech.name }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-UAN", d3fend_technique_name: "User Behavior Analysis", category: "Detect" }],
    regression_test_results: [],
    history: [
      { from_state: "—", to_state: "draft", changed_by: "detection-engineer-agent", changed_at: now },
      { from_state: "draft", to_state: "test", changed_by: "detection-engineer-agent", changed_at: now },
      { from_state: "test", to_state: "peer_review", changed_by: "detection-engineer-agent", changed_at: now },
    ],
    definition: { kind: "single_event", match: { attack_technique_any: [techniqueId] } },
    alert_title: `${tech.name} activity`,
    alert_summary: (n, key) => `${tech.name} activity observed${key ? ` for ${key}` : ""} (${n} event${n === 1 ? "" : "s"}).`,
    expected_test_matches: undefined,
  };
  addProposedRule(draft);
  const reg = runRegression(draft, getStore().normalizedEvents, correlationCtxFor(), now);
  updateProposedRule(rule_id, { regression_test_results: [reg] });

  const messages: AgentMessage[] = [
    {
      message_id: `${runId}-m1`,
      agent_run_id: runId,
      agent_name: "detection-engineer-agent",
      tenant_id: ctx.tenantId,
      occurred_at: now,
      prompt_version: "detection-engineer-agent-prompt-v2.3",
      tool_version: "rule-read-tool-v1.2",
      input_ref: `coverage-gap:${techniqueId}`,
      tool_calls: [{ tool_name: "rule-read", called_at: now, scope_or_bound: "tenant rule catalog" }],
      claim: `No enabled rule maps to ${techniqueId} (${tech.name}). Drafting a single-event rule on events natively tagged to it.`,
      confidence: 0.55,
      evidence: [{ evidence_ref: `coverage-matrix:${techniqueId}`, supports: true, freshness: now }],
      escalated: false,
    },
    {
      message_id: `${runId}-m2`,
      agent_run_id: runId,
      agent_name: "detection-engineer-agent",
      tenant_id: ctx.tenantId,
      occurred_at: now,
      prompt_version: "detection-engineer-agent-prompt-v2.3",
      tool_version: "rule-test-tool-v1.0",
      rule_or_playbook_version: `${rule_id}-v0.1.0`,
      input_ref: rule_id,
      tool_calls: [
        { tool_name: "rule-draft", called_at: now, scope_or_bound: "draft state only" },
        { tool_name: "rule-test", called_at: now, scope_or_bound: "synthetic corpus" },
      ],
      claim: `Draft tested: ${reg.observed_matches} observed matches, noise ${reg.noise_indicator}, health "${reg.rule_health}". Submitting for human peer review — I cannot enable it.`,
      confidence: 0.5,
      evidence: [{ evidence_ref: `regression:${rule_id}:v0.1.0`, supports: reg.rule_health === "healthy", freshness: now }],
      escalated: true,
      escalation_reason: "policy_ambiguous_or_absent",
      policy_outcome: "routed to peer_review — enabling a rule is a human-only action",
    },
  ];
  addAgentRun(
    {
      agent_run_id: runId,
      tenant_id: ctx.tenantId,
      case_id: rule_id,
      subject_type: "detection_rule",
      started_at: now,
      completed_at: now,
      message_ids: messages.map((m) => m.message_id),
      total_tool_calls: 3,
      elapsed_seconds: 42,
      human_touchpoints: [],
      outcome: "escalated_pending_human",
      analyst_feedback: null,
    },
    messages,
  );
  return { rule_id, run_id: runId };
}

export async function recordAnalystFeedback(ctx: SessionContext, runId: string, feedback: AnalystFeedback) {
  await gate("analyst-feedback");
  const session = getSession();
  const run =
    session.agentRuns.find((r) => r.agent_run_id === runId) ??
    getStore().agentActivity.runs.find((r) => r.agent_run_id === runId);
  if (!run || run.tenant_id !== ctx.tenantId) throw new AccessError("permission_denied", "No such run.");
  updateAgentRun(runId, {
    analyst_feedback: feedback,
    human_touchpoints: [
      ...run.human_touchpoints,
      { principal_id: ctx.userId, action: "corrected", at: DEMO_NOW_ISO, note: feedback.human_determination },
    ],
  });
  return { ok: true };
}

function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Analytics (cross-product reporting layer — a consumer, not a god-view)
// ---------------------------------------------------------------------------

const HEALTH_FACTOR: Record<string, number> = { healthy: 1, degraded: 0.55, unknown: 0.7, stale: 0.33 };

export async function fetchDetectionAnalytics(ctx: SessionContext) {
  await gate("detection-analytics", 200);
  assertCan(ctx, "reporting.view");
  assertEntitlement(ctx, "has_siem");
  const store = getStore();
  const sources = store.telemetrySources.filter((s) => s.tenant_id === ctx.tenantId);
  const sampleEvents = store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId);

  const volumeTrend = dailyVolumeSeries(
    sources.map((s) => ({ family: s.family, nominalEps: s.nominal_eps, healthFactor: HEALTH_FACTOR[s.health] ?? 1 })),
    store.demoNowIso,
    14,
  );

  const sourceReliability = sources.map((s) => ({
    id: s.telemetry_source_id,
    label: s.connector_label,
    family: s.family,
    health: s.health,
    lag_seconds: s.ingestion_lag_seconds ?? 0,
    events_24h: s.events_ingested_24h ?? 0,
    failed_ratio: (s.events_ingested_24h ?? 0) > 0 ? (s.schema_validation_failures_24h ?? 0) / (s.events_ingested_24h ?? 1) : 0,
  }));

  const ALL_FAMILIES = ["windows", "linux_syslog", "firewall", "cloud", "identity", "email"] as const;
  const familyCoverage = ALL_FAMILIES.map((family) => {
    const matching = sources.filter((s) => s.family === family);
    const healthy = matching.filter((s) => s.health === "healthy");
    return {
      family,
      connected: matching.length > 0,
      healthy: healthy.length > 0,
      degraded: matching.length > 0 && healthy.length === 0,
    };
  });

  const quarantineByReason = new Map<string, number>();
  for (const e of sampleEvents) {
    if (e.normalization_status !== "quarantined" || !e.quarantine_reason) continue;
    const key = e.quarantine_reason.split(":")[0];
    quarantineByReason.set(key, (quarantineByReason.get(key) ?? 0) + 1);
  }

  const eventTypeMix = new Map<string, number>();
  for (const e of sampleEvents) if (e.normalization_status === "normalized") eventTypeMix.set(e.event_type, (eventTypeMix.get(e.event_type) ?? 0) + 1);

  const riskBands = { critical: 0, high: 0, elevated: 0, low: 0 };
  for (const r of store.entityRisk.filter((r) => r.tenant_id === ctx.tenantId)) riskBands[r.band]++;

  // detection activity (M2 — real alerts)
  const tenantAlerts = store.alerts.filter((a) => a.tenant_id === ctx.tenantId);
  const alertsBySeverity = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  for (const a of tenantAlerts) alertsBySeverity[a.severity]++;
  const alertsByRule = new Map<string, { name: string; count: number }>();
  for (const a of tenantAlerts) {
    const ruleId = a.attack_techniques?.[0]?.source_rule_id;
    if (!ruleId) continue;
    const name = store.correlationRules.find((r) => r.rule_id === ruleId)?.name ?? ruleId;
    const cur = alertsByRule.get(ruleId) ?? { name, count: 0 };
    cur.count++;
    alertsByRule.set(ruleId, cur);
  }
  const tenantRules = store.correlationRules.filter((r) => r.tenant_id === ctx.tenantId);
  const detectionLatencies = tenantAlerts
    .filter((a) => a.correlated_at)
    .map((a) => (Date.parse(a.correlated_at!) - Date.parse(a.occurred_at)) / 1000);
  const mttdSeconds = detectionLatencies.length
    ? Math.round(detectionLatencies.reduce((s, n) => s + n, 0) / detectionLatencies.length)
    : null;

  return {
    demoNowIso: store.demoNowIso,
    volumeTrend,
    sourceReliability,
    familyCoverage,
    quarantineByReason: [...quarantineByReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    eventTypeMix: [...eventTypeMix.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    riskBands,
    sampleSize: sampleEvents.filter((e) => e.normalization_status === "normalized").length,
    detection: {
      totalAlerts: tenantAlerts.length,
      alertsBySeverity,
      alertsByRule: [...alertsByRule.entries()].map(([ruleId, v]) => ({ ruleId, ...v })).sort((a, b) => b.count - a.count),
      enabledRules: tenantRules.filter((r) => r.lifecycle_state === "enabled").length,
      totalRules: tenantRules.length,
      rulesWithD3fend: tenantRules.filter((r) => r.lifecycle_state === "enabled" && r.d3fend_mapping?.length).length,
      mttdSeconds,
    },
  };
}

export type DetectionAnalytics = Awaited<ReturnType<typeof fetchDetectionAnalytics>>;

// ---------------------------------------------------------------------------
// SIEM — Log Explorer
// ---------------------------------------------------------------------------

function makeFamilyResolver(tenantId: string) {
  const map = new Map(
    getStore().telemetrySources.filter((s) => s.tenant_id === tenantId).map((s) => [s.telemetry_source_id, s.family]),
  );
  return (id: string) => map.get(id);
}

export interface LogSearchInput {
  query: string;
  fromIso: string;
  toIso: string;
  limit?: number;
  includeQuarantined?: boolean;
}

export interface LogSearchResponse {
  result: RunQueryResult;
  histogram: { bucketStartIso: string; count: number }[];
  fieldStats: { field: string; values: { value: string; count: number }[]; distinct: number }[];
  partial?: boolean;
}

export async function searchLogs(ctx: SessionContext, input: LogSearchInput): Promise<LogSearchResponse> {
  await gate("log-search", 260);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.query");

  const parsed = parseQuery(input.query);
  if (!parsed.ok) throw new QueryParseFault(parsed);

  const store = getStore();
  const familyOf = makeFamilyResolver(ctx.tenantId);
  const evalCtx: EvalContext = { familyOf };

  // Tenant scoping is applied here regardless of anything in the query text.
  let pool = store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId);
  if (!input.includeQuarantined) pool = pool.filter((e) => e.normalization_status === "normalized");

  const timeRange = { fromIso: input.fromIso, toIso: input.toIso };
  const run = runQuery(pool, parsed.ast, evalCtx, { timeRange, limit: input.limit });
  if ("error" in run) {
    // surfaced to the caller as a typed rejected-query state
    const e = run as RunQueryError;
    throw new QueryParseFault({ ok: false, message: e.message, hint: "Adjust the time range." });
  }

  // Full matched set (bounded) for histogram + field statistics — these
  // summarise every match in the window, not just the returned page.
  const fullRun = runQuery(pool, parsed.ast, evalCtx, { timeRange, limit: 5000 });
  const allMatched = "error" in fullRun ? [] : fullRun.rows;

  const histogram = buildHistogram(allMatched, input.fromIso, input.toIso);
  const fieldStats = buildFieldStats(allMatched, familyOf);

  const partial = currentSim === "partial";
  return {
    result: partial ? { ...run, rows: run.rows.slice(0, Math.ceil(run.rows.length / 2)), truncated: true } : run,
    histogram,
    fieldStats,
    partial,
  };
}

function buildHistogram(rows: NormalizedEvent[], fromIso: string, toIso: string) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const span = Math.max(1, to - from);
  const buckets = 48;
  const size = span / buckets;
  const counts = new Array(buckets).fill(0);
  for (const e of rows) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((Date.parse(e.occurred_at) - from) / size)));
    counts[idx]++;
  }
  return counts.map((count, i) => ({ bucketStartIso: new Date(from + i * size).toISOString(), count }));
}

function buildFieldStats(rows: NormalizedEvent[], familyOf: (id: string) => string | undefined) {
  const fields: { field: string; get: (e: NormalizedEvent) => string[] }[] = [
    { field: "event_type", get: (e) => [e.event_type] },
    { field: "source.family", get: (e) => { const f = familyOf(e.telemetry_source_id); return f ? [f] : []; } },
    { field: "normalization_status", get: (e) => [e.normalization_status] },
    { field: "entity.user", get: (e) => (e.entities ?? []).filter((x) => x.entity_type === "user").map((x) => x.value) },
    { field: "entity.host", get: (e) => (e.entities ?? []).filter((x) => x.entity_type === "host").map((x) => x.value) },
    { field: "entity.ip", get: (e) => (e.entities ?? []).filter((x) => x.entity_type === "ip").map((x) => x.value) },
    { field: "attack_technique_refs", get: (e) => e.attack_technique_refs ?? [] },
  ];
  return fields.map(({ field, get }) => {
    const tally = new Map<string, number>();
    for (const e of rows) for (const v of get(e)) tally.set(v, (tally.get(v) ?? 0) + 1);
    const values = [...tally.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    return { field, values: values.slice(0, 10), distinct: values.length };
  });
}

export async function fetchEventLineage(ctx: SessionContext, eventId: string) {
  await gate("lineage");
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  const store = getStore();
  const event = store.normalizedEvents.find((e) => e.event_id === eventId && e.tenant_id === ctx.tenantId);
  if (!event) throw new AccessError("permission_denied", "Event not found in this tenant.");
  const raw = store.rawEvents.find((r) => r.raw_payload_ref === event.raw_payload_ref) ?? null;
  const related = store.normalizedEvents
    .filter((e) => e.tenant_id === ctx.tenantId && e.event_id !== eventId)
    .filter((e) => {
      const a = new Set((event.entities ?? []).map((x) => `${x.entity_type}:${x.value}`));
      return (e.entities ?? []).some((x) => a.has(`${x.entity_type}:${x.value}`));
    })
    .sort((a, b) => Math.abs(Date.parse(a.occurred_at) - Date.parse(event.occurred_at)) - Math.abs(Date.parse(b.occurred_at) - Date.parse(event.occurred_at)))
    .slice(0, 8);
  return { event, raw, related };
}
