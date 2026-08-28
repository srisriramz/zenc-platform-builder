/**
 * In-memory session overlay for state that CHANGES during a demo — rule
 * lifecycle transitions, agent-proposed rules, agent runs, analyst feedback.
 * The seed (`store.ts`) stays immutable; this layer sits on top and resets
 * when the module reloads (a page reload, or `resetSession()`), which is the
 * demo's "reset" behaviour.
 */
import type { AgentMessage, AgentRun, AuditEvent, Case, CaseStatus, RegressionTestResult, RuleLifecycleState } from "@/schemas";
import type { SeededRule } from "@/data/correlation-rules";

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

/** a human's confirm-open / suppress decision on a pending intake candidate */
export interface IntakeDecision {
  candidate_id: string;
  decision: "opened" | "suppressed";
  by: string;
  at: string;
  reason?: string;
  case_id?: string;
}

interface SessionState {
  ruleOverrides: Map<string, RuleOverride>;
  proposedRules: SeededRule[];
  agentRuns: AgentRun[];
  agentMessages: AgentMessage[];
  audit: AuditEvent[];
  /** cases created during the demo by confirming an intake candidate */
  openedCases: Case[];
  /** mutations to seeded or opened cases (status, owner, closure) */
  caseOverrides: Map<string, CaseOverride>;
  /** decisions on pending intake candidates, keyed by candidate_id */
  intakeDecisions: Map<string, IntakeDecision>;
}

let _state: SessionState = fresh();
let _auditSeq = 0;

function fresh(): SessionState {
  return {
    ruleOverrides: new Map(),
    proposedRules: [],
    agentRuns: [],
    agentMessages: [],
    audit: [],
    openedCases: [],
    caseOverrides: new Map(),
    intakeDecisions: new Map(),
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

export function addAgentRun(run: AgentRun, messages: AgentMessage[]): void {
  _state.agentRuns.unshift(run);
  _state.agentMessages.push(...messages);
}

export function updateAgentRun(runId: string, patch: Partial<AgentRun>): void {
  const i = _state.agentRuns.findIndex((r) => r.agent_run_id === runId);
  if (i >= 0) _state.agentRuns[i] = { ..._state.agentRuns[i], ...patch };
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
