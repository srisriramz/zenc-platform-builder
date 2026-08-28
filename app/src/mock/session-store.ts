/**
 * In-memory session overlay for state that CHANGES during a demo — rule
 * lifecycle transitions, agent-proposed rules, agent runs, analyst feedback.
 * The seed (`store.ts`) stays immutable; this layer sits on top and resets
 * when the module reloads (a page reload, or `resetSession()`), which is the
 * demo's "reset" behaviour.
 */
import type {
  ActionRequest,
  AgentMessage,
  AgentRun,
  AuditEvent,
  Case,
  CaseStatus,
  Evidence,
  EvidenceReviewState,
  PlaybookLifecycleState,
  RegressionTestResult,
  RuleLifecycleState,
  Task,
  TaskStatus,
} from "@/schemas";
import { agentMessageSchema, agentRunSchema } from "@/schemas";
import type { SeededRule } from "@/data/correlation-rules";
import type { SeededPlaybook } from "@/data/playbooks";
import type { ResponsePlan } from "@/lib/soc/response-planner";
import type { Tenant, TenantPolicy, User } from "@/data/platform";
import type { ConnectorRuntime } from "./store";

export interface RuleOverride {
  lifecycle_state?: RuleLifecycleState;
  enabled_by?: string;
  version?: string;
  history?: NonNullable<SeededRule["history"]>;
  regression_test_results?: RegressionTestResult[];
  disabled_reason?: string;
}

export interface CaseOverride {
  status?: CaseStatus;
  owner_id?: string;
  triaged_at?: string;
  closed_at?: string;
  closure?: Case["closure"];
  agent_run_ids?: string[];
}

export interface EvidenceReview {
  review_state?: EvidenceReviewState;
  reviewer_id?: string;
  reviewer_comment?: string;
  reviewed_at?: string;
}

export interface TaskOverride {
  status?: TaskStatus;
  assignee_id?: string;
  completed_at?: string;
  completed_by?: string;
}

/** a human's confirm-open / suppress decision on a pending intake candidate */
export interface IntakeDecision {
  candidate_id: string;
  decision: "opened" | "suppressed";
  by: string;
  at: string;
  reason?: string;
  case_id?: string;
}

export interface PlaybookOverride {
  lifecycle_state?: PlaybookLifecycleState;
  enabled_by?: string;
  version?: string;
  history?: SeededPlaybook["history"];
}

export interface KillSwitchOverride {
  engaged: boolean;
  engaged_reason?: string;
}

interface SessionState {
  ruleOverrides: Map<string, RuleOverride>;
  proposedRules: SeededRule[];
  agentRuns: AgentRun[];
  agentMessages: AgentMessage[];
  /** patches to seeded agent runs (e.g. analyst feedback), keyed by agent_run_id */
  agentRunOverrides: Map<string, Partial<AgentRun>>;
  audit: AuditEvent[];
  /** playbook lifecycle transitions during the demo */
  playbookOverrides: Map<string, PlaybookOverride>;
  proposedPlaybooks: SeededPlaybook[];
  /** response plans produced by the Response Planner, keyed by case_id */
  responsePlans: Map<string, ResponsePlan>;
  /** action requests created during the demo */
  actionRequests: ActionRequest[];
  /** mutations to seeded or created action requests, keyed by action_request_id */
  actionRequestOverrides: Map<string, Partial<ActionRequest>>;
  /** kill-switch state overlay: "global" | `partner:<id>` | `tenant:<id>` */
  killSwitchOverrides: Map<string, KillSwitchOverride>;
  /** per-tenant policy field edits (autonomy level, pre-authorized action classes), keyed by tenant_id */
  tenantPolicyOverrides: Map<string, Partial<TenantPolicy>>;
  /** cases created during the demo by confirming an intake candidate */
  openedCases: Case[];
  /** mutations to seeded or opened cases (status, owner, closure) */
  caseOverrides: Map<string, CaseOverride>;
  /** decisions on pending intake candidates, keyed by candidate_id */
  intakeDecisions: Map<string, IntakeDecision>;
  /** evidence items added during the demo (agent findings, analyst uploads) */
  addedEvidence: Evidence[];
  /** review decisions on seeded or added evidence, keyed by evidence_id */
  evidenceReviews: Map<string, EvidenceReview>;
  /** tasks added during the demo */
  addedTasks: Task[];
  /** mutations to seeded or added tasks, keyed by task_id */
  taskOverrides: Map<string, TaskOverride>;
  /** tenants/users/telemetry sources created via the onboarding wizard this session */
  addedTenants: Tenant[];
  addedUsers: User[];
  addedTelemetrySources: ConnectorRuntime[];
}

let _state: SessionState = fresh();
let _auditSeq = 0;

function fresh(): SessionState {
  return {
    ruleOverrides: new Map(),
    proposedRules: [],
    agentRuns: [],
    agentMessages: [],
    agentRunOverrides: new Map(),
    audit: [],
    openedCases: [],
    caseOverrides: new Map(),
    intakeDecisions: new Map(),
    addedEvidence: [],
    evidenceReviews: new Map(),
    addedTasks: [],
    taskOverrides: new Map(),
    playbookOverrides: new Map(),
    proposedPlaybooks: [],
    responsePlans: new Map(),
    actionRequests: [],
    actionRequestOverrides: new Map(),
    killSwitchOverrides: new Map(),
    tenantPolicyOverrides: new Map(),
    addedTenants: [],
    addedUsers: [],
    addedTelemetrySources: [],
  };
}

export function appendAudit(entry: Omit<AuditEvent, "audit_id">): void {
  _auditSeq++;
  _state.audit.unshift({ ...entry, audit_id: `aud-sess-${String(_auditSeq).padStart(4, "0")}` });
}

export function getSession(): SessionState {
  return _state;
}

export function resetSession(): void {
  _state = fresh();
}

export function upsertRuleOverride(ruleId: string, patch: RuleOverride): void {
  const prev = _state.ruleOverrides.get(ruleId) ?? {};
  _state.ruleOverrides.set(ruleId, { ...prev, ...patch });
}

export function addProposedRule(rule: SeededRule): void {
  _state.proposedRules.push(rule);
}

export function updateProposedRule(ruleId: string, patch: Partial<SeededRule>): void {
  const i = _state.proposedRules.findIndex((r) => r.rule_id === ruleId);
  if (i >= 0) _state.proposedRules[i] = { ...(_state.proposedRules[i] as SeededRule), ...patch } as SeededRule;
}

/**
 * Every agent output is validated against its contract before it is stored —
 * a malformed agent message or run is rejected here, never silently coerced
 * (schemas/agent.ts, review-agent-safety.md "Explainability"). This is the
 * single enforcement point for runtime-produced agent activity.
 */
export function addAgentRun(run: AgentRun, messages: AgentMessage[]): void {
  const validRun = agentRunSchema.parse(run);
  const validMessages = messages.map((m) => agentMessageSchema.parse(m));
  _state.agentRuns.unshift(validRun);
  _state.agentMessages.push(...validMessages);
}

/**
 * Apply a patch to an agent run wherever it lives: session runs are mutated
 * in place; a seeded run (in the immutable store) gets an override entry that
 * the read layer merges. Analyst feedback on a seeded run is no longer lost.
 */
export function updateAgentRun(runId: string, patch: Partial<AgentRun>): void {
  const i = _state.agentRuns.findIndex((r) => r.agent_run_id === runId);
  if (i >= 0) {
    _state.agentRuns[i] = { ..._state.agentRuns[i], ...patch };
    return;
  }
  const prev = _state.agentRunOverrides.get(runId) ?? {};
  _state.agentRunOverrides.set(runId, { ...prev, ...patch });
}

export function agentRunOverride(runId: string): Partial<AgentRun> | undefined {
  return _state.agentRunOverrides.get(runId);
}

// ---- SOAR: intake decisions + case mutations ----------------------------

export function recordIntakeDecision(decision: IntakeDecision): void {
  _state.intakeDecisions.set(decision.candidate_id, decision);
}

export function addOpenedCase(c: Case): void {
  _state.openedCases.push(c);
}

export function upsertCaseOverride(caseId: string, patch: CaseOverride): void {
  const prev = _state.caseOverrides.get(caseId) ?? {};
  _state.caseOverrides.set(caseId, { ...prev, ...patch });
}

// ---- SOAR: evidence + tasks --------------------------------------------

export function addEvidence(e: Evidence): void {
  _state.addedEvidence.push(e);
}

export function upsertEvidenceReview(evidenceId: string, patch: EvidenceReview): void {
  const prev = _state.evidenceReviews.get(evidenceId) ?? {};
  _state.evidenceReviews.set(evidenceId, { ...prev, ...patch });
}

export function addTask(t: Task): void {
  _state.addedTasks.push(t);
}

export function upsertTaskOverride(taskId: string, patch: TaskOverride): void {
  const prev = _state.taskOverrides.get(taskId) ?? {};
  _state.taskOverrides.set(taskId, { ...prev, ...patch });
}

// ---- M4c: playbooks, response plans, action requests, kill switches ----

export function upsertPlaybookOverride(playbookId: string, patch: PlaybookOverride): void {
  const prev = _state.playbookOverrides.get(playbookId) ?? {};
  _state.playbookOverrides.set(playbookId, { ...prev, ...patch });
}

export function addProposedPlaybook(pb: SeededPlaybook): void {
  _state.proposedPlaybooks.push(pb);
}

export function setResponsePlan(caseId: string, plan: ResponsePlan): void {
  _state.responsePlans.set(caseId, plan);
}

export function addActionRequest(req: ActionRequest): void {
  _state.actionRequests.push(req);
}

export function upsertActionRequestOverride(id: string, patch: Partial<ActionRequest>): void {
  const prev = _state.actionRequestOverrides.get(id) ?? {};
  _state.actionRequestOverrides.set(id, { ...prev, ...patch });
}

export function setKillSwitchOverride(key: string, patch: KillSwitchOverride): void {
  _state.killSwitchOverrides.set(key, patch);
}

export function upsertTenantPolicyOverride(tenantId: string, patch: Partial<TenantPolicy>): void {
  const prev = _state.tenantPolicyOverrides.get(tenantId) ?? {};
  _state.tenantPolicyOverrides.set(tenantId, { ...prev, ...patch });
}

// ---- Onboarding wizard: tenants, users, telemetry sources ---------------

export function addTenant(t: Tenant): void {
  _state.addedTenants.push(t);
}

export function addUser(u: User): void {
  _state.addedUsers.push(u);
}

export function addTelemetrySourceToSession(s: ConnectorRuntime): void {
  _state.addedTelemetrySources.push(s);
}
