import { describe, expect, it } from "vitest";
import type { Permission } from "@/data/platform";
import { validatePlaybookTransition, type PlaybookForTransition } from "./playbook-lifecycle";

const AUTHOR: Permission[] = ["action.request", "soc.view"];
const APPROVER: Permission[] = ["action.approve", "soc.view"];

function pb(over: Partial<PlaybookForTransition> = {}): PlaybookForTransition {
  return { lifecycle_state: "peer_review", proposed_by: "user-marcus-senior", history: [], ...over };
}

describe("validatePlaybookTransition", () => {
  it("lets the Response Planner draft, test, and submit for review — nothing more", () => {
    const agent = { principal_id: "response-planner-agent", principal_type: "agent" as const, permissions: [] };
    expect(validatePlaybookTransition(pb({ lifecycle_state: "test" }), "peer_review", agent).ok).toBe(true);
    const enable = validatePlaybookTransition(pb({ lifecycle_state: "approved" }), "enabled", agent);
    expect(enable.ok).toBe(false);
    if (!enable.ok) expect(enable.code).toBe("agent_forbidden_transition");
  });

  it("blocks the proposer from being the peer reviewer", () => {
    const marcus = { principal_id: "user-marcus-senior", principal_type: "human" as const, permissions: APPROVER };
    const v = validatePlaybookTransition(pb({ proposed_by: "user-marcus-senior" }), "approved", marcus);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("self_review");
  });

  it("blocks the reviewer who approved from also enabling (segregation of duties)", () => {
    const dana = { principal_id: "user-dana-approver", principal_type: "human" as const, permissions: APPROVER };
    const v = validatePlaybookTransition(
      pb({ lifecycle_state: "approved", proposed_by: "user-marcus-senior", history: [{ from_state: "peer_review", to_state: "approved", changed_by: "user-dana-approver" }] }),
      "enabled",
      dana,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("no_segregation");
  });

  it("allows a clean human path: author submits, approver approves, a third person enables", () => {
    const marcus = { principal_id: "user-marcus-senior", principal_type: "human" as const, permissions: AUTHOR };
    const dana = { principal_id: "user-dana-approver", principal_type: "human" as const, permissions: APPROVER };
    const ravi = { principal_id: "user-ravi-manager", principal_type: "human" as const, permissions: APPROVER };
    expect(validatePlaybookTransition(pb({ lifecycle_state: "test", proposed_by: "user-marcus-senior" }), "peer_review", marcus).ok).toBe(true);
    expect(validatePlaybookTransition(pb({ lifecycle_state: "peer_review", proposed_by: "user-marcus-senior" }), "approved", dana).ok).toBe(true);
    expect(
      validatePlaybookTransition(
        pb({ lifecycle_state: "approved", proposed_by: "user-marcus-senior", history: [{ from_state: "peer_review", to_state: "approved", changed_by: "user-dana-approver" }] }),
        "enabled",
        ravi,
      ).ok,
    ).toBe(true);
  });

  it("rejects a nonsensical jump", () => {
    const dana = { principal_id: "user-dana-approver", principal_type: "human" as const, permissions: APPROVER };
    expect(validatePlaybookTransition(pb({ lifecycle_state: "draft" }), "enabled", dana).ok).toBe(false);
  });
});
