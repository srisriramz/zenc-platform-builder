import { afterEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { resetSession } from "./session-store";

afterEach(() => resetSession());

const admin = { userId: "user-sam-admin", tenantId: "tenant-northwind-bank" };
const analyst = { userId: "user-priya-analyst", tenantId: "tenant-northwind-bank" };

describe("createTenant", () => {
  it("is admin.identity only", async () => {
    await expect(api.createTenant(analyst, { name: "x", sector: "y", has_siem: true, has_soc: true })).rejects.toThrow();
  });

  it("creates a tenant with Assessment always off, and it's immediately visible to admin reads", async () => {
    const t = await api.createTenant(admin, { name: "Fairview Regional Bank", sector: "BFSI", has_siem: true, has_soc: false });
    expect(t.entitlements).toEqual({ has_siem: true, has_soc: false, has_assessment: false });

    const tenants = await api.fetchAdminTenants(admin);
    expect(tenants.some((x) => x.tenant_id === t.tenant_id)).toBe(true);
  });

  it("rejects a blank name", async () => {
    await expect(api.createTenant(admin, { name: "  ", sector: "BFSI", has_siem: true, has_soc: true })).rejects.toThrow();
  });
});

describe("createUser", () => {
  it("rejects an unknown tenant", async () => {
    await expect(
      api.createUser(admin, { display_name: "Jordan Lee", email: "jordan@x.example", tenant_id: "tenant-does-not-exist", role: "analyst" }),
    ).rejects.toThrow();
  });

  it("the invited user can immediately act in the new tenant — RBAC recognizes wizard-created identities, not just seed data", async () => {
    const t = await api.createTenant(admin, { name: "Fairview Regional Bank", sector: "BFSI", has_siem: true, has_soc: true });
    const u = await api.createUser(admin, { display_name: "Jordan Lee", email: "jordan.lee@demo.zenc.example", tenant_id: t.tenant_id, role: "analyst" });

    const newCtx = { userId: u.user_id, tenantId: t.tenant_id };
    // an analyst should be able to view SIEM data in their own brand-new tenant
    await expect(api.fetchTelemetrySources(newCtx)).resolves.toBeInstanceOf(Array);
    // and bootstrap should resolve them with their new tenant attached
    const boot = await api.fetchBootstrap(u.user_id);
    expect(boot.tenants.some((bt) => bt.tenant_id === t.tenant_id)).toBe(true);
  });
});

describe("addTelemetrySource", () => {
  it("requires the tenant to be entitled to ZenC SIEM", async () => {
    const t = await api.createTenant(admin, { name: "SOAR Only Co", sector: "BFSI", has_siem: false, has_soc: true });
    await expect(api.addTelemetrySource(admin, { tenant_id: t.tenant_id, family: "windows" })).rejects.toThrow(/SIEM/);
  });

  it("adds a source and returns a validated first event, both visible on refetch", async () => {
    const t = await api.createTenant(admin, { name: "Fairview Regional Bank", sector: "BFSI", has_siem: true, has_soc: true });
    const u = await api.createUser(admin, { display_name: "Jordan Lee", email: "jordan.lee@demo.zenc.example", tenant_id: t.tenant_id, role: "analyst" });
    const result = await api.addTelemetrySource(admin, { tenant_id: t.tenant_id, family: "firewall", connector_name: "Branch Firewall" });
    expect(result.firstEvent.tenant_id).toBe(t.tenant_id);
    expect(result.firstEvent.normalization_status).toBe("normalized");

    const sources = await api.fetchTelemetrySources({ userId: u.user_id, tenantId: t.tenant_id });
    expect(sources.some((s) => s.telemetry_source_id === result.source.telemetry_source_id)).toBe(true);
  });
});
