import { describe, expect, it } from "vitest";
import { getStore } from "@/mock/store";
import { TENANT_MAP } from "@/data/platform";

/**
 * `references/testing-acceptance.md` invariants that the Zod `.refine`s cannot
 * express on their own — checked against the *assembled* seed corpus so a bad
 * fixture fails CI, not just a live demo.
 */

const store = getStore();

describe("seed integrity — detection", () => {
  const enabledRules = store.correlationRules.filter((r) => r.lifecycle_state === "enabled");

  it("has enabled rules to check", () => {
    expect(enabledRules.length).toBeGreaterThan(0);
  });

  it("every enabled rule was enabled by a human who did not propose it", () => {
    for (const r of enabledRules) {
      expect(r.enabled_by, `${r.rule_id} has no enabled_by`).toBeTruthy();
      expect(r.enabled_by, `${r.rule_id} was enabled by its own proposer`).not.toBe(r.proposed_by);
      // enabled_by must be a real seeded user
      expect(store.users.some((u) => u.user_id === r.enabled_by), `${r.rule_id} enabled_by is not a seeded user`).toBe(true);
    }
  });

  it("every enabled rule carries a D3FEND mapping or an explicit unmapped marker", () => {
    for (const r of enabledRules) {
      const mapped = (r.d3fend_mapping?.length ?? 0) > 0;
      const unmapped = (r as { d3fend_unmapped?: boolean }).d3fend_unmapped === true;
      expect(mapped || unmapped, `${r.rule_id} has neither a d3fend_mapping nor d3fend_unmapped`).toBe(true);
    }
  });

  it("the seeded peer_review rule was proposed by an agent and never enabled", () => {
    const pr = store.correlationRules.filter((r) => r.lifecycle_state === "peer_review");
    expect(pr.length).toBeGreaterThan(0);
    for (const r of pr) {
      expect(r.proposed_by).toMatch(/agent/);
      expect(r.enabled_by).toBeFalsy();
    }
  });
});

describe("seed integrity — every native technique claim resolves to real telemetry", () => {
  const eventIds = new Set(store.normalizedEvents.map((e) => e.event_id));
  const nativeAlerts = store.alerts; // correlation output; third-party envelopes are separate and carry opaque refs

  it("has native alerts with technique claims", () => {
    const withClaims = nativeAlerts.filter((a) => (a.attack_techniques?.length ?? 0) > 0);
    expect(withClaims.length).toBeGreaterThan(0);
  });

  it("every contributing_event_ref on a native alert is a real normalized event", () => {
    const dangling: string[] = [];
    for (const a of nativeAlerts) {
      for (const t of a.attack_techniques ?? []) {
        expect(t.contributing_event_refs.length, `${a.envelope_id}/${t.technique_id} cites no events`).toBeGreaterThan(0);
        for (const ref of t.contributing_event_refs) {
          if (!eventIds.has(ref)) dangling.push(`${a.envelope_id}/${t.technique_id}: ${ref}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it("third-party envelopes are the only ones with opaque (unresolvable) refs", () => {
    for (const a of store.thirdPartyAlerts) {
      for (const t of a.attack_techniques ?? []) {
        // opaque by design — the SOC surface labels these "source-provided"
        expect(t.contributing_event_refs.every((r) => !eventIds.has(r))).toBe(true);
      }
    }
  });
});

describe("seed integrity — response", () => {
  const enabledPlaybooks = store.playbooks.filter((p) => p.lifecycle_state === "enabled");

  it("every enabled playbook has a human enabled_by who did not propose it", () => {
    expect(enabledPlaybooks.length).toBeGreaterThan(0);
    for (const p of enabledPlaybooks) {
      expect(p.enabled_by, `${p.playbook_id} has no enabled_by`).toBeTruthy();
      expect(p.enabled_by).not.toBe(p.proposed_by);
    }
  });

  it("every A2+ step in an enabled playbook carries a D3FEND mapping or an unmapped marker", () => {
    for (const p of enabledPlaybooks) {
      for (const s of p.steps) {
        if (!["A2", "A3", "A4"].includes(s.action_class)) continue;
        const ok = (s.d3fend_mapping?.length ?? 0) > 0 || s.d3fend_unmapped === true;
        expect(ok, `${p.playbook_id}/${s.step_id} (${s.action_class}) has no D3FEND treatment`).toBe(true);
      }
    }
  });

  it("the agent-proposed A4 playbook is stuck at peer_review", () => {
    const agentPb = store.playbooks.filter((p) => (p.proposed_by ?? "").includes("agent"));
    expect(agentPb.length).toBeGreaterThan(0);
    for (const p of agentPb) expect(p.lifecycle_state).not.toBe("enabled");
  });
});

describe("seed integrity — case & evidence custody", () => {
  it("every closed case has closed_at and a closure classification with closed_by", () => {
    const closed = store.cases.filter((c) => c.status === "closed");
    expect(closed.length).toBeGreaterThan(0);
    for (const c of closed) {
      expect(c.closed_at, `${c.case_id} closed with no closed_at`).toBeTruthy();
      expect(c.closure?.classification, `${c.case_id} closed with no classification`).toBeTruthy();
      expect(c.closure?.closed_by, `${c.case_id} closed with no closed_by`).toBeTruthy();
    }
  });

  it("every evidence item carries who / when / a content hash", () => {
    expect(store.caseEvidence.length).toBeGreaterThan(0);
    for (const e of store.caseEvidence) {
      expect(e.submitted_by, `${e.evidence_id} has no submitted_by`).toBeTruthy();
      expect(e.submitted_at, `${e.evidence_id} has no submitted_at`).toBeTruthy();
      expect(e.content_hash, `${e.evidence_id} has no content_hash`).toMatch(/^sha256:/);
    }
  });
});

describe("seed integrity — tenancy", () => {
  it("Assessment is not entitled for any tenant (Phase 2 dormant)", () => {
    for (const t of Object.values(TENANT_MAP)) {
      expect(t.entitlements.has_assessment).toBe(false);
    }
  });

  it("every seeded record's tenant_id is a known tenant", () => {
    const known = new Set(Object.keys(TENANT_MAP));
    const check = (rows: { tenant_id: string }[], label: string) => {
      for (const r of rows) expect(known.has(r.tenant_id), `${label}: unknown tenant ${r.tenant_id}`).toBe(true);
    };
    check(store.cases, "cases");
    check(store.socAlerts, "socAlerts");
    check(store.caseEvidence, "evidence");
    check(store.actionRequests, "actionRequests");
    check(store.correlationRules, "rules");
    check(store.playbooks, "playbooks");
  });
});
