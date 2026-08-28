/**
 * The single enforcement point for action-request approval. The `/approvals`
 * UI only reflects what these functions return.
 *
 * Non-negotiables (SKILL.md, agentic-architecture.md):
 *  - the requester can NEVER be the approver (no self-approval) — checked
 *    here AND in the schema `.refine`, never only a disabled button
 *  - A4 ALWAYS requires an independent human approver, regardless of any
 *    tenant policy
 *  - A3 skips approval ONLY if a precise tenant policy pre-authorizes that
 *    exact action_type (L3); otherwise it needs approval
 *  - approval is scoped to that one request instance — never blanket
 */
import type { ActionRequest } from "@/schemas";
import type { Permission } from "@/data/platform";

export interface ApprovalActor {
  principal_id: string;
  permissions: Permission[];
}

export interface ApprovalPolicy {
  default_autonomy_level: "L1" | "L2" | "L3" | "L4";
  /** classes this tenant pre-authorizes without per-request approval (A2 granularity is fine; A3 is not) */
  pre_authorized_action_classes: string[];
  /** the exact A3 action types this tenant has explicitly pre-authorized for L3 auto-execution */
  l3_preauthorized_action_types: string[];
}

export type ApprovalCheck = { ok: true } | { ok: false; code: string; message: string };

/** Does this request need a human approval decision, or can it proceed under policy? */
export interface ApprovalRequirement {
  needs_human_approval: boolean;
  /** set when an A3 is auto-eligible under policy (no human approver) */
  policy_basis: string | null;
  rationale: string;
}

export function approvalRequirement(request: ActionRequest, policy: ApprovalPolicy): ApprovalRequirement {
  switch (request.action_class) {
    case "A0":
    case "A1":
      return { needs_human_approval: false, policy_basis: null, rationale: "A0/A1 is reasoning or read-only — no approval needed." };

    case "A2":
      if (policy.pre_authorized_action_classes.includes("A2")) {
        return { needs_human_approval: false, policy_basis: `tenant policy pre-authorizes A2 (reversible internal change)`, rationale: "A2 pre-authorized at the class level by tenant policy." };
      }
      return { needs_human_approval: true, policy_basis: null, rationale: "A2 needs approval at the default L2 autonomy." };

    case "A3":
      if (policy.l3_preauthorized_action_types.includes(request.action_type)) {
        return {
          needs_human_approval: false,
          policy_basis: `tenant policy: L3 pre-authorization for action_type "${request.action_type}"`,
          rationale: "A3 auto-eligible — the tenant has explicitly pre-authorized this exact action type.",
        };
      }
      return { needs_human_approval: true, policy_basis: null, rationale: "A3 security-control change — needs approval unless a precise policy pre-authorizes this exact action type." };

    case "A4":
      return { needs_human_approval: true, policy_basis: null, rationale: "A4 always requires an independent human approver, regardless of tenant policy." };
  }
}

/** Can `actor` approve `request` right now? */
export function canApprove(
  request: ActionRequest,
  actor: ApprovalActor,
  opts: { underlyingPlaybookAuthor?: string } = {},
): ApprovalCheck {
  if (!actor.permissions.includes("action.approve")) {
    return { ok: false, code: "permission_denied", message: "Approving an action needs action.approve." };
  }
  if (request.status !== "pending_approval") {
    return { ok: false, code: "not_pending", message: `This request is ${request.status}, not pending approval.` };
  }
  if (request.requested_by.principal_id === actor.principal_id) {
    return { ok: false, code: "self_approval", message: "The requester of an action can never be its approver (no self-approval)." };
  }
  // A4 segregation of duties: the approver should not be the author of the playbook that produced the request
  if (request.action_class === "A4" && opts.underlyingPlaybookAuthor && opts.underlyingPlaybookAuthor === actor.principal_id) {
    return {
      ok: false,
      code: "no_segregation",
      message: "For an A4 action, the approver must not be the author of the playbook that produced it (segregation of duties).",
    };
  }
  return { ok: true };
}

/** Is this approved request still executable? (expiry is the caller's concern to compute) */
export function isExecutable(request: ActionRequest, nowIso: string): ApprovalCheck {
  if (request.status !== "approved") {
    return { ok: false, code: "not_approved", message: `Only an approved request can execute (this is ${request.status}).` };
  }
  if (request.expires_at && Date.parse(request.expires_at) <= Date.parse(nowIso)) {
    return { ok: false, code: "expired", message: "This approval expired before the action was executed. Re-request it." };
  }
  return { ok: true };
}
