import { describe, expect, it } from "vitest";
import type { AlertEnvelope } from "@/schemas";
import { groupIntoCases } from "./grouping";

function env(over: Partial<AlertEnvelope> & { envelope_id: string; occurred_at: string }): AlertEnvelope {
  return {
    schema_version: "1.1",
    tenant_id: "t1",
    source: { system: "third-party-edr", connector_id: "c1", health: "healthy" },
    source_alert_id: `sa-${over.envelope_id}`,
    received_at: over.occurred_at,
    severity: "medium",
    title: over.envelope_id,
    raw_payload_ref: "raw/x",
    ...over,
  } as AlertEnvelope;
}

describe("groupIntoCases", () => {
  it("groups two alerts sharing a user within the window and a technique", () => {
    const a = env({
      envelope_id: "a",
      occurred_at: "2026-08-28T09:00:00.000Z",
      entities: [{ entity_type: "user", value: "alice" }],
      attack_techniques: [{ tactic: "Initial Access", technique_id: "T1078", technique_name: "Valid Accounts", contributing_event_refs: ["x"] }],
    });
    const b = env({
      envelope_id: "b",
      occurred_at: "2026-08-28T11:00:00.000Z",
      severity: "high",
      entities: [{ entity_type: "user", value: "alice" }],
      attack_techniques: [{ tactic: "Persistence", technique_id: "T1078", technique_name: "Valid Accounts", contributing_event_refs: ["y"] }],
    });
    const [candidate, ...rest] = groupIntoCases([a, b], "t1");
    expect(rest).toHaveLength(0);
    expect(candidate.envelope_ids).toEqual(["a", "b"]);
    expect(candidate.max_severity).toBe("high");
    expect(candidate.techniques.map((t) => t.technique_id)).toEqual(["T1078"]);
  });

  it("does not group alerts outside the time window", () => {
    const a = env({ envelope_id: "a", occurred_at: "2026-08-28T00:00:00.000Z", entities: [{ entity_type: "user", value: "bob" }] });
    const b = env({ envelope_id: "b", occurred_at: "2026-08-28T18:00:00.000Z", entities: [{ entity_type: "user", value: "bob" }] });
    expect(groupIntoCases([a, b], "t1")).toHaveLength(2);
  });

  it("does not group alerts with no shared entity", () => {
    const a = env({ envelope_id: "a", occurred_at: "2026-08-28T09:00:00.000Z", entities: [{ entity_type: "host", value: "h1" }] });
    const b = env({ envelope_id: "b", occurred_at: "2026-08-28T09:30:00.000Z", entities: [{ entity_type: "host", value: "h2" }] });
    expect(groupIntoCases([a, b], "t1")).toHaveLength(2);
  });

  it("keeps a lone alert as its own candidate", () => {
    const a = env({ envelope_id: "solo", occurred_at: "2026-08-28T09:00:00.000Z", entities: [{ entity_type: "ip", value: "203.0.113.1" }] });
    const [c] = groupIntoCases([a], "t1");
    expect(c.envelope_ids).toEqual(["solo"]);
    expect(c.grouping_rationale).toMatch(/single alert/);
  });

  it("is deterministic and order-independent", () => {
    const a = env({ envelope_id: "a", occurred_at: "2026-08-28T09:00:00.000Z", entities: [{ entity_type: "user", value: "u" }] });
    const b = env({ envelope_id: "b", occurred_at: "2026-08-28T10:00:00.000Z", entities: [{ entity_type: "user", value: "u" }] });
    const one = groupIntoCases([a, b], "t1");
    const two = groupIntoCases([b, a], "t1");
    expect(one).toEqual(two);
  });
});
