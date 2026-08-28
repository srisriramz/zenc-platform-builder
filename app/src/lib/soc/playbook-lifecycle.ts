/**
 * The single enforcement point for playbook lifecycle transitions — the
 * response-side mirror of `lib/detection/lifecycle.ts`. The API calls this;
 * the UI only reflects what it returns.
 *
 * Same guarantee as detection rules (soc-spec.md): the Response Planner
 * agent may draft, test, and submit for review — it can NEVER move a
 * playbook to `enabled`. Enabling is a human action, always, and the
 * proposer / reviewer / enabler must be three principals where knowable
 * (segregation of duties).
 */
import type { PlaybookLifecycleState } from "@/schemas";
import type { Permission } from "@/data/platform";

export const PLAYBOOK_ORDER: PlaybookLifecycleState[] = [
  "draft",
  "test",
  "peer_review",
  "approved",
  "enabled",
  "disabled",
  "retired",
];

const ALLOWED_NEXT: Record<PlaybookLifecycleState, PlaybookLifecycleState[]> = {
  draft: ["test"],
  test: ["draft", "peer_review"],
  peer_review: ["draft", "approved"],
  approved: ["draft", "enabled"],
  enabled: ["disabled"],
  disabled: ["enabled", "retired"],
  retired: [],
};

const AGENT_ALLOWED: [PlaybookLifecycleState, PlaybookLifecycleState][] = [
  ["draft", "test"],
  ["test", "draft"],
  ["test", "peer_review"],
];

export interface PlaybookTransitionActor {
  principal_id: string;
  principal_type: "human" | "agent";
  permissions: Permission[];
}

export interface PlaybookForTransition {
  lifecycle_state: PlaybookLifecycleState;
  proposed_by?: string;
  history?: { from_state: string; to_state: string; changed_by: string }[];
}

export type PlaybookTransitionResult = { ok: true } | { ok: false; code: string; message: string };

function approverOf(pb: PlaybookForTransition): string | undefined {
  return pb.history?.find((h) => h.to_state === "approved")?.changed_by;
}

export function validatePlaybookTransition(
  pb: PlaybookForTransition,
  to: PlaybookLifecycleState,
  actor: PlaybookTransitionActor,
): PlaybookTransitionResult {
  const from = pb.lifecycle_state;

  if (!ALLOWED_NEXT[from].includes(to)) {
    return { ok: false, code: "invalid_transition", message: `A playbook cannot move from ${from} to ${to}.` };
  }

  if (actor.principal_type === "agent") {
    const allowed = AGENT_ALLOWED.some(([f, t]) => f === from && t === to);
    if (!allowed) {
      return {
        ok: false,
        code: "agent_forbidden_transition",
        message:
          "The Response Planner may only draft, test, and submit a playbook for review. Advancing past peer review — and enabling a playbook — is a human action, always.",
      };
    }
    return { ok: true };
  }

  switch (to) {
    case "draft":
    case "test":
    case "peer_review":
      if (!actor.permissions.includes("action.request") && !actor.permissions.includes("action.approve")) {
        return { ok: false, code: "permission_denied", message: "Authoring a playbook needs action.request." };
      }
      return { ok: true };

    case "approved":
      if (!actor.permissions.includes("action.approve")) {
        return { ok: false, code: "permission_denied", message: "Peer review of a playbook needs action.approve." };
      }
      if (pb.proposed_by && pb.proposed_by === actor.principal_id) {
        return { ok: false, code: "self_review", message: "The proposer of a playbook cannot be its peer reviewer." };
      }
      return { ok: true };

    case "enabled":
      if (!actor.permissions.includes("action.approve")) {
        return { ok: false, code: "permission_denied", message: "Enabling a playbook needs action.approve." };
      }
      if (pb.proposed_by && pb.proposed_by === actor.principal_id) {
        return { ok: false, code: "self_approval", message: "The proposer of a playbook cannot be the one who enables it." };
      }
      if (approverOf(pb) === actor.principal_id) {
        return {
          ok: false,
          code: "no_segregation",
          message: "The reviewer who approved a playbook should not also enable it (segregation of duties).",
        };
      }
      return { ok: true };

    case "disabled":
    case "retired":
      if (!actor.permissions.includes("action.approve")) {
        return { ok: false, code: "permission_denied", message: "Disabling or retiring a playbook needs action.approve." };
      }
      return { ok: true };

    default:
      return { ok: false, code: "invalid_transition", message: `Unhandled transition to ${to}.` };
  }
}
