import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@/schemas";
import { runHunt } from "./hunt";

const evalCtx = { familyOf: () => "windows" as const };

function ev(over: Partial<NormalizedEvent> & { event_id: string; occurred_at: string }): NormalizedEvent {
  return {
    tenant_id: "t1",
    telemetry_source_id: "ts",
    ingested_at: over.occurred_at,
    raw_payload_ref: "raw/x",
    normalization_status: "normalized",
    event_type: "process_start",
    ...over,
  } as NormalizedEvent;
}

const events = [
  ev({ event_id: "e1", occurred_at: "2026-08-27T10:00:00.000Z", entities: [{ entity_type: "host", value: "h1" }] }),
  ev({ event_id: "e2", occurred_at: "2026-08-27T11:00:00.000Z", entities: [{ entity_type: "host", value: "h2" }] }),
  ev({ event_id: "e3", occurred_at: "2026-08-20T11:00:00.000Z", entities: [{ entity_type: "host", value: "h1" }] }),
];

describe("runHunt", () => {
  it("returns matches within the window with breakdowns", () => {
    const r = runHunt(
      { query: 'entity.host:"h1"', fromIso: "2026-08-26T00:00:00.000Z", toIso: "2026-08-28T00:00:00.000Z" },
      events,
      evalCtx,
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.matched_count).toBe(1);
      expect(r.by_host[0]).toEqual({ key: "h1", count: 1 });
    }
  });

  it("rejects a window wider than 7 days", () => {
    const r = runHunt(
      { query: 'entity.host:"h1"', fromIso: "2026-08-01T00:00:00.000Z", toIso: "2026-08-28T00:00:00.000Z" },
      events,
      evalCtx,
    );
    expect(r).toMatchObject({ error: "window_too_wide" });
  });

  it("rejects an unsafe / malformed query without throwing", () => {
    const r = runHunt(
      { query: 'event_type:"x"; DROP TABLE events', fromIso: "2026-08-26T00:00:00.000Z", toIso: "2026-08-28T00:00:00.000Z" },
      events,
      evalCtx,
    );
    expect(r).toMatchObject({ error: "bad_query" });
  });

  it("excludes quarantined events unless asked", () => {
    const withBad = [...events, ev({ event_id: "eq", occurred_at: "2026-08-27T12:00:00.000Z", normalization_status: "quarantined", entities: [{ entity_type: "host", value: "h1" }] })];
    const a = runHunt({ query: 'entity.host:"h1"', fromIso: "2026-08-26T00:00:00.000Z", toIso: "2026-08-28T00:00:00.000Z" }, withBad, evalCtx);
    const b = runHunt({ query: 'entity.host:"h1"', fromIso: "2026-08-26T00:00:00.000Z", toIso: "2026-08-28T00:00:00.000Z", includeQuarantined: true }, withBad, evalCtx);
    if (!("error" in a) && !("error" in b)) expect(b.matched_count).toBe(a.matched_count + 1);
  });
});
