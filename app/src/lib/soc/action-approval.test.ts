import { describe, expect, it } from "vitest";
import type { ActionRequest } from "@/schemas";
import type { Permission } from "@/data/platform";
import { approvalRequirement, canApprove, isExecutable, type ApprovalPolicy } from "./action-approval";

const basePolicy: ApprovalPolicy = {
  default_autonomy_level: "L2",
  pre_authorized_action_classes: ["A0", "A1"],
  l3_preauthorized_action_types: [],
};

function req(over: Partial<ActionRequest>): ActionRequest {
  return {
    action_request_id: "areq-1",
    tenant_id: "t1",
    case_id: "case-1",
    action_class: "A3",
    action_type: "isolate_host",
    requested_by: { principal_id: "user-priya-analyst", principal_type: "human" },
    status: "pending_approval",
    dry_run: true,
    ...over,
  } as ActionRequest;
}

describe("approvalRequirement", () => {
  it("A0/A1 need no approval", () => {
    expect(approvalRequirement(req({ action_class: "A1", action_type: "log_search" }), basePolicy).needs_human_approval).toBe(false);
  });
  it("A2 needs approval by default, none if the class is pre-authorized", () => {
    expect(approvalRequirement(req({ action_class: "A2", action_type: "create_task" }), basePolicy).needs_human_approval).toBe(true);
    const preauth = { ...basePolicy, pre_authorized_action_classes: ["A0", "A1", "A2"] };
    expect(approvalRequirement(req({ action_class: "A2", action_type: "create_task" }), preauth).needs_human_approval).toBe(false);
  });
  it("A3 needs approval unless the EXACT action type is L3 pre-authorized, and then it cites policy_basis", () => {
    expect(approvalRequirement(req({ action_class: "A3", action_type: "block_ip" }), basePolicy).needs_human_approval).toBe(true);
    const preauth = { ...basePolicy, l3_preauthorized_action_types: ["block_ip"] };
    const r = approvalRequirement(req({ action_class: "A3", action_type: "block_ip" }), preauth);
    expect(r.needs_human_approval).toBe(false);
    expect(r.policy_basis).toMatch(/block_ip/);
    // a different A3 type is still gated
    expect(approvalRequirement(req({ action_class: "A3", action_type: "disable_account" }), preauth).needs_human_approval).toBe(true);
  });
  it("A4 ALWAYS needs approval, even if someone tries to pre-authorize it", () => {
    const preauth = { ...basePolicy, pre_authorized_action_classes: ["A0", "A1", "A2", "A3", "A4"], l3_preauthorized_action_types: ["bulk_disable_accounts"] };
    expect(approvalRequirement(req({ action_class: "A4", action_type: "bulk_disable_accounts" }), preauth).needs_human_approval).toBe(true);
  });
});

describe("canApprove", () => {
  const approver: { principal_id: string; permissions: Permission[] } = { principal_id: "user-dana-approver", permissions: ["action.approve"] };

  it("rejects when the requester tries to approve their own request", () => {
    const v = canApprove(req({ requested_by: { principal_id: "user-dana-approver", principal_type: "human" } }), approver);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("self_approval");
  });
  it("rejects an actor without action.approve", () => {
    expect(canApprove(req({}), { principal_id: "user-priya-analyst", permissions: ["action.request"] }).ok).toBe(false);
  });
  it("rejects the A4 approver who authored the underlying playbook (segregation)", () => {
    const v = canApprove(req({ action_class: "A4" }), approver, { underlyingPlaybookAuthor: "user-dana-approver" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("no_segregation");
  });
  it("allows a clean independent approver", () => {
    expect(canApprove(req({}), approver).ok).toBe(true);
  });
});

describe("isExecutable", () => {
  it("rejects a non-approved request", () => {
    expect(isExecutable(req({ status: "pending_approval" }), "2026-08-28T12:00:00.000Z").ok).toBe(false);
  });
  it("rejects an expired approval", () => {
    const v = isExecutable(req({ status: "approved", expires_at: "2026-08-28T10:00:00.000Z" }), "2026-08-28T12:00:00.000Z");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("expired");
  });
  it("allows an approved, unexpired request", () => {
    expect(isExecutable(req({ status: "approved", expires_at: "2026-08-28T16:00:00.000Z" }), "2026-08-28T12:00:00.000Z").ok).toBe(true);
  });
});
