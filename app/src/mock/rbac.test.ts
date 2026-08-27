import { describe, expect, it } from "vitest";
import { AccessError, assertCan, assertEntitlement, can, permissionsFor, roleInTenant } from "./rbac";

const analyst = { userId: "user-priya-analyst", tenantId: "tenant-northwind-bank" };
const approver = { userId: "user-dana-approver", tenantId: "tenant-northwind-bank" };
const auditor = { userId: "user-omar-auditor", tenantId: "tenant-northwind-bank" };
const analystInSocOnly = { userId: "user-priya-analyst", tenantId: "tenant-summit-cu" }; // SOAR-only tenant

describe("role resolution", () => {
  it("resolves a user's role in a tenant", () => {
    expect(roleInTenant(analyst)).toBe("analyst");
    expect(roleInTenant(approver)).toBe("approver");
  });

  it("returns null when the user has no role in that tenant", () => {
    expect(roleInTenant({ userId: "user-lena-reviewer", tenantId: "tenant-northwind-markets" })).toBeNull();
  });
});

describe("permission checks are enforced regardless of UI", () => {
  it("an analyst can query the SIEM but cannot approve actions or enable rules", () => {
    expect(can(analyst, "siem.query")).toBe(true);
    expect(can(analyst, "action.approve")).toBe(false);
    expect(can(analyst, "rule.enable")).toBe(false);
  });

  it("only an approver holds action.approve and rule.enable", () => {
    expect(can(approver, "action.approve")).toBe(true);
    expect(can(approver, "rule.enable")).toBe(true);
  });

  it("no role bundles both authoring and approval of rules", () => {
    // separation of duties: rule.propose and rule.enable never co-occur
    const conflicted = ROLE_IDS.filter((r) => {
      const perms = permissionsFor({ userId: pick(r), tenantId: "tenant-northwind-bank" });
      return perms.includes("rule.propose") && perms.includes("rule.enable");
    });
    expect(conflicted).toEqual([]);
  });

  it("CISO and SOC Manager are read-only — reporting + audit, nothing operational", () => {
    for (const r of ["ciso", "soc_manager"] as const) {
      const perms = permissionsFor({ userId: pick(r), tenantId: "tenant-northwind-bank" });
      expect(perms).toContain("reporting.view");
      expect(perms).not.toContain("case.work");
      expect(perms).not.toContain("action.approve");
      expect(perms).not.toContain("rule.enable");
      expect(perms).not.toContain("admin.policy");
    }
  });

  it("an auditor is read-only — no query, no approve, no admin", () => {
    expect(can(auditor, "audit.view")).toBe(true);
    expect(can(auditor, "siem.query")).toBe(false);
    expect(can(auditor, "action.approve")).toBe(false);
    expect(can(auditor, "admin.policy")).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws permission_denied for a missing permission", () => {
    expect(() => assertCan(analyst, "action.approve")).toThrowError(AccessError);
    try {
      assertCan(analyst, "action.approve");
    } catch (e) {
      expect((e as AccessError).code).toBe("permission_denied");
    }
  });

  it("throws no_role_in_tenant when the user is a stranger to the tenant", () => {
    try {
      assertCan({ userId: "user-lena-reviewer", tenantId: "tenant-summit-cu" }, "soc.view");
    } catch (e) {
      expect((e as AccessError).code).toBe("no_role_in_tenant");
    }
  });

  it("throws not_authenticated for an unknown user", () => {
    try {
      assertCan({ userId: "ghost", tenantId: "tenant-northwind-bank" }, "siem.view");
    } catch (e) {
      expect((e as AccessError).code).toBe("not_authenticated");
    }
  });
});

describe("assertEntitlement", () => {
  it("passes when the tenant is entitled", () => {
    expect(() => assertEntitlement(analyst, "has_siem")).not.toThrow();
  });

  it("throws entitlement_missing for a product the tenant does not license", () => {
    // Summit Credit Union is SOAR-only — no SIEM
    try {
      assertEntitlement(analystInSocOnly, "has_siem");
    } catch (e) {
      expect(e).toBeInstanceOf(AccessError);
      expect((e as AccessError).code).toBe("entitlement_missing");
    }
  });

  it("Assessment is off everywhere (Phase 2)", () => {
    expect(() => assertEntitlement(analyst, "has_assessment")).toThrowError(AccessError);
  });
});

const ROLE_IDS = [
  "analyst",
  "senior_analyst",
  "approver",
  "soc_manager",
  "ciso",
  "admin",
  "reviewer",
  "auditor",
] as const;

function pick(role: string): string {
  return {
    analyst: "user-priya-analyst",
    senior_analyst: "user-marcus-senior",
    approver: "user-dana-approver",
    soc_manager: "user-ravi-manager",
    ciso: "user-ava-ciso",
    admin: "user-sam-admin",
    reviewer: "user-lena-reviewer",
    auditor: "user-omar-auditor",
  }[role]!;
}
