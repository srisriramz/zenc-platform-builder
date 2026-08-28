import { afterEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { resetSession } from "./session-store";
import { getStore } from "./store";

afterEach(() => resetSession());

const admin = { userId: "user-sam-admin", tenantId: "tenant-northwind-bank" };
const analyst = { userId: "user-priya-analyst", tenantId: "tenant-northwind-bank" };
const approver = { userId: "user-dana-approver", tenantId: "tenant-northwind-bank" };

function investigatingCase() {
  return getStore().cases.find((c) => c.tenant_id === "tenant-northwind-bank" && c.status === "investigating")!;
}

describe("kill switch freezes the whole response pipeline (fix M3)", () => {
  it("blocks plan / request / approve while engaged, then resumes when disarmed", async () => {
    const c = investigatingCase();
    await api.toggleKillSwitch(admin, "tenant:tenant-northwind-bank", true, "IR drill");

    await expect(api.planCaseResponse(analyst, c.case_id)).rejects.toThrow(/kill switch/i);
    await expect(
      api.requestAction(analyst, { case_id: c.case_id, action_class: "A3", action_type: "isolate_host", target: "nwb-ws-05" }),
    ).rejects.toThrow(/kill switch/i);

    // a request that already existed can't be approved either
    const seeded = getStore().actionRequests.find((r) => r.status === "pending_approval");
    if (seeded) await expect(api.approveAction(approver, seeded.action_request_id)).rejects.toThrow(/kill switch/i);

    // the approval queue surfaces it
    const q = await api.fetchApprovalQueue(analyst);
    expect(q.kill_switch?.scope).toBe("tenant");

    // disarm -> pipeline works again
    await api.toggleKillSwitch(admin, "tenant:tenant-northwind-bank", false);
    const plan = await api.planCaseResponse(analyst, c.case_id);
    expect(plan.plan.case_id).toBe(c.case_id);
  });

  it("a global kill switch also freezes a tenant that has no tenant-level switch", async () => {
    const c = investigatingCase();
    await api.toggleKillSwitch(admin, "global", true, "org-wide freeze");
    await expect(api.planCaseResponse(analyst, c.case_id)).rejects.toThrow(/global kill switch/i);
    await api.toggleKillSwitch(admin, "global", false);
  });

  it("engaging a kill switch requires a documented reason", async () => {
    await expect(api.toggleKillSwitch(admin, "global", true)).rejects.toThrow(/reason/i);
  });

  it("the cross-tenant kill-switch list is admin/audit only, not any soc.view user (fix S1)", async () => {
    await expect(api.fetchKillSwitches(analyst)).rejects.toThrow(); // analyst == priya, soc.view only
    await expect(api.fetchKillSwitches(admin)).resolves.toHaveProperty("switches");
    await expect(api.fetchKillSwitches({ userId: "user-omar-auditor", tenantId: "tenant-northwind-bank" })).resolves.toHaveProperty("switches");
  });

  it("neither plan nor request works on a closed case", async () => {
    const closed = getStore().cases.find((c) => c.tenant_id === "tenant-northwind-bank" && c.status === "closed")!;
    await expect(api.planCaseResponse(analyst, closed.case_id)).rejects.toThrow(/closed/i);
    await expect(
      api.requestAction(analyst, { case_id: closed.case_id, action_class: "A2", action_type: "create_task" }),
    ).rejects.toThrow(/closed/i);
  });
});
