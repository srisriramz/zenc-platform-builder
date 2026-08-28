/**
 * Supervisor (L1, orchestration only). Routes work between agents and
 * enforces autonomy / action-class policy. It never holds standing
 * credentials, never overrides a policy decision, never approves any action,
 * and never bypasses human approval for A3/A4 (references/agentic-architecture.md
 * — "Supervisor constraints").
 *
 * This function produces the read-only routing + invariant summary shown on a
 * case: which agents ran, and a check that no forbidden thing happened.
 */
import type { ActionRequest, AgentRun } from "@/schemas";
import { AGENT_MAP } from "@/data/agents";

export interface SupervisorSummary {
  case_id: string;
  routed: { agent: string; agent_label: string; run_id: string; outcome: string }[];
  policy_notes: string[];
  invariants_ok: boolean;
  violations: string[];
}

const AGENT_FROM_RUN_ID: Record<string, string> = {
  triage: "triage-agent",
  enrich: "enrichment-agent",
  investigate: "investigation-agent",
  advisor: "digital-advisor-agent",
  hunt: "hunt-agent",
  plan: "response-planner-agent",
};

function agentOf(run: AgentRun): string {
  const key = run.agent_run_id.match(/^run-([a-z]+)-/)?.[1] ?? "";
  return AGENT_FROM_RUN_ID[key] ?? "supervisor";
}

export function summarizeCaseOrchestration(
  caseId: string,
  runs: AgentRun[],
  actionRequests: ActionRequest[],
): SupervisorSummary {
  const routed = runs
    .slice()
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map((r) => {
      const agent = agentOf(r);
      return { agent, agent_label: AGENT_MAP[agent]?.label ?? agent, run_id: r.agent_run_id, outcome: r.outcome };
    });

  const violations: string[] = [];

  // no agent principal is ever the approver of an action request
  for (const ar of actionRequests) {
    if (ar.approved_by && AGENT_MAP[ar.approved_by.principal_id]) {
      violations.push(`action ${ar.action_request_id} was approved by an agent principal (${ar.approved_by.principal_id})`);
    }
    if (ar.approved_by && ar.approved_by.principal_id === ar.requested_by.principal_id) {
      violations.push(`action ${ar.action_request_id} has the same requester and approver (self-approval)`);
    }
    if (ar.action_class === "A4" && ["approved", "executed", "verified"].includes(ar.status) && !ar.approved_by) {
      violations.push(`A4 action ${ar.action_request_id} advanced without a human approver`);
    }
    if (
      ar.action_class === "A3" &&
      ar.status === "approved" &&
      !ar.approved_by &&
      !ar.policy_basis
    ) {
      violations.push(`A3 action ${ar.action_request_id} was approved with neither a human approver nor a policy_basis`);
    }
  }

  const policy_notes: string[] = [];
  const escalated = runs.filter((r) => r.outcome === "escalated_pending_human");
  if (escalated.length) policy_notes.push(`${escalated.length} agent run(s) escalated to a human — the Supervisor routed them to the queue rather than proceeding.`);
  const a3plus = actionRequests.filter((a) => a.action_class === "A3" || a.action_class === "A4");
  if (a3plus.length) policy_notes.push(`${a3plus.length} action request(s) at A3+ — each requires human approval before the deterministic executor will run it.`);
  if (actionRequests.length === 0) policy_notes.push("No response actions requested yet on this case.");

  return {
    case_id: caseId,
    routed,
    policy_notes,
    invariants_ok: violations.length === 0,
    violations,
  };
}
