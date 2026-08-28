import { describe, expect, it } from "vitest";
import type { ActionRequest } from "@/schemas";
import { executeAction, rollbackAction, isReversible, type ExecutorContext } from "./executor";

function req(over: Partial<ActionRequest>): ActionRequest {
  return {
    action_request_id: "areq-1",
    tenant_id: "t1",
    case_id: "case-1",
    action_class: "A3",
    action_type: "isolate_host",
    target: "h1",
    requested_by: { principal_id: "user-priya-analyst", principal_type: "human" },
    approved_by: { principal_id: "user-dana-approver", principal_type: "human" },
    status: "approved",
    dry_run: true,
    expires_at: "2026-08-28T16:00:00.000Z",
    ...over,
  } as ActionRequest;
}

const okCtx: ExecutorContext = {
  killSwitch: { global: false, partner: false, tenant: false },
  caseOpen: true,
  executedBy: "user-priya-analyst",
  nowIso: "2026-08-28T12:00:00.000Z",
};

describe("executeAction", () => {
  it("executes a dry-run and records verification + a rollback marker", () => {
    const out = executeAction(req({}), okCtx);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.patch.status).toBe("verified");
      expect(out.patch.execution?.precondition_recheck_passed).toBe(true);
      expect(out.patch.execution?.result_note).toMatch(/DRY RUN/);
      expect(out.patch.verification?.outcome_confirmed).toBe(true);
      expect(out.patch.rollback?.reversible).toBe(true);
    }
  });

  it("halts when ANY kill switch is engaged — pending and in-flight both stop", () => {
    for (const scope of ["global", "partner", "tenant"] as const) {
      const out = executeAction(req({}), { ...okCtx, killSwitch: { global: false, partner: false, tenant: false, [scope]: true } });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.code).toBe("kill_switch");
    }
  });

  it("fails the precondition re-check when the case is no longer open", () => {
    const out = executeAction(req({}), { ...okCtx, caseOpen: false });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("precondition_failed");
  });

  it("refuses a non-approved or expired request", () => {
    expect(executeAction(req({ status: "pending_approval" }), okCtx).ok).toBe(false);
    const expired = executeAction(req({ expires_at: "2026-08-28T09:00:00.000Z" }), okCtx);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.code).toBe("expired");
  });

  it("is idempotent — re-executing an already-executed request is a no-op that returns the same result", () => {
    const first = executeAction(req({}), okCtx);
    if (!first.ok) throw new Error("unexpected");
    const again = executeAction(req({ status: "verified", execution: first.patch.execution, verification: first.patch.verification }), okCtx);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.idempotent_noop).toBe(true);
  });
});

describe("rollbackAction", () => {
  it("rolls back a reversible executed action", () => {
    const out = rollbackAction(req({ status: "verified", rollback: { reversible: true } }), { rolledBackBy: "user-priya-analyst", nowIso: "2026-08-28T12:00:00.000Z" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.patch.status).toBe("rolled_back");
  });
  it("refuses to roll back an irreversible action", () => {
    const out = rollbackAction(
      req({ action_type: "bulk_disable_accounts", status: "verified", rollback: { reversible: false } }),
      { rolledBackBy: "u", nowIso: "2026-08-28T12:00:00.000Z" },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("irreversible");
  });
  it("classifies reversibility by action type", () => {
    expect(isReversible("isolate_host")).toBe(true);
    expect(isReversible("bulk_disable_accounts")).toBe(false);
  });
});
