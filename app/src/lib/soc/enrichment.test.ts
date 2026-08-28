import { describe, expect, it } from "vitest";
import type { AlertEnvelope, Case } from "@/schemas";
import { enrichCase } from "./enrichment";

function caseFixture(over: Partial<Case> = {}): Case {
  return {
    case_id: "case-1",
    tenant_id: "tenant-summit-cu",
    title: "t",
    status: "investigating",
    owner_id: "user-priya-analyst",
    linked_alert_ids: ["a"],
    created_at: "2026-08-28T09:00:00.000Z",
    ...over,
  } as Case;
}

function alert(over: Partial<AlertEnvelope> = {}): AlertEnvelope {
  return {
    envelope_id: "a",
    schema_version: "1.1",
    tenant_id: "tenant-summit-cu",
    source: { system: "third-party-edr", connector_id: "c", health: "healthy" },
    source_alert_id: "sa",
    occurred_at: "2026-08-28T08:00:00.000Z",
    received_at: "2026-08-28T08:00:10.000Z",
    severity: "critical",
    title: "x",
    raw_payload_ref: "raw/x",
    ...over,
  } as AlertEnvelope;
}

describe("enrichCase", () => {
  it("resolves a known host to its asset and flags criticality", () => {
    const a = alert({ entities: [{ entity_type: "host", value: "scu-fs-02" }] });
    const r = enrichCase(caseFixture(), [a], [a], [], "2026-08-28T12:00:00.000Z");
    const host = r.entities.find((e) => e.entity.value === "scu-fs-02")!;
    expect(host.asset?.criticality).toBe("critical");
    expect(r.notable.some((n) => n.includes("critical file server"))).toBe(true);
  });

  it("flags a privileged service account without MFA", () => {
    const a = alert({ entities: [{ entity_type: "user", value: "scu-svc-fileshare" }] });
    const r = enrichCase(caseFixture(), [a], [a], [], "2026-08-28T12:00:00.000Z");
    expect(r.notable.some((n) => n.includes("no MFA"))).toBe(true);
  });

  it("is deterministic for TI reputation", () => {
    const a = alert({ entities: [{ entity_type: "ip", value: "203.0.113.201" }] });
    const one = enrichCase(caseFixture(), [a], [a], [], "2026-08-28T12:00:00.000Z");
    const two = enrichCase(caseFixture(), [a], [a], [], "2026-08-28T12:00:00.000Z");
    expect(one.entities[0].ti).toEqual(two.entities[0].ti);
  });

  it("counts prior sightings from other alerts and cases", () => {
    const linked = alert({ envelope_id: "a", entities: [{ entity_type: "user", value: "scu-teller-14" }] });
    const prior = alert({ envelope_id: "b", entities: [{ entity_type: "user", value: "scu-teller-14" }] });
    const otherCase = caseFixture({ case_id: "case-2", linked_alert_ids: ["b"] });
    const r = enrichCase(caseFixture(), [linked], [linked, prior], [otherCase], "2026-08-28T12:00:00.000Z");
    const u = r.entities.find((e) => e.entity.value === "scu-teller-14")!;
    expect(u.prior_alert_count).toBe(1);
    expect(u.prior_case_count).toBe(1);
  });

  it("never modifies the case (returns a fresh result object only)", () => {
    const c = caseFixture();
    const a = alert({ entities: [{ entity_type: "host", value: "scu-fs-02" }] });
    enrichCase(c, [a], [a], [], "2026-08-28T12:00:00.000Z");
    expect(c.status).toBe("investigating");
    expect(c).not.toHaveProperty("enrichment");
  });
});
