import { afterEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { resetSession } from "./session-store";
import { getStore } from "./store";

/**
 * `references/testing-acceptance.md`:
 *  - Evidence items are immutable once added; a "correction" creates a new
 *    linked item rather than mutating the original.
 *  - Every approval, execution, and evidence/role change produces an audit
 *    event, and audit events cannot be edited in place.
 */

afterEach(() => resetSession());

const T = "tenant-northwind-bank";
const analyst = { userId: "user-priya-analyst", tenantId: T };
const approver = { userId: "user-dana-approver", tenantId: T };
const admin = { userId: "user-sam-admin", tenantId: T };
const auditor = { userId: "user-omar-auditor", tenantId: T };

function investigatingCase() {
  return getStore().cases.find((c) => c.tenant_id === T && c.status === "investigating")!;
}

describe("evidence is immutable — a correction is a new linked item", () => {
  it("superseding an item leaves the original untouched and links the new one to it", async () => {
    const c = investigatingCase();

    const first = await api.addCaseEvidence(analyst, {
      case_id: c.case_id,
      title: "initial note",
      reference_type: "note",
      reference: "the host looked clean on first pass",
      confidence: 0.5,
    });

    const before = (await api.fetchCaseDetail(analyst, c.case_id)).evidence.find((e) => e.evidence_id === first.evidence_id)!;

    const correction = await api.addCaseEvidence(analyst, {
      case_id: c.case_id,
      title: "corrected note",
      reference_type: "note",
      reference: "on review the host WAS beaconing — see the pcap",
      confidence: 0.9,
      supersedes_evidence_id: first.evidence_id,
    });

    expect(correction.evidence_id).not.toBe(first.evidence_id);

    const after = await api.fetchCaseDetail(analyst, c.case_id);
    const original = after.evidence.find((e) => e.evidence_id === first.evidence_id)!;
    const newItem = after.evidence.find((e) => e.evidence_id === correction.evidence_id)!;

    // the original is byte-for-byte what it was
    expect(original).toEqual(before);
    // the new item points back at it
    expect(newItem.supersedes_evidence_id).toBe(first.evidence_id);
    // both are still on the case
    expect(after.evidence.filter((e) => [first.evidence_id, correction.evidence_id].includes(e.evidence_id))).toHaveLength(2);
  });

  it("refuses to supersede an item that is not on this case", async () => {
    const c = investigatingCase();
    await expect(
      api.addCaseEvidence(analyst, {
        case_id: c.case_id,
        title: "x",
        reference_type: "note",
        reference: "y",
        confidence: 0.5,
        supersedes_evidence_id: "ev-does-not-exist",
      }),
    ).rejects.toThrow();
  });
});

describe("every state-changing action writes an audit event", () => {
  async function auditActions() {
    return (await api.fetchAudit(auditor)).map((e) => e.action);
  }

  it("opening and closing a case", async () => {
    const q = await api.fetchIntakeQueue(analyst);
    const { case_id } = await api.confirmCaseOpen(analyst, q.pending[0].candidate.candidate_id);
    expect(await auditActions()).toContain("case_created");
    await api.setCaseStatus(analyst, case_id, "investigating");
    await api.closeCase(analyst, case_id, "false_positive", "benign");
    expect(await auditActions()).toContain("case_status_changed");
  });

  it("adding and reviewing evidence", async () => {
    const c = investigatingCase();
    const { evidence_id } = await api.addCaseEvidence(analyst, {
      case_id: c.case_id,
      title: "e",
      reference_type: "link",
      reference: "https://soc.example/artifact/1",
      confidence: 0.7,
    });
    expect(await auditActions()).toContain("evidence_added");
    await api.reviewEvidence(approver, evidence_id, "approved");
    expect(await auditActions()).toContain("evidence_reviewed");
  });

  it("requesting, approving and executing a response — execution is attributed to the system, not a human", async () => {
    const c = investigatingCase();
    const req = await api.requestAction(analyst, {
      case_id: c.case_id,
      action_class: "A3",
      action_type: "disable_account",
      target: "j.doe",
    });
    expect(await auditActions()).toContain("action_requested");

    await api.approveAction(approver, req.action_request_id);
    expect(await auditActions()).toContain("approval_granted");

    await api.executeActionRequest(analyst, req.action_request_id);
    const events = await api.fetchAudit(auditor);
    const exec = events.find((e) => e.action === "action_executed");
    expect(exec).toBeTruthy();
    expect(exec!.actor.principal_type).toBe("system");
  });

  it("toggling a kill switch", async () => {
    await api.toggleKillSwitch(admin, `tenant:${T}`, true, "IR drill");
    expect(await auditActions()).toContain("kill_switch_toggled");
  });
});

describe("the audit trail is append-only", () => {
  it("only grows across a sequence of operations — nothing is ever removed", async () => {
    const len = async () => (await api.fetchAudit(auditor)).length;
    let prev = await len();

    const q = await api.fetchIntakeQueue(analyst);
    await api.confirmCaseOpen(analyst, q.pending[0].candidate.candidate_id);
    let now = await len();
    expect(now).toBeGreaterThan(prev);
    prev = now;

    await api.toggleKillSwitch(admin, `tenant:${T}`, true, "drill");
    await api.toggleKillSwitch(admin, `tenant:${T}`, false, "drill over");
    now = await len();
    expect(now).toBeGreaterThan(prev);
  });

  it("exposes no update or delete entry point for audit events", () => {
    // structural: the only audit mutator is appendAudit (an unshift); there is
    // no exported api that edits or removes an audit_id
    const names = Object.keys(api);
    expect(names.filter((n) => /audit/i.test(n) && /(update|edit|delete|remove|patch)/i.test(n))).toEqual([]);
  });
});
