import { describe, expect, it } from "vitest";
import type { AlertEnvelope, Case, NormalizedEvent } from "@/schemas";
import { investigateCase } from "./investigation";

const evalCtx = { familyOf: () => "windows" as const };

const theCase: Case = {
  case_id: "case-1",
  tenant_id: "t1",
  title: "t",
  status: "investigating",
  owner_id: "u1",
  linked_alert_ids: ["a"],
  created_at: "2026-08-28T09:00:00.000Z",
};

const alert: AlertEnvelope = {
  envelope_id: "a",
  schema_version: "1.1",
  tenant_id: "t1",
  source: { system: "zenc-siem", connector_id: "c", health: "healthy" },
  source_alert_id: "sa",
  occurred_at: "2026-08-28T08:00:00.000Z",
  received_at: "2026-08-28T08:00:10.000Z",
  severity: "high",
  title: "Brute force",
  raw_payload_ref: "raw/a",
  entities: [{ entity_type: "host", value: "h1" }],
};

function ev(over: Partial<NormalizedEvent> & { event_id: string; occurred_at: string; tenant_id: string }): NormalizedEvent {
  return {
    telemetry_source_id: "ts",
    ingested_at: over.occurred_at,
    raw_payload_ref: "raw/x",
    normalization_status: "normalized",
    event_type: "authentication_failure",
    entities: [{ entity_type: "host", value: "h1" }],
    ...over,
  } as NormalizedEvent;
}

describe("investigateCase", () => {
  it("cites real event ids from the 24h window before the alert", () => {
    const events = [
      ev({ event_id: "in-1", tenant_id: "t1", occurred_at: "2026-08-28T02:00:00.000Z" }),
      ev({ event_id: "in-2", tenant_id: "t1", occurred_at: "2026-08-28T07:00:00.000Z" }),
      ev({ event_id: "too-old", tenant_id: "t1", occurred_at: "2026-08-26T00:00:00.000Z" }),
    ];
    const [finding] = investigateCase(theCase, [alert], events, evalCtx);
    expect(finding.matched_count).toBe(2);
    expect(finding.cited_event_ids).toEqual(expect.arrayContaining(["in-1", "in-2"]));
    expect(finding.cited_event_ids).not.toContain("too-old");
  });

  it("emits a finding even with zero matches (an investigative conclusion is still evidence)", () => {
    const [finding] = investigateCase(theCase, [alert], [], evalCtx);
    expect(finding.matched_count).toBe(0);
    expect(finding.summary).toMatch(/stands on the source/i);
  });

  it("the query is built from the safe field allowlist — never raw text", () => {
    const [finding] = investigateCase(theCase, [alert], [], evalCtx);
    expect(finding.query).toMatch(/^entity\.host:/);
  });
});
