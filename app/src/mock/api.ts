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
  addActionRequest,
  addAgentRun,
  agentRunOverride,
  addEvidence,
  addOpenedCase,
  addProposedRule,
  addTask,
  appendAudit,
  getSession,
  recordIntakeDecision,
  setKillSwitchOverride,
  setResponsePlan,
  updateAgentRun,
  updateProposedRule,
  upsertActionRequestOverride,
  upsertCaseOverride,
  upsertEvidenceReview,
  upsertPlaybookOverride,
  upsertRuleOverride,
  upsertTaskOverride,
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
import { buildCoverageMatrix } from "@/lib/coverage/matrix";
import { PARTNERS, ROLES, TENANT_MAP } from "@/data/platform";
import { dailyVolumeSeries } from "@/data/ingestion-profile";
import { DEMO_NOW_ISO, minus, secondsBetween } from "@/lib/time";
import type {
  AgentMessage,
  AgentRun,
  AlertEnvelope,
  AnalystFeedback,
  Case,
  CaseStatus,
  ClosureClassification,
  CorrelationRule,
  ActionRequest,
  ActionRequestStatus,
  Evidence,
  NormalizedEvent,
  PlaybookLifecycleState,
  RuleLifecycleState,
  Task,
  TaskStatus,
} from "@/schemas";
import { actionRequestSchema, caseSchema, evidenceSchema, taskSchema } from "@/schemas";
import type { RuleDefinition } from "@/lib/correlation/types";
import type { CaseCandidate, IntakeItem, TriageResult } from "@/lib/soc/types";
import { caseIdFor } from "@/data/soc-seed";
import { PLAYBOOKS, type SeededPlaybook } from "@/data/playbooks";
import { enrichCase } from "@/lib/soc/enrichment";
import { adviseCase } from "@/lib/soc/advisor";
import { investigateCase, investigationConfidence, investigationNeedsHandoff } from "@/lib/soc/investigation";
import { buildCaseTimeline } from "@/lib/soc/timeline";
import { runHunt, type HuntInput } from "@/lib/soc/hunt";
import { validatePlaybookTransition } from "@/lib/soc/playbook-lifecycle";
import { planResponse } from "@/lib/soc/response-planner";
import { approvalRequirement, canApprove, type ApprovalPolicy } from "@/lib/soc/action-approval";
import { executeAction as runExecutor, rollbackAction as runRollback, isReversible } from "@/lib/soc/executor";
import { summarizeCaseOrchestration } from "@/lib/soc/supervisor";
import { reviewAgentRun } from "@/lib/soc/qa-governance";
import { buildSocReport, draftReportNarrative } from "@/lib/soc/reporting";
import { hashString } from "@/lib/prng";

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
  const runs = [...getSession().agentRuns, ...store.agentActivity.runs]
    .filter((r) => r.tenant_id === ctx.tenantId)
    .map((r) => ({ ...r, ...agentRunOverride(r.agent_run_id) }));
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
  const found = [...getSession().agentRuns, ...store.agentActivity.runs].find(
    (r) => r.agent_run_id === runId && r.tenant_id === ctx.tenantId,
  );
  if (!found) throw new AccessError("permission_denied", "No such agent run in this tenant.");
  const run = { ...found, ...agentRunOverride(runId) };
  const messages = [...getSession().agentMessages, ...store.agentActivity.messages]
    .filter((m) => m.agent_run_id === runId)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  return {
    run,
    messages,
    rule: run.subject_type === "detection_rule" ? getMergedRule(ctx.tenantId, run.case_id) ?? null : null,
    qa: reviewAgentRun(run, messages),
  };
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
  if (!can(ctx, "rule.review") && !can(ctx, "case.work")) assertCan(ctx, "case.work");
  const session = getSession();
  const found =
    session.agentRuns.find((r) => r.agent_run_id === runId) ??
    getStore().agentActivity.runs.find((r) => r.agent_run_id === runId);
  if (!found || found.tenant_id !== ctx.tenantId) throw new AccessError("permission_denied", "No such run.");
  const run = { ...found, ...agentRunOverride(runId) };
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
// SIEM — ATT&CK × D3FEND coverage matrix
// ---------------------------------------------------------------------------

/** the coverage matrix computation, without the entitlement/permission gate */
function coverageMatrixFor(tenantId: string) {
  const store = getStore();
  const sources = store.telemetrySources.filter((s) => s.tenant_id === tenantId);
  const connectedFamilies = new Set(sources.map((s) => s.family));
  const liveFamilies = new Set(sources.filter((s) => s.health !== "stale").map((s) => s.family));
  const observedTechniqueIds = new Set(
    store.normalizedEvents
      .filter((e) => e.tenant_id === tenantId && e.normalization_status === "normalized")
      .flatMap((e) => e.attack_technique_refs ?? []),
  );

  const rules = mergedRules(tenantId).filter((r) => r.lifecycle_state === "enabled");
  const firedRuleIds = new Set(rules.filter((r) => (store.ruleFireCounts[r.rule_id] ?? recomputeFireCount(r)) > 0).map((r) => r.rule_id));

  // response side only exists when the tenant also has SOAR
  const hasSoc = !!TENANT_MAP[tenantId]?.entitlements.has_soc;
  const enabledPlaybooks = hasSoc ? mergedPlaybooks(tenantId).filter((p) => p.lifecycle_state === "enabled") : [];

  const matrix = buildCoverageMatrix({
    techniques: store.frameworks.attackTechniques,
    tactics: store.frameworks.attackTactics,
    connectedFamilies,
    liveFamilies,
    observedTechniqueIds,
    enabledRules: rules.map((r) => ({ rule_id: r.rule_id, name: r.name, attack_mapping: r.attack_mapping, d3fend_mapping: r.d3fend_mapping })),
    firedRuleIds,
    enabledPlaybooks: enabledPlaybooks.map((p) => ({ playbook_id: p.playbook_id, name: p.name, applies_to_techniques: p.applies_to_techniques, steps: p.steps })),
  });

  return {
    ...matrix,
    demoNowIso: store.demoNowIso,
    has_soc: hasSoc,
    attack_version: store.frameworks.attackVersion,
    d3fend_version: store.frameworks.d3fendVersion,
  };
}

export async function fetchCoverageMatrix(ctx: SessionContext) {
  await gate("coverage", 220);
  assertEntitlement(ctx, "has_siem");
  assertCan(ctx, "siem.view");
  return coverageMatrixFor(ctx.tenantId);
}

export type CoverageMatrixView = Awaited<ReturnType<typeof fetchCoverageMatrix>>;

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

// ---------------------------------------------------------------------------
// M4a — SOAR intake & triage
// ---------------------------------------------------------------------------

const CASE_SLA_HOURS: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72, informational: 72 };

function slaForCase(severity: string | undefined, createdAtIso: string): NonNullable<Case["sla"]> {
  const hours = CASE_SLA_HOURS[severity ?? "medium"] ?? 24;
  const dueAt = minus(createdAtIso, { hours: -hours });
  const remaining = secondsBetween(DEMO_NOW_ISO, dueAt);
  const total = hours * 3600;
  return { due_at: dueAt, status: remaining <= 0 ? "breached" : remaining < total * 0.25 ? "at_risk" : "on_track" };
}

/** seed cases ∪ session-opened cases, with session overrides applied — tenant-scoped */
function mergedCases(tenantId: string): Case[] {
  const session = getSession();
  const all = [
    ...getStore().cases.filter((c) => c.tenant_id === tenantId),
    ...session.openedCases.filter((c) => c.tenant_id === tenantId),
  ];
  return all.map((c) => {
    const o = session.caseOverrides.get(c.case_id);
    if (!o) return c;
    return {
      ...c,
      status: o.status ?? c.status,
      owner_id: o.owner_id ?? c.owner_id,
      triaged_at: o.triaged_at ?? c.triaged_at,
      closed_at: "closed_at" in o ? o.closed_at : c.closed_at,
      closure: "closure" in o ? o.closure : c.closure,
      agent_run_ids: o.agent_run_ids ?? c.agent_run_ids,
    };
  });
}

/** seeded ∪ session-added evidence, with review overrides applied — tenant-scoped */
function mergedEvidence(tenantId: string): Evidence[] {
  const session = getSession();
  const all = [
    ...getStore().caseEvidence.filter((e) => e.tenant_id === tenantId),
    ...session.addedEvidence.filter((e) => e.tenant_id === tenantId),
  ];
  return all.map((e) => {
    const o = session.evidenceReviews.get(e.evidence_id);
    if (!o) return e;
    return {
      ...e,
      review_state: o.review_state ?? e.review_state,
      reviewer_id: o.reviewer_id ?? e.reviewer_id,
      reviewer_comment: o.reviewer_comment ?? e.reviewer_comment,
      reviewed_at: o.reviewed_at ?? e.reviewed_at,
    };
  });
}

/** seeded ∪ session-added tasks, with status overrides applied — tenant-scoped */
function mergedTasks(tenantId: string): Task[] {
  const session = getSession();
  const all = [
    ...getStore().caseTasks.filter((t) => t.tenant_id === tenantId),
    ...session.addedTasks.filter((t) => t.tenant_id === tenantId),
  ];
  return all.map((t) => {
    const o = session.taskOverrides.get(t.task_id);
    if (!o) return t;
    return {
      ...t,
      status: o.status ?? t.status,
      assignee_id: o.assignee_id ?? t.assignee_id,
      completed_at: "completed_at" in o ? o.completed_at : t.completed_at,
      completed_by: "completed_by" in o ? o.completed_by : t.completed_by,
    };
  });
}

function caseTechniqueIds(linkedAlerts: AlertEnvelope[]): string[] {
  return [...new Set(linkedAlerts.flatMap((a) => (a.attack_techniques ?? []).map((t) => t.technique_id)))];
}

/** worst SLA signal across the case clock and its open tasks */
function taskSlaRollup(tasks: Task[]): { overdue: number; due_soon: number } {
  const now = DEMO_NOW_ISO;
  let overdue = 0;
  let due_soon = 0;
  for (const t of tasks) {
    if (t.status === "done" || t.status === "cancelled" || !t.due_at) continue;
    const remaining = secondsBetween(now, t.due_at);
    if (remaining <= 0) overdue++;
    else if (remaining < 3600 * 2) due_soon++;
  }
  return { overdue, due_soon };
}

function getMergedCase(tenantId: string, caseId: string): Case | undefined {
  return mergedCases(tenantId).find((c) => c.case_id === caseId);
}

function socAlertsFor(tenantId: string): AlertEnvelope[] {
  return getStore().socAlerts.filter((a) => a.tenant_id === tenantId);
}

function caseWorkersFor(tenantId: string): { user_id: string; display_name: string }[] {
  return getStore()
    .users.filter((u) =>
      u.roles.some((r) => r.tenant_id === tenantId && ROLES[r.role].permissions.includes("case.work")),
    )
    .map((u) => ({ user_id: u.user_id, display_name: u.display_name }));
}

export interface IntakeQueueRow {
  candidate: CaseCandidate;
  alerts: AlertEnvelope[];
  triage: TriageResult | null;
  decision: "opened" | "suppressed" | null;
  decided_by?: string;
  decided_at?: string;
  suppress_reason?: string;
  case_id: string | null;
}

export interface IntakeQueueResponse {
  pending: IntakeQueueRow[];
  actioned: IntakeQueueRow[];
  rejected: IntakeItem[];
  counts: {
    received: number;
    accepted: number;
    quarantined: number;
    duplicate: number;
    pending: number;
    opened: number;
    suppressed: number;
  };
}

export async function fetchIntakeQueue(ctx: SessionContext): Promise<IntakeQueueResponse> {
  await gate("intake-queue", 200);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const store = getStore();
  const session = getSession();

  const items = store.intakeItems.filter((i) => i.tenant_id === ctx.tenantId);
  const candidates = store.caseCandidates.filter((c) => c.tenant_id === ctx.tenantId);
  const alertById = new Map(socAlertsFor(ctx.tenantId).map((a) => [a.envelope_id, a] as const));
  const triageById = new Map(store.triageResults.map((t) => [t.candidate_id, t] as const));

  const rows: IntakeQueueRow[] = candidates.map((candidate) => {
    const seededCaseId = store.candidateCaseId[candidate.candidate_id] ?? null;
    const decision = session.intakeDecisions.get(candidate.candidate_id);
    return {
      candidate,
      alerts: candidate.envelope_ids.map((id) => alertById.get(id)).filter(Boolean) as AlertEnvelope[],
      triage: triageById.get(candidate.candidate_id) ?? null,
      decision: seededCaseId ? "opened" : decision?.decision ?? null,
      decided_by: decision?.by,
      decided_at: decision?.at,
      suppress_reason: decision?.reason,
      case_id: seededCaseId ?? decision?.case_id ?? null,
    };
  });

  const pending = rows
    .filter((r) => r.decision === null)
    .sort((a, b) => Date.parse(b.candidate.last_occurred_at) - Date.parse(a.candidate.last_occurred_at));
  const actioned = rows
    .filter((r) => r.decision !== null)
    .sort((a, b) => Date.parse(b.candidate.last_occurred_at) - Date.parse(a.candidate.last_occurred_at));

  return {
    pending,
    actioned,
    rejected: items.filter((i) => i.disposition !== "accepted"),
    counts: {
      received: items.length,
      accepted: items.filter((i) => i.disposition === "accepted").length,
      quarantined: items.filter((i) => i.disposition === "quarantined").length,
      duplicate: items.filter((i) => i.disposition === "duplicate").length,
      pending: pending.length,
      opened: rows.filter((r) => r.decision === "opened").length,
      suppressed: rows.filter((r) => r.decision === "suppressed").length,
    },
  };
}

export interface CaseFilter {
  status?: string;
  severity?: string;
  owner?: string;
}

export async function fetchCases(ctx: SessionContext, filter: CaseFilter = {}): Promise<Case[]> {
  await gate("cases", 200);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  let cases = mergedCases(ctx.tenantId);
  if (filter.status) cases = cases.filter((c) => c.status === filter.status);
  if (filter.severity) cases = cases.filter((c) => c.severity === filter.severity);
  if (filter.owner) cases = cases.filter((c) => c.owner_id === filter.owner);
  return cases.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export interface CaseTechniqueBreakdown {
  technique_id: string;
  technique_name: string;
  tactic: string;
  /** refs that resolve to a ZenC normalized event (native alerts) */
  traceable_refs: { ref: string; event_type?: string; occurred_at?: string }[];
  /** count of opaque source-provided refs (third-party alerts) */
  source_provided_ref_count: number;
}

export async function fetchCaseDetail(ctx: SessionContext, caseId: string) {
  await gate("case-detail", 220);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const store = getStore();
  const theCase = getMergedCase(ctx.tenantId, caseId);
  if (!theCase) throw new AccessError("permission_denied", "No such case in this tenant.");

  const alertById = new Map(socAlertsFor(ctx.tenantId).map((a) => [a.envelope_id, a] as const));
  const linkedAlerts = theCase.linked_alert_ids.map((id) => alertById.get(id)).filter(Boolean) as AlertEnvelope[];

  const eventById = new Map(store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId).map((e) => [e.event_id, e] as const));
  const byTechnique = new Map<string, CaseTechniqueBreakdown>();
  for (const alert of linkedAlerts) {
    for (const t of alert.attack_techniques ?? []) {
      const entry =
        byTechnique.get(t.technique_id) ??
        { technique_id: t.technique_id, technique_name: t.technique_name, tactic: t.tactic, traceable_refs: [], source_provided_ref_count: 0 };
      for (const ref of t.contributing_event_refs) {
        const ev = eventById.get(ref);
        if (ev) entry.traceable_refs.push({ ref, event_type: ev.event_type, occurred_at: ev.occurred_at });
        else entry.source_provided_ref_count++;
      }
      byTechnique.set(t.technique_id, entry);
    }
  }

  // candidate + triage: reverse-lookup from the seed map and session decisions
  const seededPair = Object.entries(store.candidateCaseId).find(([, cid]) => cid === caseId);
  const sessionPair = [...getSession().intakeDecisions.values()].find((d) => d.case_id === caseId);
  const candidateId = seededPair?.[0] ?? sessionPair?.candidate_id ?? null;
  const candidate = candidateId ? store.caseCandidates.find((c) => c.candidate_id === candidateId) ?? null : null;
  const triage = candidateId ? store.triageResults.find((t) => t.candidate_id === candidateId) ?? null : null;

  const agentRuns = [...getSession().agentRuns, ...store.agentActivity.runs].filter(
    (r) => r.tenant_id === ctx.tenantId && (r.case_id === caseId || (candidateId != null && r.case_id === candidateId)),
  );

  const firstReceived = linkedAlerts
    .map((a) => a.received_at)
    .filter(Boolean)
    .sort()[0];

  // evidence + tasks (seeded ∪ session)
  const evidence = mergedEvidence(ctx.tenantId)
    .filter((e) => e.linked_case_id === caseId)
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const tasks = mergedTasks(ctx.tenantId)
    .filter((t) => t.case_id === caseId)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  // enrichment + advisor are read-only derived views — recomputed live
  const tenantAlerts = socAlertsFor(ctx.tenantId);
  const tenantCases = mergedCases(ctx.tenantId);
  const enrichment = enrichCase(theCase, linkedAlerts, tenantAlerts, tenantCases, DEMO_NOW_ISO);
  const advisor = adviseCase(theCase, caseTechniqueIds(linkedAlerts), evidence, DEMO_NOW_ISO);

  // status-change history from the audit trail
  const statusChanges = [...getSession().audit, ...store.audit]
    .filter((a) => a.tenant_id === ctx.tenantId && a.target_id === caseId && a.action === "case_status_changed")
    .map((a) => ({ at: a.occurred_at, detail: a.detail ?? "" }));

  const timeline = buildCaseTimeline({ theCase, linkedAlerts, evidence, tasks, agentRuns, statusChanges });

  // M4c — response layer for this case
  const responsePlan = mergedPlanFor(caseId);
  const caseActionRequests = mergedActionRequests(ctx.tenantId).filter((r) => r.case_id === caseId);
  const orchestration = summarizeCaseOrchestration(caseId, agentRuns, caseActionRequests);

  return {
    case: theCase,
    allowed_transitions: theCase.status === "closed" ? (["reopened"] as CaseStatus[]) : CASE_TRANSITIONS[theCase.status] ?? [],
    can_close: theCase.status !== "closed" && theCase.status !== "new",
    responsePlan,
    actionRequests: caseActionRequests,
    orchestration,
    can_plan_response: can(ctx, "case.work") && theCase.status !== "closed",
    can_request_action: can(ctx, "action.request"),
    kill_switch_scope: engagedKillSwitchScope(ctx.tenantId),
    linkedAlerts,
    techniqueBreakdown: [...byTechnique.values()],
    candidate,
    triage,
    agentRuns,
    evidence,
    tasks,
    task_sla: taskSlaRollup(tasks),
    enrichment,
    advisor,
    timeline,
    latency: {
      received_at: firstReceived ?? null,
      ack_seconds: theCase.triaged_at && firstReceived ? secondsBetween(firstReceived, theCase.triaged_at) : null,
      resolve_seconds: theCase.closed_at ? secondsBetween(theCase.created_at, theCase.closed_at) : null,
    },
    caseWorkers: caseWorkersFor(ctx.tenantId),
    canReviewEvidence: can(ctx, "evidence.review"),
  };
}

export async function fetchSocDashboard(ctx: SessionContext) {
  await gate("soc-dashboard", 240);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const store = getStore();
  const cases = mergedCases(ctx.tenantId);
  const items = store.intakeItems.filter((i) => i.tenant_id === ctx.tenantId);
  const candidates = store.caseCandidates.filter((c) => c.tenant_id === ctx.tenantId);
  const decisions = getSession().intakeDecisions;
  const pendingCandidates = candidates.filter(
    (c) => !store.candidateCaseId[c.candidate_id] && !decisions.has(c.candidate_id),
  );

  const open = cases.filter((c) => c.status !== "closed");
  const closed = cases.filter((c) => c.status === "closed");
  const byStatus: Record<string, number> = {};
  for (const c of open) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const bySeverity: Record<string, number> = {};
  for (const c of open) bySeverity[c.severity ?? "unknown"] = (bySeverity[c.severity ?? "unknown"] ?? 0) + 1;
  const closureMix: Record<string, number> = {};
  for (const c of closed) if (c.closure) closureMix[c.closure.classification] = (closureMix[c.closure.classification] ?? 0) + 1;

  const sla = { on_track: 0, at_risk: 0, breached: 0 };
  for (const c of open) {
    const s = c.sla?.status ?? slaForCase(c.severity, c.created_at).status ?? "on_track";
    sla[s]++;
  }

  const alerts = socAlertsFor(ctx.tenantId);
  const mttd = avg(
    alerts.filter((a) => a.correlated_at).map((a) => secondsBetween(a.occurred_at, a.correlated_at!)),
  );
  const mttrResolve = avg(closed.map((c) => secondsBetween(c.created_at, c.closed_at!)));
  const mtta = avg(
    cases.filter((c) => c.triaged_at).map((c) => secondsBetween(c.created_at, c.triaged_at!)),
  );

  const openCaseIds = new Set(open.map((c) => c.case_id));
  const evidence = mergedEvidence(ctx.tenantId);
  const tasks = mergedTasks(ctx.tenantId);
  const evidencePendingReview = evidence.filter(
    (e) => (e.review_state === "submitted" || e.review_state === "under_review") && openCaseIds.has(e.linked_case_id ?? ""),
  ).length;
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled" && openCaseIds.has(t.case_id));
  const tasksOverdue = openTasks.filter((t) => t.due_at && secondsBetween(store.demoNowIso, t.due_at) <= 0).length;

  const workload: Record<string, number> = {};
  for (const c of open) workload[c.owner_id] = (workload[c.owner_id] ?? 0) + 1;

  return {
    demoNowIso: store.demoNowIso,
    intake: {
      received: items.length,
      accepted: items.filter((i) => i.disposition === "accepted").length,
      quarantined: items.filter((i) => i.disposition === "quarantined").length,
      duplicate: items.filter((i) => i.disposition === "duplicate").length,
      pending_triage: pendingCandidates.length,
    },
    cases: {
      open: open.length,
      closed: closed.length,
      byStatus,
      bySeverity,
      closureMix,
      unowned: open.filter((c) => !c.owner_id).length,
    },
    sla,
    latency: {
      mttd_seconds: mttd,
      mtta_seconds: mtta,
      mttr_seconds: mttrResolve,
    },
    investigation: {
      evidence_pending_review: evidencePendingReview,
      open_tasks: openTasks.length,
      tasks_overdue: tasksOverdue,
    },
    response: {
      approvals_pending: mergedActionRequests(ctx.tenantId).filter((r) => r.status === "pending_approval").length,
      actions_executed: mergedActionRequests(ctx.tenantId).filter((r) => r.status === "executed" || r.status === "verified").length,
    },
    workload: Object.entries(workload)
      .map(([owner_id, open_cases]) => ({ owner_id, open_cases }))
      .sort((a, b) => b.open_cases - a.open_cases),
    recentCases: cases.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 6),
  };
}

function avg(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null;
}

// ---- mutations ---------------------------------------------------------------

function requireCandidate(ctx: SessionContext, candidateId: string): CaseCandidate {
  const candidate = getStore().caseCandidates.find(
    (c) => c.candidate_id === candidateId && c.tenant_id === ctx.tenantId,
  );
  if (!candidate) throw new AccessError("permission_denied", "No such intake candidate in this tenant.");
  return candidate;
}

function alreadyDecided(candidateId: string): boolean {
  return !!getStore().candidateCaseId[candidateId] || getSession().intakeDecisions.has(candidateId);
}

export async function confirmCaseOpen(ctx: SessionContext, candidateId: string): Promise<{ case_id: string }> {
  await gate("confirm-case-open", 160);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const candidate = requireCandidate(ctx, candidateId);
  if (alreadyDecided(candidateId)) throw new AccessError("permission_denied", "This intake item has already been actioned.");

  const triage = getStore().triageResults.find((t) => t.candidate_id === candidateId);
  const now = DEMO_NOW_ISO;
  const caseId = caseIdFor(ctx.tenantId, candidateId);
  const severity = triage?.recommended_severity ?? candidate.max_severity;
  const owner = triage?.recommended_owner_id ?? ctx.userId;
  const title =
    socAlertsFor(ctx.tenantId).find((a) => a.envelope_id === candidate.envelope_ids[0])?.title ?? "Investigation";

  const newCase: Case = caseSchema.parse({
    case_id: caseId,
    tenant_id: ctx.tenantId,
    title,
    status: "triaged",
    severity,
    owner_id: owner,
    linked_alert_ids: candidate.envelope_ids,
    agent_run_ids: [`run-triage-${candidateId}`],
    sla: slaForCase(severity, now),
    created_at: now,
    triaged_at: now,
  });

  addOpenedCase(newCase);
  recordIntakeDecision({ candidate_id: candidateId, decision: "opened", by: ctx.userId, at: now, case_id: caseId });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "case_created",
    target_type: "case",
    target_id: caseId,
    detail: `Opened from intake candidate ${candidateId} (triage recommended "${triage?.recommendation ?? "open"}") — ${candidate.envelope_ids.length} alert(s), ${severity}`,
  });
  return { case_id: caseId };
}

export async function suppressCandidate(ctx: SessionContext, candidateId: string, reason: string) {
  await gate("suppress-candidate", 140);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  requireCandidate(ctx, candidateId);
  if (alreadyDecided(candidateId)) throw new AccessError("permission_denied", "This intake item has already been actioned.");
  if (!reason.trim()) throw new AccessError("permission_denied", "A suppression needs a documented reason.");

  const now = DEMO_NOW_ISO;
  recordIntakeDecision({ candidate_id: candidateId, decision: "suppressed", by: ctx.userId, at: now, reason: reason.trim() });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "alert_suppressed",
    target_type: "alert",
    target_id: candidateId,
    detail: `Suppressed intake candidate ${candidateId} — "${reason.trim()}"`,
  });
  return { ok: true };
}

const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  new: ["triaged"],
  triaged: ["investigating", "new"],
  investigating: ["contained", "triaged"],
  contained: ["recovering", "investigating"],
  recovering: ["investigating"],
  closed: ["reopened"],
  reopened: ["investigating", "closed"],
};

export async function setCaseStatus(ctx: SessionContext, caseId: string, to: CaseStatus, note?: string) {
  await gate("set-case-status", 150);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const theCase = getMergedCase(ctx.tenantId, caseId);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (to === "closed") throw new AccessError("permission_denied", "Close a case through closeCase — a closure classification is required.");
  if (!(CASE_TRANSITIONS[theCase.status] ?? []).includes(to)) {
    throw new AccessError("permission_denied", `A ${theCase.status} case cannot move to ${to}.`);
  }
  const now = DEMO_NOW_ISO;
  const patch: Parameters<typeof upsertCaseOverride>[1] = { status: to };
  if (!theCase.triaged_at && to !== "new") patch.triaged_at = now;
  if (theCase.status === "closed" && to === "reopened") {
    patch.closed_at = undefined;
    patch.closure = undefined;
  }
  upsertCaseOverride(caseId, patch);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "case_status_changed",
    target_type: "case",
    target_id: caseId,
    detail: `${theCase.status} → ${to}${note ? ` (${note})` : ""}`,
  });
  return { status: to };
}

export async function assignCaseOwner(ctx: SessionContext, caseId: string, ownerId: string) {
  await gate("assign-case-owner", 130);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const theCase = getMergedCase(ctx.tenantId, caseId);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (!caseWorkersFor(ctx.tenantId).some((w) => w.user_id === ownerId)) {
    throw new AccessError("permission_denied", "That user cannot own a case in this tenant.");
  }
  const now = DEMO_NOW_ISO;
  upsertCaseOverride(caseId, { owner_id: ownerId });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "case_status_changed",
    target_type: "case",
    target_id: caseId,
    detail: `owner → ${ownerId}`,
  });
  return { owner_id: ownerId };
}

export async function closeCase(
  ctx: SessionContext,
  caseId: string,
  classification: ClosureClassification,
  reason?: string,
) {
  await gate("close-case", 160);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const theCase = getMergedCase(ctx.tenantId, caseId);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (classification === "suppressed" && !reason?.trim()) {
    throw new AccessError("permission_denied", "A suppressed closure needs a documented reason.");
  }
  const now = DEMO_NOW_ISO;
  // validate the resulting case against the contract (the .refine guards fire here)
  caseSchema.parse({
    ...theCase,
    status: "closed",
    closed_at: now,
    closure: { classification, reason: reason?.trim(), closed_by: ctx.userId },
  });
  upsertCaseOverride(caseId, {
    status: "closed",
    closed_at: now,
    closure: { classification, reason: reason?.trim(), closed_by: ctx.userId },
  });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "case_status_changed",
    target_type: "case",
    target_id: caseId,
    detail: `${theCase.status} → closed (${classification})`,
  });
  return { status: "closed" as const, classification };
}

// ---------------------------------------------------------------------------
// M4b — SOAR investigation (evidence, tasks, timeline, investigation agents)
// ---------------------------------------------------------------------------

function evalCtxForTenant(tenantId: string) {
  const map = new Map(getStore().telemetrySources.filter((s) => s.tenant_id === tenantId).map((s) => [s.telemetry_source_id, s.family]));
  return { familyOf: (id: string) => map.get(id) };
}

function stableId(prefix: string, seed: string): string {
  return `${prefix}-${(hashString(seed) >>> 0).toString(36)}`;
}

// ---- Evidence -------------------------------------------------------------

export interface EvidenceQueueRow {
  evidence: Evidence;
  case_title: string;
  case_status: string;
}

export async function fetchEvidenceQueue(ctx: SessionContext, filter: { state?: string } = {}) {
  await gate("evidence-queue", 200);
  assertEntitlement(ctx, "has_soc");
  if (!can(ctx, "evidence.review") && !can(ctx, "case.work") && !can(ctx, "audit.view")) {
    assertCan(ctx, "evidence.review");
  }
  const caseById = new Map(mergedCases(ctx.tenantId).map((c) => [c.case_id, c] as const));
  let rows: EvidenceQueueRow[] = mergedEvidence(ctx.tenantId).map((evidence) => {
    const c = evidence.linked_case_id ? caseById.get(evidence.linked_case_id) : undefined;
    return { evidence, case_title: c?.title ?? evidence.linked_case_id ?? "—", case_status: c?.status ?? "—" };
  });
  if (filter.state) rows = rows.filter((r) => r.evidence.review_state === filter.state);
  rows.sort((a, b) => Date.parse(b.evidence.submitted_at) - Date.parse(a.evidence.submitted_at));

  const counts: Record<string, number> = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
  for (const r of mergedEvidence(ctx.tenantId)) counts[r.review_state]++;

  return { rows, counts, can_review: can(ctx, "evidence.review") };
}

export interface AddEvidenceInput {
  case_id: string;
  title: string;
  reference_type: "file" | "link" | "note";
  reference: string;
  confidence: number;
  supersedes_evidence_id?: string;
}

export async function addCaseEvidence(ctx: SessionContext, input: AddEvidenceInput): Promise<{ evidence_id: string }> {
  await gate("add-evidence", 140);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const theCase = getMergedCase(ctx.tenantId, input.case_id);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (input.supersedes_evidence_id) {
    const prior = mergedEvidence(ctx.tenantId).find((e) => e.evidence_id === input.supersedes_evidence_id);
    if (!prior || prior.linked_case_id !== input.case_id) {
      throw new AccessError("permission_denied", "The superseded evidence item is not on this case.");
    }
  }
  const now = DEMO_NOW_ISO;
  const evidence_id = stableId("ev-u", `${input.case_id}:${input.title}:${now}:${getSession().addedEvidence.length}`);
  const item: Evidence = evidenceSchema.parse({
    evidence_id,
    tenant_id: ctx.tenantId,
    origin: "soc",
    linked_case_id: input.case_id,
    reference_type: input.reference_type,
    reference: input.reference,
    title: input.title,
    submitted_by: ctx.userId,
    submitted_at: now,
    review_state: "submitted",
    confidence: input.confidence,
    content_hash: `sha256:${(hashString(input.reference) >>> 0).toString(16).padStart(8, "0")}${(hashString(input.reference + now) >>> 0).toString(16).padStart(8, "0")}`,
    supersedes_evidence_id: input.supersedes_evidence_id ?? null,
  });
  addEvidence(item);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "evidence_added",
    target_type: "evidence",
    target_id: evidence_id,
    detail: `${input.title} → case ${input.case_id}${input.supersedes_evidence_id ? ` (supersedes ${input.supersedes_evidence_id})` : ""}`,
  });
  return { evidence_id };
}

export async function reviewEvidence(
  ctx: SessionContext,
  evidenceId: string,
  decision: "approved" | "rejected" | "under_review",
  comment?: string,
) {
  await gate("review-evidence", 140);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "evidence.review");
  const item = mergedEvidence(ctx.tenantId).find((e) => e.evidence_id === evidenceId);
  if (!item) throw new AccessError("permission_denied", "No such evidence item.");
  if (item.submitted_by === ctx.userId) {
    throw new AccessError("permission_denied", "You cannot review evidence you submitted — a second person must review it.");
  }
  if (decision === "rejected" && !comment?.trim()) {
    throw new AccessError("permission_denied", "A rejection needs a comment.");
  }
  const now = DEMO_NOW_ISO;
  const patch =
    decision === "under_review"
      ? { review_state: "under_review" as const }
      : { review_state: decision, reviewer_id: ctx.userId, reviewer_comment: comment?.trim(), reviewed_at: now };
  // validate the resulting item against the contract
  evidenceSchema.parse({ ...item, ...patch });
  upsertEvidenceReview(evidenceId, patch);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "evidence_reviewed",
    target_type: "evidence",
    target_id: evidenceId,
    detail: `${decision}${comment?.trim() ? ` — "${comment.trim()}"` : ""}`,
  });
  return { review_state: decision };
}

// ---- Tasks --------------------------------------------------------------

export interface AddTaskInput {
  case_id: string;
  title: string;
  detail?: string;
  assignee_id?: string;
  due_in_hours?: number;
}

export async function addCaseTask(ctx: SessionContext, input: AddTaskInput): Promise<{ task_id: string }> {
  await gate("add-task", 120);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const theCase = getMergedCase(ctx.tenantId, input.case_id);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (input.assignee_id && !caseWorkersFor(ctx.tenantId).some((w) => w.user_id === input.assignee_id)) {
    throw new AccessError("permission_denied", "That user cannot be assigned a task in this tenant.");
  }
  const now = DEMO_NOW_ISO;
  const task_id = stableId("task-u", `${input.case_id}:${input.title}:${getSession().addedTasks.length}`);
  const item: Task = taskSchema.parse({
    task_id,
    tenant_id: ctx.tenantId,
    case_id: input.case_id,
    title: input.title,
    detail: input.detail,
    status: "open",
    assignee_id: input.assignee_id ?? theCase.owner_id,
    due_at: input.due_in_hours ? minus(now, { hours: -input.due_in_hours }) : undefined,
    created_at: now,
    created_by: ctx.userId,
    source: "human",
  });
  addTask(item);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "task_created",
    target_type: "task",
    target_id: task_id,
    detail: `${input.title} → case ${input.case_id}`,
  });
  return { task_id };
}

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "done", "open"],
  blocked: ["in_progress", "cancelled"],
  done: ["in_progress"],
  cancelled: ["open"],
};

export async function updateTaskStatus(ctx: SessionContext, taskId: string, to: TaskStatus) {
  await gate("update-task", 110);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const task = mergedTasks(ctx.tenantId).find((t) => t.task_id === taskId);
  if (!task) throw new AccessError("permission_denied", "No such task.");
  if (!(TASK_TRANSITIONS[task.status] ?? []).includes(to)) {
    throw new AccessError("permission_denied", `A ${task.status} task cannot move to ${to}.`);
  }
  const now = DEMO_NOW_ISO;
  const patch =
    to === "done"
      ? { status: to, completed_at: now, completed_by: ctx.userId }
      : { status: to, completed_at: undefined, completed_by: undefined };
  upsertTaskOverride(taskId, patch);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "task_updated",
    target_type: "task",
    target_id: taskId,
    detail: `${task.status} → ${to}`,
  });
  return { status: to };
}

// ---- On-demand investigation agents ------------------------------------

export async function runCaseAgent(ctx: SessionContext, caseId: string, agent: "enrichment" | "investigation" | "advisor") {
  await gate(`run-${agent}`, agent === "investigation" ? 700 : 300);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const store = getStore();
  const theCase = getMergedCase(ctx.tenantId, caseId);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  const linkedAlerts = socAlertsFor(ctx.tenantId).filter((a) => theCase.linked_alert_ids.includes(a.envelope_id));
  const now = DEMO_NOW_ISO;
  const runId = `run-${agent === "enrichment" ? "enrich" : agent === "investigation" ? "investigate" : "advisor"}-${caseId}-${(hashString(now + getSession().agentRuns.length) >>> 0).toString(36)}`;

  const mkMessage = (overrides: Partial<AgentMessage>): AgentMessage => ({
    message_id: `${runId}-m1`,
    agent_run_id: runId,
    agent_name: "enrichment-agent",
    tenant_id: ctx.tenantId,
    occurred_at: now,
    prompt_version: "v1.0",
    tool_version: "v1.0",
    input_ref: caseId,
    tool_calls: [],
    claim: "",
    confidence: 0.5,
    evidence: [],
    ...overrides,
  });

  let message: AgentMessage;
  let investigationHandoff = false;
  const newEvidenceIds: string[] = [];

  if (agent === "enrichment") {
    const enr = enrichCase(theCase, linkedAlerts, socAlertsFor(ctx.tenantId), mergedCases(ctx.tenantId), now);
    message = mkMessage({
      agent_name: "enrichment-agent",
      prompt_version: "enrichment-agent-prompt-v1.0",
      tool_version: "asset-lookup-tool-v1.0",
      tool_calls: [
        { tool_name: "asset-lookup", called_at: now, scope_or_bound: `${enr.entities.length} entity/entities` },
        { tool_name: "identity-lookup", called_at: now, scope_or_bound: "one entity per call" },
        { tool_name: "ti-lookup", called_at: now, scope_or_bound: "cached" },
      ],
      claim: `Re-ran enrichment for ${enr.entities.length} entities. ${enr.notable[0]}`,
      confidence: 0.7,
      evidence: enr.notable.slice(0, 4).map((n) => ({ evidence_ref: n, supports: true, freshness: now })),
    });
  } else if (agent === "advisor") {
    const adv = adviseCase(theCase, caseTechniqueIds(linkedAlerts), mergedEvidence(ctx.tenantId).filter((e) => e.linked_case_id === caseId), now);
    message = mkMessage({
      agent_name: "digital-advisor-agent",
      prompt_version: "digital-advisor-agent-prompt-v1.0",
      tool_version: "approved-knowledge-read-tool-v1.0",
      tool_calls: [
        { tool_name: "case-read", called_at: now, scope_or_bound: "the assigned case" },
        { tool_name: "approved-knowledge-read", called_at: now, scope_or_bound: `${adv.based_on.knowledge.length} lesson(s)` },
      ],
      claim: adv.recommendation.slice(0, 240),
      confidence: adv.based_on.knowledge.length ? 0.65 : 0.4,
      evidence: adv.caveats.map((c) => ({ evidence_ref: c, supports: false, freshness: now })),
      policy_outcome: "advisory only — the Digital Advisor cannot approve or execute an action",
    });
  } else {
    const findings = investigateCase(
      theCase,
      linkedAlerts,
      store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId),
      evalCtxForTenant(ctx.tenantId),
    );
    for (const f of findings) {
      const evidence_id = stableId("ev", `${f.finding_id}:${now}`);
      newEvidenceIds.push(evidence_id);
      addEvidence(
        evidenceSchema.parse({
          evidence_id,
          tenant_id: ctx.tenantId,
          origin: "soc",
          linked_case_id: caseId,
          reference_type: "note",
          reference: `${f.summary}\n\nquery: ${f.query}\nwindow: ${f.window.fromIso} → ${f.window.toIso}\ncited events: ${f.cited_event_ids.join(", ") || "(none — no corroborating local telemetry)"}`,
          title: `Investigation finding — ${linkedAlerts.find((a) => f.query.includes(a.entities?.[0]?.value ?? " "))?.title ?? "entity activity"}`,
          submitted_by: "investigation-agent",
          submitted_at: now,
          review_state: "submitted",
          confidence: f.confidence,
          content_hash: `sha256:${(hashString(f.summary) >>> 0).toString(16).padStart(8, "0")}`,
          supersedes_evidence_id: null,
        }),
      );
      appendAudit({
        tenant_id: ctx.tenantId,
        occurred_at: now,
        actor: { principal_id: "investigation-agent", principal_type: "agent" },
        action: "evidence_added",
        target_type: "evidence",
        target_id: evidence_id,
        detail: `Investigation finding drafted (submitted, awaiting review) → case ${caseId}`,
      });
    }
    const handoff = investigationNeedsHandoff(findings);
    message = mkMessage({
      agent_name: "investigation-agent",
      prompt_version: "investigation-agent-prompt-v1.0",
      tool_version: "log-search-tool-v2.1",
      tool_calls: [
        { tool_name: "case-read", called_at: now, scope_or_bound: "the assigned case" },
        { tool_name: "log-search", called_at: now, scope_or_bound: `≤5000 events, ≤24h, ${findings.length} quer${findings.length === 1 ? "y" : "ies"}` },
      ],
      claim:
        (findings.length
          ? `Ran ${findings.length} bounded, source-cited quer${findings.length === 1 ? "y" : "ies"}; drafted ${findings.length} finding(s) as submitted evidence.`
          : "Ran bounded queries; no corroborating telemetry in the sample.") +
        (handoff ? " Confidence is below the hand-off threshold — escalating to a human rather than proceeding." : ""),
      confidence: findings.length ? investigationConfidence(findings) : 0.35,
      evidence: findings.map((f) => ({ evidence_ref: `finding: ${f.matched_count} events`, supports: true, freshness: now })),
      escalated: handoff || undefined,
      escalation_reason: handoff ? "low_confidence" : undefined,
      policy_outcome: handoff
        ? "handed to a human — the finding is too weak to stand on its own"
        : "findings written as evidence in 'submitted' state — a human reviews before they count",
    });
    investigationHandoff = handoff;
  }

  const run: AgentRun = {
    agent_run_id: runId,
    tenant_id: ctx.tenantId,
    case_id: caseId,
    subject_type: "case",
    started_at: now,
    completed_at: now,
    message_ids: [message.message_id],
    total_tool_calls: message.tool_calls.length,
    elapsed_seconds: agent === "investigation" ? 22 : 9,
    human_touchpoints: [{ principal_id: ctx.userId, action: "reviewed", at: now, note: `Invoked the ${agent} agent` }],
    outcome: investigationHandoff ? "escalated_pending_human" : "completed",
    analyst_feedback: null,
  };
  addAgentRun(run, [message]);
  return { run_id: runId, new_evidence_ids: newEvidenceIds };
}

// ---- Hunt --------------------------------------------------------------

export async function huntQuery(ctx: SessionContext, input: HuntInput) {
  await gate("hunt", 320);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const store = getStore();
  const pool = store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId);
  const result = runHunt(input, pool, evalCtxForTenant(ctx.tenantId));

  // record the hunt as an agent run (the Hunt Agent ran an analyst query)
  const now = DEMO_NOW_ISO;
  const runId = `run-hunt-${(hashString(input.query + now + getSession().agentRuns.length) >>> 0).toString(36)}`;
  const ok = !("error" in result);
  const message: AgentMessage = {
    message_id: `${runId}-m1`,
    agent_run_id: runId,
    agent_name: "hunt-agent",
    tenant_id: ctx.tenantId,
    occurred_at: now,
    prompt_version: "hunt-agent-prompt-v1.0",
    tool_version: "log-search-tool-v2.1",
    input_ref: input.query.slice(0, 120),
    tool_calls: [{ tool_name: "log-search", called_at: now, scope_or_bound: "≤5000 events, ≤7d, safe parser only" }],
    claim: ok
      ? `Analyst hunt: ${(result as { matched_count: number }).matched_count} match(es) for the query in the window.`
      : `Analyst hunt rejected: ${(result as { message?: string }).message ?? "bad query"}.`,
    confidence: 0.5,
    evidence: [],
    policy_outcome: "the Hunt Agent never auto-creates a case — the analyst decides",
  };
  addAgentRun(
    {
      agent_run_id: runId,
      tenant_id: ctx.tenantId,
      case_id: `hunt:${input.query.slice(0, 40)}`,
      subject_type: "case",
      started_at: now,
      completed_at: now,
      message_ids: [message.message_id],
      total_tool_calls: 1,
      elapsed_seconds: 4,
      human_touchpoints: [{ principal_id: ctx.userId, action: "reviewed", at: now, note: "Issued the hunt query" }],
      outcome: "completed",
      analyst_feedback: null,
    },
    [message],
  );

  return { result, run_id: runId };
}

export async function openCaseFromHunt(ctx: SessionContext, input: { eventIds: string[]; title: string }) {
  await gate("case-from-hunt", 180);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  if (input.eventIds.length === 0) throw new AccessError("permission_denied", "Select at least one event to open a case.");
  const store = getStore();
  const events = store.normalizedEvents.filter((e) => e.tenant_id === ctx.tenantId && input.eventIds.includes(e.event_id));
  if (events.length === 0) throw new AccessError("permission_denied", "None of those events exist in this tenant.");
  const now = DEMO_NOW_ISO;
  const caseId = stableId("case-hunt", `${ctx.tenantId}:${input.title}:${now}`);
  const first = events.map((e) => e.occurred_at).sort()[0];

  const newCase: Case = caseSchema.parse({
    case_id: caseId,
    tenant_id: ctx.tenantId,
    title: input.title,
    status: "triaged",
    severity: "medium",
    owner_id: ctx.userId,
    linked_alert_ids: [],
    created_at: now,
    triaged_at: now,
    sla: slaForCase("medium", now),
  });
  addOpenedCase(newCase);

  const evidence_id = stableId("ev-hunt", caseId);
  addEvidence(
    evidenceSchema.parse({
      evidence_id,
      tenant_id: ctx.tenantId,
      origin: "soc",
      linked_case_id: caseId,
      reference_type: "note",
      title: "Hunt result — events selected by the analyst",
      reference: `first activity: ${first}\nevents: ${events.map((e) => e.event_id).join(", ")}`,
      submitted_by: ctx.userId,
      submitted_at: now,
      review_state: "submitted",
      confidence: 0.6,
      content_hash: `sha256:${(hashString(events.map((e) => e.event_id).join()) >>> 0).toString(16).padStart(8, "0")}`,
      supersedes_evidence_id: null,
    }),
  );

  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "case_created",
    target_type: "case",
    target_id: caseId,
    detail: `Opened from a hunt result — ${events.length} event(s)`,
  });
  return { case_id: caseId };
}

// ---------------------------------------------------------------------------
// M4c — SOAR response: playbooks, planning, approvals, execution, kill switches
// ---------------------------------------------------------------------------

function approvalPolicyFor(tenantId: string): ApprovalPolicy {
  const p = TENANT_MAP[tenantId]?.policy;
  return {
    default_autonomy_level: p?.default_autonomy_level ?? "L2",
    pre_authorized_action_classes: p?.pre_authorized_action_classes ?? ["A0", "A1"],
    l3_preauthorized_action_types: p?.l3_preauthorized_action_types ?? [],
  };
}

// ---- kill switches -----------------------------------------------------------

interface KillSwitchView {
  key: string;
  scope: "global" | "partner" | "tenant";
  label: string;
  engaged: boolean;
  engaged_reason?: string;
}

function killSwitchViews(): KillSwitchView[] {
  const ov = getSession().killSwitchOverrides;
  const store = getStore();
  const g = ov.get("global");
  const views: KillSwitchView[] = [
    {
      key: "global",
      scope: "global",
      label: "Global",
      engaged: g ? g.engaged : store.killSwitches.global.engaged,
      engaged_reason: g ? g.engaged_reason : store.killSwitches.global.engaged_reason,
    },
  ];
  for (const partner of PARTNERS) {
    const o = ov.get(`partner:${partner.partner_id}`);
    views.push({
      key: `partner:${partner.partner_id}`,
      scope: "partner",
      label: `Partner - ${partner.name}`,
      engaged: o ? o.engaged : partner.kill_switch.engaged,
      engaged_reason: o ? o.engaged_reason : partner.kill_switch.engaged_reason,
    });
  }
  for (const t of Object.values(TENANT_MAP)) {
    const o = ov.get(`tenant:${t.tenant_id}`);
    views.push({
      key: `tenant:${t.tenant_id}`,
      scope: "tenant",
      label: `Tenant - ${t.name}`,
      engaged: o ? o.engaged : t.policy.kill_switch.engaged,
      engaged_reason: o ? o.engaged_reason : t.policy.kill_switch.engaged_reason,
    });
  }
  return views;
}

/** the kill-switch booleans that apply to one tenant's action execution */
function killSwitchGateFor(tenantId: string): { global: boolean; partner: boolean; tenant: boolean; engaged_reason?: string } {
  const views = killSwitchViews();
  const global = views.find((v) => v.key === "global")!;
  const tenant = TENANT_MAP[tenantId];
  const partner = views.find((v) => v.scope === "partner" && v.key === `partner:${tenant?.partner_id}`);
  const tenantView = views.find((v) => v.key === `tenant:${tenantId}`);
  const reason = [global, partner, tenantView].find((v) => v?.engaged)?.engaged_reason;
  return {
    global: global.engaged,
    partner: !!partner?.engaged,
    tenant: !!tenantView?.engaged,
    engaged_reason: reason,
  };
}

/** a pending approval older than this is flagged as stale (not auto-expired) */
const STALE_PENDING_HOURS = 48;

/** which scope (if any) is halting the response pipeline for a tenant */
function engagedKillSwitchScope(tenantId: string): "global" | "partner" | "tenant" | null {
  const g = killSwitchGateFor(tenantId);
  return g.global ? "global" : g.partner ? "partner" : g.tenant ? "tenant" : null;
}

/**
 * A kill switch freezes the whole response pipeline for its scope — no new
 * plans, no new action requests, no approvals, and (in the executor) no
 * execution of anything already approved (agentic-architecture.md,
 * review-agent-safety.md "Kill switch"). Denials are still allowed.
 */
function assertResponsePipelineOpen(tenantId: string): void {
  const scope = engagedKillSwitchScope(tenantId);
  if (scope) {
    const reason = killSwitchGateFor(tenantId).engaged_reason;
    throw new AccessError(
      "permission_denied",
      `The ${scope} kill switch is engaged${reason ? ` (${reason})` : ""} — the response pipeline is frozen for this scope. Disarm it to plan, request, approve, or execute actions.`,
    );
  }
}

export async function fetchKillSwitches(ctx: SessionContext) {
  await gate("kill-switches", 90);
  // kill-switch state across tenants/partners is cross-tenant policy data —
  // same gate as fetchPolicies, not the looser soc.view.
  if (!can(ctx, "admin.policy") && !can(ctx, "audit.view")) assertCan(ctx, "admin.policy");
  return { switches: killSwitchViews(), can_toggle: can(ctx, "admin.policy") };
}

export async function toggleKillSwitch(ctx: SessionContext, key: string, engaged: boolean, reason?: string) {
  await gate("toggle-kill-switch", 140);
  assertCan(ctx, "admin.policy");
  if (!killSwitchViews().some((v) => v.key === key)) throw new AccessError("permission_denied", "Unknown kill switch.");
  if (engaged && !reason?.trim()) throw new AccessError("permission_denied", "Engaging a kill switch needs a documented reason.");
  const now = DEMO_NOW_ISO;
  setKillSwitchOverride(key, { engaged, engaged_reason: engaged ? reason?.trim() : undefined });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "kill_switch_toggled",
    target_type: "policy",
    target_id: key,
    detail: `${key} ${engaged ? `ENGAGED - "${reason?.trim()}"` : "disarmed"}`,
  });
  return { key, engaged };
}

// ---- playbooks --------------------------------------------------------------

export type PlaybookView = SeededPlaybook & {
  allowed_transitions: PlaybookLifecycleState[];
  is_agent_proposed: boolean;
};

const PLAYBOOK_HUMAN_NEXT: Partial<Record<PlaybookLifecycleState, PlaybookLifecycleState[]>> = {
  draft: ["test"],
  test: ["draft", "peer_review"],
  peer_review: ["draft", "approved"],
  approved: ["draft", "enabled"],
  enabled: ["disabled"],
  disabled: ["enabled", "retired"],
};

function mergedPlaybooks(tenantId: string): SeededPlaybook[] {
  const session = getSession();
  const merged = PLAYBOOKS.filter((p) => p.tenant_id === tenantId).map((p) => {
    const o = session.playbookOverrides.get(p.playbook_id);
    if (!o) return p;
    return {
      ...p,
      lifecycle_state: o.lifecycle_state ?? p.lifecycle_state,
      enabled_by: o.enabled_by ?? p.enabled_by,
      version: o.version ?? p.version,
      history: o.history ?? p.history,
    };
  });
  return [...merged, ...session.proposedPlaybooks.filter((p) => p.tenant_id === tenantId)];
}

function getMergedPlaybook(tenantId: string, id: string): SeededPlaybook | undefined {
  return mergedPlaybooks(tenantId).find((p) => p.playbook_id === id);
}

function toPlaybookView(pb: SeededPlaybook, ctx: SessionContext): PlaybookView {
  const perms = permissionsFor(ctx);
  const allowed = (PLAYBOOK_HUMAN_NEXT[pb.lifecycle_state] ?? []).filter(
    (to) => validatePlaybookTransition(pb, to, { principal_id: ctx.userId, principal_type: "human", permissions: perms }).ok,
  );
  return { ...pb, allowed_transitions: allowed, is_agent_proposed: pb.proposed_by === "response-planner-agent" };
}

export async function fetchPlaybooks(ctx: SessionContext): Promise<PlaybookView[]> {
  await gate("playbooks", 160);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  return mergedPlaybooks(ctx.tenantId).map((p) => toPlaybookView(p, ctx));
}

export async function fetchPlaybookDetail(ctx: SessionContext, playbookId: string) {
  await gate("playbook-detail");
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const pb = getMergedPlaybook(ctx.tenantId, playbookId);
  if (!pb) throw new AccessError("permission_denied", "No such playbook in this tenant.");
  const runs = [...getSession().agentRuns, ...getStore().agentActivity.runs].filter(
    (r) => r.tenant_id === ctx.tenantId && r.case_id === playbookId,
  );
  return { playbook: toPlaybookView(pb, ctx), agent_runs: runs };
}

export async function transitionPlaybook(ctx: SessionContext, playbookId: string, to: PlaybookLifecycleState, note?: string) {
  await gate("transition-playbook", 150);
  assertEntitlement(ctx, "has_soc");
  const pb = getMergedPlaybook(ctx.tenantId, playbookId);
  if (!pb) throw new AccessError("permission_denied", "No such playbook.");
  const verdict = validatePlaybookTransition(pb, to, {
    principal_id: ctx.userId,
    principal_type: "human",
    permissions: permissionsFor(ctx),
  });
  if (!verdict.ok) throw new AccessError("permission_denied", verdict.message);

  const now = DEMO_NOW_ISO;
  const history = [
    ...(pb.history ?? []),
    { from_state: pb.lifecycle_state, to_state: to, changed_by: ctx.userId, changed_at: now },
  ];
  upsertPlaybookOverride(playbookId, { lifecycle_state: to, history, ...(to === "enabled" ? { enabled_by: ctx.userId } : {}) });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "playbook_state_changed",
    target_type: "playbook",
    target_id: playbookId,
    detail: `${pb.name}: ${pb.lifecycle_state} -> ${to}${note ? ` (${note})` : ""}`,
  });
  return { lifecycle_state: to };
}

// ---- response planning -----------------------------------------------------

function mergedPlanFor(caseId: string): ReturnType<typeof planResponse> | null {
  return getSession().responsePlans.get(caseId) ?? getStore().responsePlans[caseId] ?? null;
}

export async function planCaseResponse(ctx: SessionContext, caseId: string) {
  await gate("plan-response", 500);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  assertResponsePipelineOpen(ctx.tenantId);
  const theCase = getMergedCase(ctx.tenantId, caseId);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (theCase.status === "closed") throw new AccessError("permission_denied", "The case is closed — reopen it to plan a response.");
  const linked = socAlertsFor(ctx.tenantId).filter((a) => theCase.linked_alert_ids.includes(a.envelope_id));
  const enabled = mergedPlaybooks(ctx.tenantId).filter((p) => p.lifecycle_state === "enabled");
  const plan = planResponse(theCase, linked, enabled, approvalPolicyFor(ctx.tenantId));
  setResponsePlan(caseId, plan);

  const now = DEMO_NOW_ISO;
  const runId = `run-plan-${caseId}-${(hashString(now + getSession().agentRuns.length) >>> 0).toString(36)}`;
  const message: AgentMessage = {
    message_id: `${runId}-m1`,
    agent_run_id: runId,
    agent_name: "response-planner-agent",
    tenant_id: ctx.tenantId,
    occurred_at: now,
    prompt_version: "response-planner-agent-prompt-v1.0",
    tool_version: "playbook-read-tool-v1.0",
    rule_or_playbook_version: plan.playbook_id ?? undefined,
    input_ref: caseId,
    tool_calls: [
      { tool_name: "case-read", called_at: now, scope_or_bound: "the assigned case" },
      { tool_name: "playbook-read", called_at: now, scope_or_bound: "the approved playbook library" },
      { tool_name: "action-request-draft", called_at: now, scope_or_bound: "drafts only - never submit-for-execution" },
    ],
    claim: plan.summary,
    confidence: plan.source === "playbook" ? 0.62 : 0.3,
    evidence: [
      ...plan.matched_techniques.map((t) => ({ evidence_ref: `technique:${t}`, supports: true, freshness: now })),
      ...plan.escalations.map((e) => ({ evidence_ref: e, supports: false, freshness: now })),
    ],
    escalated: plan.escalations.length > 0,
    escalation_reason: plan.escalations.length > 0 ? "action_class_too_high" : undefined,
    policy_outcome:
      plan.escalations.length > 0
        ? `${plan.escalations.length} step(s) at A3+ routed to the approval queue - the Response Planner cannot submit or execute an action`
        : "plan drafted; no steps require approval",
  };
  addAgentRun(
    {
      agent_run_id: runId,
      tenant_id: ctx.tenantId,
      case_id: caseId,
      subject_type: "case",
      started_at: now,
      completed_at: now,
      message_ids: [message.message_id],
      total_tool_calls: 3,
      elapsed_seconds: 12,
      human_touchpoints: [{ principal_id: ctx.userId, action: "reviewed", at: now, note: "Requested a response plan" }],
      outcome: plan.escalations.length > 0 ? "escalated_pending_human" : "completed",
      analyst_feedback: null,
    },
    [message],
  );
  return { plan, run_id: runId };
}

// ---- action requests + approval queue -------------------------------------

/** compute expiry on read - an approved-but-unexecuted request past its window shows as expired */
function withExpiry(r: ActionRequest): ActionRequest {
  if (r.status === "approved" && r.expires_at && Date.parse(r.expires_at) <= Date.parse(DEMO_NOW_ISO)) {
    return { ...r, status: "expired" };
  }
  return r;
}

function mergedActionRequests(tenantId: string): ActionRequest[] {
  const session = getSession();
  const all = [
    ...getStore().actionRequests.filter((r) => r.tenant_id === tenantId),
    ...session.actionRequests.filter((r) => r.tenant_id === tenantId),
  ];
  return all.map((r) => {
    const o = session.actionRequestOverrides.get(r.action_request_id);
    return withExpiry(o ? ({ ...r, ...o } as ActionRequest) : r);
  });
}

function getMergedActionRequest(tenantId: string, id: string): ActionRequest | undefined {
  return mergedActionRequests(tenantId).find((r) => r.action_request_id === id);
}

export interface RequestActionInput {
  case_id: string;
  playbook_id?: string;
  playbook_step_id?: string;
  action_class: "A0" | "A1" | "A2" | "A3" | "A4";
  action_type: string;
  summary?: string;
  target?: string;
}

export async function requestAction(ctx: SessionContext, input: RequestActionInput): Promise<{ action_request_id: string; status: ActionRequestStatus }> {
  await gate("request-action", 160);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "action.request");
  assertResponsePipelineOpen(ctx.tenantId);
  const theCase = getMergedCase(ctx.tenantId, input.case_id);
  if (!theCase) throw new AccessError("permission_denied", "No such case.");
  if (theCase.status === "closed") throw new AccessError("permission_denied", "The case is closed — no new actions can be requested on it.");

  const now = DEMO_NOW_ISO;
  const id = `areq-u-${(hashString(`${input.case_id}:${input.action_type}:${now}:${getSession().actionRequests.length}`) >>> 0).toString(36)}`;
  const requirement = approvalRequirement(
    { action_class: input.action_class, action_type: input.action_type, status: "draft" } as ActionRequest,
    approvalPolicyFor(ctx.tenantId),
  );

  const autoApproved = !requirement.needs_human_approval;
  const draft: ActionRequest = {
    action_request_id: id,
    tenant_id: ctx.tenantId,
    case_id: input.case_id,
    playbook_id: input.playbook_id,
    playbook_step_id: input.playbook_step_id ?? null,
    action_class: input.action_class,
    action_type: input.action_type,
    summary: input.summary,
    target: input.target,
    requested_by: { principal_id: ctx.userId, principal_type: "human" },
    requested_at: now,
    status: autoApproved ? "approved" : "pending_approval",
    policy_basis: autoApproved ? requirement.policy_basis : null,
    dry_run: true,
    reversible: isReversible(input.action_type),
    ...(autoApproved ? { expires_at: minus(now, { hours: -4 }) } : {}),
  };
  actionRequestSchema.parse(draft);
  addActionRequest(draft);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "action_requested",
    target_type: "action_request",
    target_id: id,
    detail: `${input.action_class} ${input.action_type}${input.target ? ` on ${input.target}` : ""} - ${draft.status}${autoApproved ? ` (${requirement.rationale})` : ""}`,
  });
  return { action_request_id: id, status: draft.status };
}

export async function fetchApprovalQueue(ctx: SessionContext) {
  await gate("approval-queue", 200);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const requests = mergedActionRequests(ctx.tenantId).filter((r) => r.status === "pending_approval");
  const rows = requests.map((r) => {
    const requirement = approvalRequirement(r, approvalPolicyFor(ctx.tenantId));
    const pbAuthor = r.playbook_id ? getMergedPlaybook(ctx.tenantId, r.playbook_id)?.proposed_by : undefined;
    const myCheck = canApprove(r, { principal_id: ctx.userId, permissions: permissionsFor(ctx) }, { underlyingPlaybookAuthor: pbAuthor });
    // a request left pending for a long time — not auto-expired (someone still
    // owes a decision), just surfaced so it doesn't rot in the queue unseen
    const pendingHours = r.requested_at ? secondsBetween(r.requested_at, DEMO_NOW_ISO) / 3600 : 0;
    return {
      request: r,
      requirement,
      can_i_approve: myCheck.ok,
      block_reason: myCheck.ok ? null : myCheck.message,
      stale: pendingHours >= STALE_PENDING_HOURS,
      pending_hours: Math.round(pendingHours),
    };
  });
  const scope = engagedKillSwitchScope(ctx.tenantId);
  return {
    rows,
    can_approve: can(ctx, "action.approve"),
    kill_switch: scope ? { scope, reason: killSwitchGateFor(ctx.tenantId).engaged_reason ?? null } : null,
  };
}

export async function approveAction(ctx: SessionContext, id: string) {
  await gate("approve-action", 160);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "action.approve");
  assertResponsePipelineOpen(ctx.tenantId);
  const r = getMergedActionRequest(ctx.tenantId, id);
  if (!r) throw new AccessError("permission_denied", "No such action request.");
  const pbAuthor = r.playbook_id ? getMergedPlaybook(ctx.tenantId, r.playbook_id)?.proposed_by : undefined;
  const check = canApprove(r, { principal_id: ctx.userId, permissions: permissionsFor(ctx) }, { underlyingPlaybookAuthor: pbAuthor });
  if (!check.ok) throw new AccessError("permission_denied", check.message);

  const now = DEMO_NOW_ISO;
  const patch: Partial<ActionRequest> = {
    status: "approved",
    approved_by: { principal_id: ctx.userId, principal_type: "human" },
    approved_at: now,
    expires_at: minus(now, { hours: -4 }),
  };
  actionRequestSchema.parse({ ...r, ...patch });
  upsertActionRequestOverride(id, patch);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "approval_granted",
    target_type: "action_request",
    target_id: id,
    detail: `${r.action_class} ${r.action_type} approved (expires in 4h if not executed)`,
  });
  return { status: "approved" as const };
}

export async function denyAction(ctx: SessionContext, id: string, reason: string) {
  await gate("deny-action", 140);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "action.approve");
  const r = getMergedActionRequest(ctx.tenantId, id);
  if (!r) throw new AccessError("permission_denied", "No such action request.");
  if (r.requested_by.principal_id === ctx.userId) {
    throw new AccessError("permission_denied", "You cannot decide on an action you requested.");
  }
  if (!reason.trim()) throw new AccessError("permission_denied", "A denial needs a reason.");
  const now = DEMO_NOW_ISO;
  upsertActionRequestOverride(id, { status: "denied", denied_reason: reason.trim() });
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: now,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "approval_denied",
    target_type: "action_request",
    target_id: id,
    detail: `${r.action_class} ${r.action_type} denied - "${reason.trim()}"`,
  });
  return { status: "denied" as const };
}

// ---- deterministic executor ----------------------------------------------

export async function executeActionRequest(ctx: SessionContext, id: string) {
  await gate("execute-action", 300);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const r = getMergedActionRequest(ctx.tenantId, id);
  if (!r) throw new AccessError("permission_denied", "No such action request.");
  const theCase = getMergedCase(ctx.tenantId, r.case_id);
  const now = DEMO_NOW_ISO;

  const outcome = runExecutor(r, {
    killSwitch: killSwitchGateFor(ctx.tenantId),
    caseOpen: !!theCase && theCase.status !== "closed",
    executedBy: ctx.userId,
    nowIso: now,
  });

  if (!outcome.ok) {
    appendAudit({
      tenant_id: ctx.tenantId,
      occurred_at: now,
      actor: { principal_id: "response-executor", principal_type: "system" },
      action: outcome.code === "expired" ? "action_expired" : "action_executed",
      target_type: "action_request",
      target_id: id,
      detail: `Execution refused - ${outcome.message}`,
    });
    if (outcome.code === "expired") upsertActionRequestOverride(id, { status: "expired" });
    throw new AccessError("permission_denied", outcome.message);
  }

  actionRequestSchema.parse({ ...r, ...outcome.patch });
  upsertActionRequestOverride(id, outcome.patch);
  if (!outcome.idempotent_noop) {
    appendAudit({
      tenant_id: ctx.tenantId,
      occurred_at: now,
      actor: { principal_id: "response-executor", principal_type: "system" },
      action: "action_executed",
      target_type: "action_request",
      target_id: id,
      detail: outcome.patch.execution?.result_note ?? "executed (dry-run)",
    });
    appendAudit({
      tenant_id: ctx.tenantId,
      occurred_at: now,
      actor: { principal_id: "response-executor", principal_type: "system" },
      action: "action_verified",
      target_type: "action_request",
      target_id: id,
      detail: outcome.patch.verification?.notes ?? "verified (dry-run)",
    });
  }
  return { status: outcome.patch.status, idempotent_noop: outcome.idempotent_noop };
}

export async function rollbackActionRequest(ctx: SessionContext, id: string) {
  await gate("rollback-action", 200);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "case.work");
  const r = getMergedActionRequest(ctx.tenantId, id);
  if (!r) throw new AccessError("permission_denied", "No such action request.");
  const res = runRollback(r, { rolledBackBy: ctx.userId, nowIso: DEMO_NOW_ISO });
  if (!res.ok) throw new AccessError("permission_denied", res.message);
  actionRequestSchema.parse({ ...r, ...res.patch });
  upsertActionRequestOverride(id, res.patch);
  appendAudit({
    tenant_id: ctx.tenantId,
    occurred_at: DEMO_NOW_ISO,
    actor: { principal_id: ctx.userId, principal_type: "human" },
    action: "action_rolled_back",
    target_type: "action_request",
    target_id: id,
    detail: `${r.action_class} ${r.action_type} rolled back (dry-run)`,
  });
  return { status: "rolled_back" as const };
}

export async function fetchActionLog(ctx: SessionContext) {
  await gate("action-log", 200);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  const done = mergedActionRequests(ctx.tenantId).filter((r) =>
    ["approved", "denied", "expired", "executed", "verified", "rolled_back"].includes(r.status),
  );
  const caseById = new Map(mergedCases(ctx.tenantId).map((c) => [c.case_id, c] as const));
  return done
    .map((r) => ({
      request: r,
      case_title: caseById.get(r.case_id)?.title ?? r.case_id,
      can_rollback:
        can(ctx, "case.work") &&
        (r.status === "executed" || r.status === "verified") &&
        (r.rollback?.reversible ?? r.reversible ?? false),
    }))
    .sort((a, b) => Date.parse(b.request.requested_at ?? "") - Date.parse(a.request.requested_at ?? ""));
}

// ---- Supervisor + QA & Governance (read-side) ----------------------------

export async function fetchCaseOrchestration(ctx: SessionContext, caseId: string) {
  await gate("orchestration", 120);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "soc.view");
  if (!getMergedCase(ctx.tenantId, caseId)) throw new AccessError("permission_denied", "No such case in this tenant.");
  const runs = [...getSession().agentRuns, ...getStore().agentActivity.runs].filter(
    (r) => r.tenant_id === ctx.tenantId && r.case_id === caseId,
  );
  const reqs = mergedActionRequests(ctx.tenantId).filter((r) => r.case_id === caseId);
  const supervisor = summarizeCaseOrchestration(caseId, runs, reqs);

  const store = getStore();
  const qa = runs.map((run) => {
    const msgs = [...getSession().agentMessages, ...store.agentActivity.messages]
      .filter((m) => m.agent_run_id === run.agent_run_id)
      .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    return reviewAgentRun(run, msgs);
  });
  return { supervisor, qa, plan: mergedPlanFor(caseId) };
}

// ---------------------------------------------------------------------------
// M5 — SOC reporting + Reporting Agent
// ---------------------------------------------------------------------------

/** cases that had at least one non-triage agent run (agent-assisted resolution) */
function agentAssistedCaseIds(tenantId: string): Set<string> {
  const runs = [...getSession().agentRuns, ...getStore().agentActivity.runs].filter((r) => r.tenant_id === tenantId);
  const ids = new Set<string>();
  for (const r of runs) {
    if (/^run-(enrich|investigate|advisor|plan|hunt)-/.test(r.agent_run_id)) ids.add(r.case_id);
  }
  return ids;
}

function socReportFor(tenantId: string) {
  const store = getStore();
  const cases = mergedCases(tenantId);
  const nativeAlerts = socAlertsFor(tenantId).filter((a) => a.source.system === "zenc-siem");
  const intakeItems = store.intakeItems.filter((i) => i.tenant_id === tenantId);
  const candidates = store.caseCandidates.filter((c) => c.tenant_id === tenantId);

  // per-stage second samples that need event resolution
  const eventById = new Map(store.normalizedEvents.filter((e) => e.tenant_id === tenantId).map((e) => [e.event_id, e] as const));
  const collection: number[] = [];
  const siemDetection: number[] = [];
  const handoff: number[] = [];
  for (const a of nativeAlerts) {
    const refs = (a.attack_techniques ?? []).flatMap((t) => t.contributing_event_refs);
    const evs = [...new Set(refs)].map((r) => eventById.get(r)).filter(Boolean) as NormalizedEvent[];
    for (const e of evs) collection.push(secondsBetween(e.occurred_at, e.ingested_at));
    if (a.correlated_at && evs.length) {
      const lastIngest = evs.reduce((m, e) => (Date.parse(e.ingested_at) > Date.parse(m) ? e.ingested_at : m), evs[0].ingested_at);
      siemDetection.push(Math.max(0, secondsBetween(lastIngest, a.correlated_at)));
    }
    if (a.correlated_at && a.received_at) handoff.push(Math.max(0, secondsBetween(a.correlated_at, a.received_at)));
  }

  const hasSiem = !!TENANT_MAP[tenantId]?.entitlements.has_siem;
  const coverage = hasSiem
    ? (() => {
        const m = coverageMatrixFor(tenantId);
        return { detection_pct: m.kpis.detection_coverage_pct, response_pct: m.kpis.response_coverage_pct, techniques_in_scope: m.kpis.techniques_in_scope };
      })()
    : null;

  const alertById = new Map(socAlertsFor(tenantId).map((a) => [a.envelope_id, a] as const));
  const receivedAtByCase = new Map<string, string>();
  for (const c of cases) {
    const rec = c.linked_alert_ids
      .map((id) => alertById.get(id)?.received_at)
      .filter((x): x is string => !!x)
      .sort()[0];
    if (rec) receivedAtByCase.set(c.case_id, rec);
  }

  return buildSocReport({
    cases,
    nativeAlerts,
    allSocAlerts: socAlertsFor(tenantId),
    receivedAtByCase,
    candidateCount: candidates.length,
    intakeAcceptedCount: intakeItems.filter((i) => i.disposition === "accepted").length,
    stageSamples: { collection, siem_detection: siemDetection, handoff },
    agentAssistedCaseIds: agentAssistedCaseIds(tenantId),
    coverage,
  });
}

export async function fetchSocReport(ctx: SessionContext) {
  await gate("soc-report", 260);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "reporting.view");
  const report = socReportFor(ctx.tenantId);
  const session = getSession();
  const store = getStore();
  const lastRun = [...session.agentRuns, ...store.agentActivity.runs]
    .filter((r) => r.tenant_id === ctx.tenantId && r.agent_run_id.startsWith("run-report-"))
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  const lastNarrative = lastRun
    ? [...session.agentMessages, ...store.agentActivity.messages].find((m) => m.agent_run_id === lastRun.agent_run_id)?.claim ?? null
    : null;
  return {
    report,
    demoNowIso: store.demoNowIso,
    tenant_name: TENANT_MAP[ctx.tenantId]?.name ?? ctx.tenantId,
    last_draft: lastRun ? { run_id: lastRun.agent_run_id, at: lastRun.started_at, preview: lastNarrative } : null,
  };
}

export type SocReportView = Awaited<ReturnType<typeof fetchSocReport>>;

export async function runReportingAgent(ctx: SessionContext) {
  await gate("reporting-agent", 600);
  assertEntitlement(ctx, "has_soc");
  assertCan(ctx, "reporting.view");
  const report = socReportFor(ctx.tenantId);
  const nameOf = (id: string) => getStore().users.find((u) => u.user_id === id)?.display_name ?? id;
  const narrative = draftReportNarrative(report, nameOf);

  const now = DEMO_NOW_ISO;
  const runId = `run-report-${(hashString(now + getSession().agentRuns.length) >>> 0).toString(36)}`;
  const message: AgentMessage = {
    message_id: `${runId}-m1`,
    agent_run_id: runId,
    agent_name: "reporting-agent",
    tenant_id: ctx.tenantId,
    occurred_at: now,
    prompt_version: "reporting-agent-prompt-v1.0",
    tool_version: "kpi-aggregate-read-tool-v1.0",
    input_ref: `soc-report:${ctx.tenantId}`,
    tool_calls: [
      { tool_name: "kpi-aggregate-read", called_at: now, scope_or_bound: "tenant-scoped aggregates" },
      { tool_name: "case-read", called_at: now, scope_or_bound: "approved case data only" },
    ],
    claim: narrative,
    confidence: 0.7,
    evidence: [{ evidence_ref: `kpi-aggregate:${ctx.tenantId}`, supports: true, freshness: now }],
    policy_outcome: "draft only — the Reporting Agent cannot publish; external-facing copy needs human sign-off",
  };
  addAgentRun(
    {
      agent_run_id: runId,
      tenant_id: ctx.tenantId,
      case_id: `soc-report:${ctx.tenantId}`,
      subject_type: "case",
      started_at: now,
      completed_at: now,
      message_ids: [message.message_id],
      total_tool_calls: 2,
      elapsed_seconds: 8,
      human_touchpoints: [{ principal_id: ctx.userId, action: "reviewed", at: now, note: "Requested a report draft" }],
      outcome: "completed",
      analyst_feedback: null,
    },
    [message],
  );
  return { run_id: runId, narrative };
}
