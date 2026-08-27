import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@/schemas";
import { parseQuery, type QueryNode } from "./parser";
import { matchEvent, runQuery, type EvalContext } from "./evaluate";

const ctx: EvalContext = {
  familyOf: (id) => (id === "ts-fw" ? "firewall" : id === "ts-win" ? "windows" : undefined),
};

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event_id: "e1",
    tenant_id: "t1",
    telemetry_source_id: "ts-win",
    occurred_at: "2026-08-28T10:00:00Z",
    ingested_at: "2026-08-28T10:00:05Z",
    event_type: "windows_security_4625",
    entities: [
      { entity_type: "host", value: "web-01" },
      { entity_type: "user", value: "svc-backup" },
      { entity_type: "ip", value: "203.0.113.9" },
    ],
    attack_technique_refs: ["T1110"],
    raw_payload_ref: "raw/1",
    normalization_status: "normalized",
    ...partial,
  };
}

function ast(q: string): QueryNode | null {
  const r = parseQuery(q);
  if (!r.ok) throw new Error(r.message);
  return r.ast;
}

describe("matchEvent — operators", () => {
  const e = ev({});

  it("eq on a direct field (case-insensitive)", () => {
    expect(matchEvent(ast("event_type:WINDOWS_SECURITY_4625"), e, ctx)).toBe(true);
    expect(matchEvent(ast("event_type:something_else"), e, ctx)).toBe(false);
  });

  it("eq on an entity array member", () => {
    expect(matchEvent(ast("entity.user:svc-backup"), e, ctx)).toBe(true);
    expect(matchEvent(ast("entity.user:administrator"), e, ctx)).toBe(false);
  });

  it("neq is true only when the field is present and does not match", () => {
    expect(matchEvent(ast("entity.user != root"), e, ctx)).toBe(true);
    expect(matchEvent(ast("entity.domain != anything"), e, ctx)).toBe(false); // absent → not a match
  });

  it("exists", () => {
    expect(matchEvent(ast("attack_technique_refs:exists"), e, ctx)).toBe(true);
    expect(matchEvent(ast("attack_technique_refs:exists"), ev({ attack_technique_refs: undefined }), ctx)).toBe(false);
  });

  it("wildcard", () => {
    expect(matchEvent(ast("entity.host ~ web-*"), e, ctx)).toBe(true);
    expect(matchEvent(ast("entity.host ~ db-*"), e, ctx)).toBe(false);
  });

  it("datetime comparisons", () => {
    expect(matchEvent(ast('occurred_at >= "2026-08-28T09:00:00Z"'), e, ctx)).toBe(true);
    expect(matchEvent(ast('occurred_at < "2026-08-28T09:00:00Z"'), e, ctx)).toBe(false);
  });

  it("source.family via the resolver", () => {
    expect(matchEvent(ast("source.family:windows"), e, ctx)).toBe(true);
    expect(matchEvent(ast("source.family:firewall"), e, ctx)).toBe(false);
  });
});

describe("matchEvent — boolean composition", () => {
  const e = ev({});
  it("AND", () => {
    expect(matchEvent(ast("entity.user:svc-backup AND source.family:windows"), e, ctx)).toBe(true);
    expect(matchEvent(ast("entity.user:svc-backup AND source.family:firewall"), e, ctx)).toBe(false);
  });
  it("OR", () => {
    expect(matchEvent(ast("source.family:firewall OR entity.user:svc-backup"), e, ctx)).toBe(true);
  });
  it("NOT", () => {
    expect(matchEvent(ast("NOT normalization_status:quarantined"), e, ctx)).toBe(true);
    expect(matchEvent(ast("NOT normalization_status:quarantined"), ev({ normalization_status: "quarantined", quarantine_reason: "x" }), ctx)).toBe(false);
  });
  it("free-text substring across indexed fields", () => {
    expect(matchEvent(ast("svc-backup"), e, ctx)).toBe(true);
    expect(matchEvent(ast("nonexistent-token"), e, ctx)).toBe(false);
  });
  it("match-all when ast is null", () => {
    expect(matchEvent(null, e, ctx)).toBe(true);
  });
});

describe("runQuery", () => {
  const events: NormalizedEvent[] = [
    ev({ event_id: "a", occurred_at: "2026-08-28T11:00:00Z" }),
    ev({ event_id: "b", occurred_at: "2026-08-28T10:00:00Z" }),
    ev({ event_id: "c", occurred_at: "2026-08-20T10:00:00Z" }), // outside a 24h window
  ];
  const window = { fromIso: "2026-08-27T12:00:00Z", toIso: "2026-08-28T12:00:00Z" };

  it("filters to the time window and sorts newest first", () => {
    const r = runQuery(events, null, ctx, { timeRange: window });
    if ("error" in r) throw new Error(r.error);
    expect(r.rows.map((e) => e.event_id)).toEqual(["a", "b"]);
    expect(r.scannedCount).toBe(2);
    expect(r.totalMatched).toBe(2);
  });

  it("applies the row limit and reports truncation", () => {
    const r = runQuery(events, null, ctx, { timeRange: window, limit: 1 });
    if ("error" in r) throw new Error(r.error);
    expect(r.rows).toHaveLength(1);
    expect(r.truncated).toBe(true);
    expect(r.totalMatched).toBe(2);
  });

  it("rejects a time range wider than the cap", () => {
    const r = runQuery(events, null, ctx, { timeRange: { fromIso: "2026-01-01T00:00:00Z", toIso: "2026-08-28T00:00:00Z" } });
    expect("error" in r && r.error).toBe("time_range_too_wide");
  });

  it("rejects a missing/invalid time range", () => {
    const r = runQuery(events, null, ctx, { timeRange: { fromIso: "nope", toIso: "nope" } });
    expect("error" in r && r.error).toBe("no_time_range");
  });
});
