import type { ActionRequest, AgentMessage, AgentRun, AlertEnvelope, Case } from "@/schemas";
import { minus } from "@/lib/time";
import { hashString } from "@/lib/prng";
import { TENANT_MAP } from "@/data/platform";
import type { SeededPlaybook } from "@/data/playbooks";
import { planResponse, type ResponsePlan } from "@/lib/soc/response-planner";
import { isReversible } from "@/lib/soc/executor";

/**
 * Seeded response layer — for the investigating cases, the Response Planner
 * has already run and (on one case) a human has requested + approved +
 * executed an action in dry-run. This gives `/approvals` and `/actions`
 * something to show on load.
 */
export interface ResponseLayer {
  plans: Record<string, ResponsePlan>;
  actionRequests: ActionRequest[];
  runs: AgentRun[];
  messages: AgentMessage[];
}

const APPROVER = "user-dana-approver";

function planRun(theCase: Case, plan: ResponsePlan, at: string): { run: AgentRun; message: AgentMessage } {
  const runId = `run-plan-${theCase.case_id}`;
  const message: AgentMessage = {
    message_id: `${runId}-m1`,
    agent_run_id: runId,
    agent_name: "response-planner-agent",
    tenant_id: theCase.tenant_id,
    occurred_at: at,
    prompt_version: "response-planner-agent-prompt-v1.0",
    tool_version: "playbook-read-tool-v1.0",
    rule_or_playbook_version: plan.playbook_id ?? undefined,
    input_ref: theCase.case_id,
    tool_calls: [
      { tool_name: "case-read", called_at: at, scope_or_bound: "the assigned case" },
      { tool_name: "playbook-read", called_at: at, scope_or_bound: "the approved playbook library" },
      { tool_name: "action-request-draft", called_at: at, scope_or_bound: "drafts only — never submit-for-execution" },
    ],
    claim: plan.summary,
    confidence: plan.source === "playbook" ? 0.62 : 0.3,
    evidence: [
      ...plan.matched_techniques.map((t) => ({ evidence_ref: `technique:${t}`, supports: true, freshness: at })),
      ...plan.escalations.map((e) => ({ evidence_ref: e, supports: false, freshness: at })),
    ],
    escalated: plan.escalations.length > 0,
    escalation_reason: plan.escalations.length > 0 ? "action_class_too_high" : undefined,
    policy_outcome:
      plan.escalations.length > 0
        ? `${plan.escalations.length} step(s) at A3+ routed to the approval queue — the Response Planner cannot submit or execute an action`
        : "plan drafted; no steps require approval",
  };
  const run: AgentRun = {
    agent_run_id: runId,
    tenant_id: theCase.tenant_id,
    case_id: theCase.case_id,
    subject_type: "case",
    started_at: at,
    completed_at: at,
    message_ids: [message.message_id],
    total_tool_calls: 3,
    elapsed_seconds: 11,
    human_touchpoints: [],
    outcome: plan.escalations.length > 0 ? "escalated_pending_human" : "completed",
    analyst_feedback: null,
  };
  return { run, message };
}

function actionId(caseId: string, stepId: string): string {
  return `areq-${(hashString(`${caseId}:${stepId}`) >>> 0).toString(36)}`;
}

export function buildResponseLayer(
  seededCases: Case[],
  socAlerts: AlertEnvelope[],
  playbooks: SeededPlaybook[],
): ResponseLayer {
  const plans: Record<string, ResponsePlan> = {};
  const actionRequests: ActionRequest[] = [];
  const runs: AgentRun[] = [];
  const messages: AgentMessage[] = [];

  for (const theCase of seededCases) {
    if (theCase.status !== "investigating") continue;
    const policy = TENANT_MAP[theCase.tenant_id]?.policy;
    if (!policy) continue;
    const linked = socAlerts.filter((a) => theCase.linked_alert_ids.includes(a.envelope_id));
    const enabled = playbooks.filter((p) => p.tenant_id === theCase.tenant_id && p.lifecycle_state === "enabled");
    const plan = planResponse(theCase, linked, enabled, policy);
    plans[theCase.case_id] = plan;

    const at = minus(theCase.triaged_at ?? theCase.created_at, { minutes: -22 });
    const { run, message } = planRun(theCase, plan, at);
    runs.push(run);
    messages.push(message);
    theCase.agent_run_ids = [...(theCase.agent_run_ids ?? []), run.agent_run_id];

    // seed one action request from the first A3 step of the plan
    const firstA3 = plan.steps.find((s) => s.action_class === "A3");
    if (!firstA3) continue;

    // is this the ransomware case? make it a fully executed dry-run; otherwise leave it pending
    const isRansomware = (theCase.title ?? "").toLowerCase().includes("ransomware");
    const reqAt = minus(at, { minutes: -5 });
    const base: ActionRequest = {
      action_request_id: actionId(theCase.case_id, firstA3.step_id),
      tenant_id: theCase.tenant_id,
      case_id: theCase.case_id,
      playbook_id: plan.playbook_id ?? undefined,
      playbook_step_id: firstA3.step_id,
      action_class: "A3",
      action_type: firstA3.action_type,
      summary: firstA3.description,
      target: firstA3.target ?? undefined,
      requested_by: { principal_id: theCase.owner_id, principal_type: "human" },
      requested_at: reqAt,
      status: "pending_approval",
      dry_run: true,
      reversible: isReversible(firstA3.action_type),
    };

    if (isRansomware) {
      const apprAt = minus(reqAt, { minutes: -8 });
      const execAt = minus(apprAt, { minutes: -4 });
      actionRequests.push({
        ...base,
        status: "verified",
        approved_by: { principal_id: APPROVER, principal_type: "human" },
        approved_at: apprAt,
        expires_at: minus(apprAt, { hours: -4 }),
        execution: {
          executed_at: execAt,
          executed_by: theCase.owner_id,
          precondition_recheck_passed: true,
          idempotent_noop: false,
          result_note: `DRY RUN — ${base.action_type}${base.target ? ` on ${base.target}` : ""} simulated. No real change was made.`,
        },
        verification: { verified_at: execAt, outcome_confirmed: true, notes: "DRY RUN — simulated post-state is consistent with the requested action." },
        rollback: { reversible: base.reversible ?? true },
      });
    } else {
      actionRequests.push(base);
    }
  }

  return { plans, actionRequests, runs, messages };
}
