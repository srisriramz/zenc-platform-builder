/**
 * The single enforcement point for correlation-rule lifecycle transitions.
 * The API calls this; the UI only *reflects* what it allows. This is where
 * SKILL.md #3 (a rule reaches `enabled` only via a human, always) and the
 * no-self-approval / segregation-of-duties rules live — not in a disabled
 * button.
 */
import type { RuleLifecycleState } from "@/schemas";
import type { Permission } from "@/data/platform";

export const LIFECYCLE_ORDER: RuleLifecycleState[] = [
  "draft",
  "test",
  "peer_review",
  "approved",
  "enabled",
  "disabled",
  "retired",
];

/** valid next-states from each state */
const ALLOWED_NEXT: Record<RuleLifecycleState, RuleLifecycleState[]> = {
  draft: ["test"],
  test: ["draft", "peer_review"],
  peer_review: ["draft", "approved"],
  approved: ["draft", "enabled"],
  enabled: ["disabled"],
  disabled: ["enabled", "retired"],
  retired: [],
};

/** transitions an agent principal may ever perform — it can propose and test, nothing more */
const AGENT_ALLOWED: [RuleLifecycleState, RuleLifecycleState][] = [
  ["draft", "test"],
  ["test", "draft"],
  ["test", "peer_review"],
];

export interface TransitionActor {
  principal_id: string;
  principal_type: "human" | "agent";
  permissions: Permission[];
}

export interface RuleForTransition {
  lifecycle_state: RuleLifecycleState;
  proposed_by?: string;
  history?: { from_state: string; to_state: string; changed_by: string }[];
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function approverOf(rule: RuleForTransition): string | undefined {
  return rule.history?.find((h) => h.to_state === "approved")?.changed_by;
}

export function validateTransition(
  rule: RuleForTransition,
  to: RuleLifecycleState,
  actor: TransitionActor,
): TransitionResult {
  const from = rule.lifecycle_state;

  if (!ALLOWED_NEXT[from].includes(to)) {
    return { ok: false, code: "invalid_transition", message: `A rule cannot move from ${from} to ${to}.` };
  }

  if (actor.principal_type === "agent") {
    const allowed = AGENT_ALLOWED.some(([f, t]) => f === from && t === to);
    if (!allowed) {
      return {
        ok: false,
        code: "agent_forbidden_transition",
        message:
          "An agent may only draft, test, and submit a rule for review. Advancing past peer review — and enabling a rule — is a human action, always (SKILL.md #3).",
      };
    }
    return { ok: true };
  }

  // human transitions — permission + segregation of duties
  switch (to) {
    case "test":
    case "draft":
      if (!actor.permissions.includes("rule.propose") && !actor.permissions.includes("rule.review")) {
        return { ok: false, code: "permission_denied", message: "Authoring a rule needs rule.propose." };
      }
      return { ok: true };

    case "peer_review":
      if (!actor.permissions.includes("rule.propose") && !actor.permissions.includes("rule.review")) {
        return { ok: false, code: "permission_denied", message: "Submitting for review needs rule.propose." };
      }
      return { ok: true };

    case "approved":
      if (!actor.permissions.includes("rule.review")) {
        return { ok: false, code: "permission_denied", message: "Peer review needs rule.review." };
      }
      if (rule.proposed_by && rule.proposed_by === actor.principal_id) {
        return { ok: false, code: "self_review", message: "The person who proposed a rule cannot be its peer reviewer." };
      }
      return { ok: true };

    case "enabled": {
      if (!actor.permissions.includes("rule.enable")) {
        return { ok: false, code: "permission_denied", message: "Enabling a rule needs rule.enable." };
      }
      if (rule.proposed_by && rule.proposed_by === actor.principal_id) {
        return { ok: false, code: "self_approval", message: "The proposer of a rule cannot be the one who enables it." };
      }
      const approver = approverOf(rule);
      if (approver && approver === actor.principal_id) {
        return {
          ok: false,
          code: "no_segregation",
          message: "The peer reviewer who approved a rule should not also be the one who enables it (segregation of duties).",
        };
      }
      return { ok: true };
    }

    case "disabled":
    case "retired":
      if (!actor.permissions.includes("rule.enable") && !actor.permissions.includes("rule.review")) {
        return { ok: false, code: "permission_denied", message: "Disabling or retiring a rule needs rule.enable." };
      }
      return { ok: true };

    default:
      return { ok: false, code: "invalid_transition", message: `Unhandled transition to ${to}.` };
  }
}
