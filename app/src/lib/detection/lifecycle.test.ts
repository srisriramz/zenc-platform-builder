import { describe, expect, it } from "vitest";
import type { Permission } from "@/data/platform";
import { validateTransition, type RuleForTransition, type TransitionActor } from "./lifecycle";

const human = (id: string, perms: Permission[]): TransitionActor => ({ principal_id: id, principal_type: "human", permissions: perms });
const agent: TransitionActor = { principal_id: "detection-engineer-agent", principal_type: "agent", permissions: [] };

const rule = (over: Partial<RuleForTransition>): RuleForTransition => ({
  lifecycle_state: "draft",
  proposed_by: "user-marcus",
  history: [],
  ...over,
});

describe("validateTransition — the human-only enable rule (SKILL.md #3)", () => {
  it("an agent may draft → test → submit for review, and nothing else", () => {
    expect(validateTransition(rule({ lifecycle_state: "draft" }), "test", agent).ok).toBe(true);
    expect(validateTransition(rule({ lifecycle_state: "test" }), "peer_review", agent).ok).toBe(true);
  });

  it("an agent can NEVER approve a rule", () => {
    const r = validateTransition(rule({ lifecycle_state: "peer_review" }), "approved", agent);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("agent_forbidden_transition");
  });

  it("an agent can NEVER enable a rule — even from approved", () => {
    const r = validateTransition(rule({ lifecycle_state: "approved" }), "enabled", agent);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("agent_forbidden_transition");
  });
});

describe("validateTransition — no self-approval / segregation of duties", () => {
  const reviewer = human("user-dana", ["rule.review", "rule.enable"]);

  it("the proposer cannot peer-review their own rule", () => {
    const r = validateTransition(rule({ lifecycle_state: "peer_review", proposed_by: "user-dana" }), "approved", reviewer);
    expect(r.ok === false && r.code).toBe("self_review");
  });

  it("the proposer cannot enable their own rule", () => {
    const r = validateTransition(
      rule({ lifecycle_state: "approved", proposed_by: "user-dana", history: [{ from_state: "peer_review", to_state: "approved", changed_by: "user-x" }] }),
      "enabled",
      reviewer,
    );
    expect(r.ok === false && r.code).toBe("self_approval");
  });

  it("the peer reviewer who approved cannot also be the one who enables (segregation)", () => {
    const r = validateTransition(
      rule({
        lifecycle_state: "approved",
        proposed_by: "user-marcus",
        history: [{ from_state: "peer_review", to_state: "approved", changed_by: "user-dana" }],
      }),
      "enabled",
      reviewer, // user-dana
    );
    expect(r.ok === false && r.code).toBe("no_segregation");
  });

  it("a third independent human with rule.enable CAN enable it", () => {
    const r = validateTransition(
      rule({
        lifecycle_state: "approved",
        proposed_by: "user-marcus",
        history: [{ from_state: "peer_review", to_state: "approved", changed_by: "user-dana" }],
      }),
      "enabled",
      human("user-omar", ["rule.enable"]),
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateTransition — permissions & order", () => {
  it("rejects an out-of-order transition", () => {
    expect(validateTransition(rule({ lifecycle_state: "draft" }), "enabled", human("u", ["rule.enable"])).ok).toBe(false);
    expect(validateTransition(rule({ lifecycle_state: "peer_review" }), "enabled", human("u", ["rule.enable"])).ok).toBe(false);
  });

  it("approving needs rule.review", () => {
    const r = validateTransition(rule({ lifecycle_state: "peer_review" }), "approved", human("u", ["rule.propose"]));
    expect(r.ok === false && r.code).toBe("permission_denied");
  });

  it("enabling needs rule.enable", () => {
    const r = validateTransition(
      rule({ lifecycle_state: "approved", history: [{ from_state: "peer_review", to_state: "approved", changed_by: "x" }] }),
      "enabled",
      human("u", ["rule.review"]),
    );
    expect(r.ok === false && r.code).toBe("permission_denied");
  });

  it("allows disable → enable → retire lifecycle for an authorised human", () => {
    const approver = human("u", ["rule.enable"]);
    expect(validateTransition(rule({ lifecycle_state: "enabled" }), "disabled", approver).ok).toBe(true);
    expect(validateTransition(rule({ lifecycle_state: "disabled" }), "retired", approver).ok).toBe(true);
  });
});
