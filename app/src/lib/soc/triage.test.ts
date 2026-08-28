import { describe, expect, it } from "vitest";
import type { AlertEnvelope } from "@/schemas";
import type { CaseCandidate } from "./types";
import { triageCandidate } from "./triage";

function candidate(over: Partial<CaseCandidate> = {}): CaseCandidate {
  return {
    candidate_id: "cand-1",
    tenant_id: "t1",
    envelope_ids: ["a"],
    entities: [{ entity_type: "user", value: "alice" }],
    techniques: [{ technique_id: "T1078", technique_name: "Valid Accounts", tactic: "Initial Access" }],
    first_occurred_at: "2026-08-28T09:00:00.000Z",
    last_occurred_at: "2026-08-28T09:00:00.000Z",
    max_severity: "high",
    grouping_rationale: "test",
    ...over,
  };
}

function alert(over: Partial<AlertEnvelope> = {}): AlertEnvelope {
  return {
    envelope_id: "a",
    schema_version: "1.1",
    tenant_id: "t1",
    source: { system: "third-party-edr", connector_id: "c", health: "healthy" },
    source_alert_id: "sa",
    occurred_at: "2026-08-28T09:00:00.000Z",
    received_at: "2026-08-28T09:00:10.000Z",
    severity: "high",
    title: "x",
    raw_payload_ref: "raw/x",
    confidence: 0.8,
    ...over,
  } as AlertEnvelope;
}

describe("triageCandidate", () => {
  it("recommends opening a corroborated high-severity candidate and picks an owner", () => {
    const c = candidate({ envelope_ids: ["a", "b"] });
    const r = triageCandidate(c, [alert({ envelope_id: "a" }), alert({ envelope_id: "b" })], ["user-priya-analyst"]);
    expect(r.recommendation).toBe("open");
    expect(r.recommended_owner_id).toBe("user-priya-analyst");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("recommends suppressing a lone low-severity alert from a degraded source with no technique", () => {
    const c = candidate({ max_severity: "low", techniques: [] });
    const r = triageCandidate(
      c,
      [alert({ severity: "low", source: { system: "x", connector_id: "c", health: "degraded" }, confidence: 0.3 })],
      ["user-priya-analyst"],
    );
    expect(r.recommendation).toBe("suppress");
    expect(r.recommended_owner_id).toBeNull();
    expect(r.contradictory.length).toBeGreaterThan(0);
  });

  it("never recommends suppressing a corroborated candidate", () => {
    const c = candidate({ max_severity: "low", techniques: [], envelope_ids: ["a", "b"] });
    const r = triageCandidate(c, [alert({ envelope_id: "a", severity: "low" }), alert({ envelope_id: "b", severity: "low" })], []);
    expect(r.recommendation).toBe("open");
  });

  it("is deterministic", () => {
    const c = candidate();
    const a = [alert()];
    expect(triageCandidate(c, a, ["u1", "u2"])).toEqual(triageCandidate(c, a, ["u1", "u2"]));
  });
});
