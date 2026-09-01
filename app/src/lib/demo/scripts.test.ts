import { describe, expect, it } from "vitest";
import { ROLES, USER_MAP } from "@/data/platform";
import { NAV_ITEMS } from "@/components/shell/nav";
import { DEMO_SCRIPTS, getDemoScript, resolveRoute } from "./scripts";

/** the permission a route sits behind, per the nav contract */
function routePermission(route: string): string | undefined {
  const path = route.split("?")[0].replace(/\/:[^/]+/g, "");
  const item =
    NAV_ITEMS.find((n) => n.href === path) ??
    NAV_ITEMS.find((n) => path.startsWith(n.href + "/")) ??
    NAV_ITEMS.filter((n) => path === n.href || path.startsWith(n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return item?.permission;
}

function permsFor(userId: string, tenantId: string): string[] {
  const role = USER_MAP[userId]?.roles.find((r) => r.tenant_id === tenantId)?.role;
  return role ? ROLES[role].permissions : [];
}

describe("guided-demo scripts", () => {
  it("exposes the two scoped walkthroughs", () => {
    expect(DEMO_SCRIPTS.map((s) => s.id)).toEqual(["technical-12min", "executive-5min"]);
    expect(getDemoScript("technical-12min")?.label).toBe("Technical walkthrough");
    expect(getDemoScript("nope")).toBeUndefined();
  });

  for (const script of DEMO_SCRIPTS) {
    describe(script.id, () => {
      it("every step has a title, a presenter note, a route and a real persona", () => {
        for (const step of script.steps) {
          expect(step.title.length).toBeGreaterThan(0);
          expect(step.presenterNote.length).toBeGreaterThan(20);
          expect(step.route.startsWith("/")).toBe(true);
          expect(USER_MAP[step.persona], `unknown persona ${step.persona}`).toBeDefined();
        }
      });

      it("each step's persona holds a role in the script's tenant and the permission its route needs", () => {
        for (const step of script.steps) {
          const perms = permsFor(step.persona, script.tenantId);
          expect(perms.length, `${step.persona} has no role in ${script.tenantId}`).toBeGreaterThan(0);
          const needed = routePermission(step.route);
          if (needed) {
            expect(perms, `step "${step.id}" (${step.persona}) cannot open ${step.route}`).toContain(needed);
          }
        }
      });

      it("has no route placeholder that is used before a step could have set it", () => {
        // any `:var` in a route must be a var some earlier (or the same) step's
        // action can produce — in practice only :caseId is used
        const placeholderSteps = script.steps
          .map((s, i) => ({ i, vars: [...s.route.matchAll(/:(\w+)/g)].map((m) => m[1]) }))
          .filter((x) => x.vars.length > 0);
        const firstActionIdx = script.steps.findIndex((s) => s.action);
        for (const ps of placeholderSteps) {
          expect(ps.vars).toEqual(["caseId"]);
          expect(ps.i).toBeGreaterThanOrEqual(firstActionIdx);
        }
      });
    });
  }

  it("the technical walkthrough approves as a different principal than it requests", () => {
    const s = getDemoScript("technical-12min")!;
    const request = s.steps.find((x) => x.id === "request")!;
    const approve = s.steps.find((x) => x.id === "approve")!;
    expect(request.persona).not.toBe(approve.persona);
    expect(permsFor(approve.persona, s.tenantId)).toContain("action.approve");
    expect(permsFor(request.persona, s.tenantId)).toContain("action.request");
    // the executor step runs as someone with case.work — approvers do not have it
    const execute = s.steps.find((x) => x.id === "execute")!;
    expect(permsFor(execute.persona, s.tenantId)).toContain("case.work");
  });

  it("the executive walkthrough performs no mutating actions", () => {
    // its only action resolves a case id for read-only navigation
    const s = getDemoScript("executive-5min")!;
    const withActions = s.steps.filter((x) => x.action);
    expect(withActions.map((x) => x.id)).toEqual(["incident"]);
  });
});

describe("resolveRoute", () => {
  it("fills placeholders from vars", () => {
    expect(resolveRoute("/cases/:caseId", { caseId: "case-42" })).toBe("/cases/case-42");
    expect(resolveRoute("/analytics?view=executive", {})).toBe("/analytics?view=executive");
  });

  it("falls back to the list route when a placeholder is unfilled", () => {
    expect(resolveRoute("/cases/:caseId", {})).toBe("/cases");
  });
});
