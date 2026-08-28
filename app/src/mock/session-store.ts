/**
 * In-memory session overlay for state that CHANGES during a demo — rule
 * lifecycle transitions, agent-proposed rules, agent runs, analyst feedback.
 * The seed (`store.ts`) stays immutable; this layer sits on top and resets
 * when the module reloads (a page reload, or `resetSession()`), which is the
 * demo's "reset" behaviour.
 */
import type { AgentMessage, AgentRun, AuditEvent, RegressionTestResult, RuleLifecycleState } from "@/schemas";
import type { SeededRule } from "@/data/correlation-rules";

export interface RuleOverride {
  lifecycle_state?: RuleLifecycleState;
  enabled_by?: string;
  version?: string;
  history?: NonNullable<SeededRule["history"]>;
  regression_test_results?: RegressionTestResult[];
  disabled_reason?: string;
}

interface SessionState {
  ruleOverrides: Map<string, RuleOverride>;
  proposedRules: SeededRule[];
  agentRuns: AgentRun[];
  agentMessages: AgentMessage[];
  audit: AuditEvent[];
}

let _state: SessionState = fresh();
let _auditSeq = 0;

function fresh(): SessionState {
  return { ruleOverrides: new Map(), proposedRules: [], agentRuns: [], agentMessages: [], audit: [] };
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
