/**
 * Response Planner Agent logic (L2). Deterministic: given a case, it matches
 * the case's ATT&CK techniques to an approved+enabled playbook and produces a
 * plan with every step's action class labelled up front. It escalates (hands
 * to the approval queue) for any step at A3 or above — it never enables a
 * playbook and never executes anything (references/agentic-architecture.md).
 */
import type { AlertEnvelope, Case } from "@/schemas";
import type { SeededPlaybook } from "@/data/playbooks";
import { hashString } from "@/lib/prng";
import { approvalRequirement, type ApprovalPolicy } from "./action-approval";

export interface PlannedStep {
  step_id: string;
  order: number;
  action_class: string;
  action_type: string;
  description: string;
  target: string | null;
  d3fend: { d3fend_technique_id: string; d3fend_technique_name: string; category: string }[];
  d3fend_unmapped: boolean;
  needs_human_approval: boolean;
  policy_basis: string | null;
  escalation: string | null;
}

export interface ResponsePlan {
  plan_id: string;
  case_id: string;
  source: "playbook" | "no_match";
  playbook_id: string | null;
  playbook_name: string | null;
  steps: PlannedStep[];
  summary: string;
  escalations: string[];
  matched_techniques: string[];
}

function caseTechniques(alerts: AlertEnvelope[]): string[] {
  return [...new Set(alerts.flatMap((a) => (a.attack_techniques ?? []).map((t) => t.technique_id)))];
}

function resolveTarget(actionType: string, alerts: AlertEnvelope[]): string | null {
  const entities = alerts.flatMap((a) => a.entities ?? []);
  const first = (type: string) => entities.find((e) => e.entity_type === type)?.value ?? null;
  if (actionType.includes("host") || actionType.includes("process") || actionType.includes("isolate")) return first("host");
  if (actionType.includes("account") || actionType.includes("session") || actionType.includes("identity")) {
    return first("user") ?? first("email_address");
  }
  if (actionType.includes("ip")) return first("ip");
  if (actionType.includes("domain")) return first("domain") ?? first("email_address");
  if (actionType.includes("message") || actionType.includes("campaign")) return first("email_address") ?? first("domain");
  return null;
}

export function planResponse(
  theCase: Case,
  linkedAlerts: AlertEnvelope[],
  enabledPlaybooks: SeededPlaybook[],
  policy: ApprovalPolicy,
): ResponsePlan {
  const techniques = caseTechniques(linkedAlerts);
  const techSet = new Set(techniques);

  const ranked = enabledPlaybooks
    .map((pb) => ({ pb, overlap: pb.applies_to_techniques.filter((t) => techSet.has(t)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  const plan_id = `plan-${(hashString(`${theCase.case_id}:${techniques.join(",")}`) >>> 0).toString(36)}`;

  if (ranked.length === 0) {
    return {
      plan_id,
      case_id: theCase.case_id,
      source: "no_match",
      playbook_id: null,
      playbook_name: null,
      steps: [],
      summary:
        "No enabled playbook maps to this case's techniques. A responder should build an ad-hoc plan, or the Detection/Response engineering team should author a playbook for this pattern.",
      escalations: [],
      matched_techniques: [],
    };
  }

  const { pb, overlap } = ranked[0];
  const matched = pb.applies_to_techniques.filter((t) => techSet.has(t));

  const steps: PlannedStep[] = pb.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const req = approvalRequirement(
        { action_class: s.action_class, action_type: s.action_type ?? "", status: "draft" } as never,
        policy,
      );
      const escalation =
        s.action_class === "A3"
          ? req.needs_human_approval
            ? "A3 security-control change — routed to the approval queue for independent human sign-off."
            : `A3 auto-eligible under tenant policy — ${req.policy_basis}.`
          : s.action_class === "A4"
            ? "A4 broad/privileged action — always requires an independent human approver, regardless of policy."
            : null;
      return {
        step_id: s.step_id,
        order: s.order,
        action_class: s.action_class,
        action_type: s.action_type ?? "",
        description: s.description,
        target: resolveTarget(s.action_type ?? s.description, linkedAlerts),
        d3fend: s.d3fend_mapping ?? [],
        d3fend_unmapped: !!s.d3fend_unmapped,
        needs_human_approval: req.needs_human_approval,
        policy_basis: req.policy_basis,
        escalation,
      };
    });

  const escalations = steps.filter((s) => s.escalation).map((s) => `Step ${s.order} (${s.action_type}): ${s.escalation}`);

  return {
    plan_id,
    case_id: theCase.case_id,
    source: "playbook",
    playbook_id: pb.playbook_id,
    playbook_name: pb.name,
    steps,
    summary: `Matched "${pb.name}" on ${overlap} technique(s) (${matched.join(", ")}). ${steps.length} step(s); ${escalations.length} require approval.`,
    escalations,
    matched_techniques: matched,
  };
}
