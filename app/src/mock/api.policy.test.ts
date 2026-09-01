import { afterEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { resetSession } from "./session-store";

afterEach(() => resetSession());

const admin = { userId: "user-sam-admin", tenantId: "tenant-northwind-bank" };
const analyst = { userId: "user-priya-analyst", tenantId: "tenant-northwind-bank" };

describe("updateTenantPolicy", () => {
  it("is admin.policy only", async () => {
    await expect(
      api.updateTenantPolicy(analyst, "tenant-northwind-bank", { default_autonomy_level: "L3" }),
    ).rejects.toThrow();
  });

  it("changes the autonomy level and the change is visible on refetch", async () => {
    await api.updateTenantPolicy(admin, "tenant-northwind-bank", { default_autonomy_level: "L3" });
    const policies = await api.fetchPolicies(admin);
    const t = policies.tenants.find((t) => t.tenant_id === "tenant-northwind-bank")!;
    expect(t.policy.default_autonomy_level).toBe("L3");
  });

  it("toggles pre-authorized action classes and persists across refetch", async () => {
    await api.updateTenantPolicy(admin, "tenant-northwind-bank", { pre_authorized_action_classes: ["A0", "A1", "A2"] });
    const policies = await api.fetchPolicies(admin);
    const t = policies.tenants.find((t) => t.tenant_id === "tenant-northwind-bank")!;
    expect(t.policy.pre_authorized_action_classes).toEqual(["A0", "A1", "A2"]);
  });

  it("never accepts A4 as a pre-authorized action class, regardless of policy (A4 always needs independent approval)", async () => {
    await expect(
      api.updateTenantPolicy(admin, "tenant-northwind-bank", { pre_authorized_action_classes: ["A3", "A4"] }),
    ).rejects.toThrow(/A4/);
  });

  it("rejects an unknown tenant", async () => {
    await expect(
      api.updateTenantPolicy(admin, "tenant-does-not-exist", { default_autonomy_level: "L2" }),
    ).rejects.toThrow();
  });
});
