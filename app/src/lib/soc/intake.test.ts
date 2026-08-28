import { describe, expect, it } from "vitest";
import type { AlertEnvelope } from "@/schemas";
import { envelopeRejectionReason, runIntake } from "./intake";

function env(over: Partial<AlertEnvelope> = {}): AlertEnvelope {
  return {
    envelope_id: "env-1",
    schema_version: "1.1",
    tenant_id: "t1",
    source: { system: "third-party-edr", connector_id: "c1", health: "healthy" },
    source_alert_id: "sa-1",
    occurred_at: "2026-08-28T09:00:00.000Z",
    received_at: "2026-08-28T09:00:20.000Z",
    severity: "high",
    title: "Something",
    raw_payload_ref: "raw/1",
    ...over,
  } as AlertEnvelope;
}

describe("envelopeRejectionReason", () => {
  it("accepts a well-formed 1.1 envelope", () => {
    expect(envelopeRejectionReason(env())).toBeNull();
  });

  it("accepts the previous and current schema versions", () => {
    expect(envelopeRejectionReason(env({ schema_version: "1.2" }))).toBeNull();
  });

  it("rejects an unsupported schema version without throwing", () => {
    const reason = envelopeRejectionReason({ ...env(), schema_version: "9.0" });
    expect(reason).toMatch(/unsupported schema_version/);
  });

  it("rejects a structurally invalid envelope", () => {
    expect(envelopeRejectionReason({ envelope_id: "x" })).toMatch(/schema invalid/);
  });
});

describe("runIntake", () => {
  it("quarantines a malformed envelope instead of dropping it", () => {
    const { items, accepted } = runIntake([env(), { ...env({ envelope_id: "env-bad" }), schema_version: "9.0" }], "t1");
    expect(accepted).toHaveLength(1);
    expect(items).toHaveLength(2);
    const bad = items.find((i) => i.envelope_id === "env-bad")!;
    expect(bad.disposition).toBe("quarantined");
    expect(bad.disposition_reason).toBeTruthy();
  });

  it("deduplicates by dedupe_key, first occurrence wins, keeps the repeat as a duplicate", () => {
    const a = env({ envelope_id: "env-a", dedupe_key: "k1" });
    const b = env({ envelope_id: "env-b", dedupe_key: "k1" });
    const { items, accepted } = runIntake([a, b], "t1");
    expect(accepted.map((x) => x.envelope_id)).toEqual(["env-a"]);
    const dup = items.find((i) => i.envelope_id === "env-b")!;
    expect(dup.disposition).toBe("duplicate");
    expect(dup.duplicate_of).toBe("env-a");
  });

  it("only processes envelopes for the requested tenant", () => {
    const { accepted } = runIntake([env({ envelope_id: "mine" }), env({ envelope_id: "other", tenant_id: "t2" })], "t1");
    expect(accepted.map((x) => x.envelope_id)).toEqual(["mine"]);
  });

  it("tags an unhealthy source", () => {
    const { items } = runIntake([env({ source: { system: "x", connector_id: "c", health: "degraded" } })], "t1");
    expect(items[0].source_unhealthy).toBe(true);
  });

  it("does not branch on source.system — a native and third-party envelope get the same disposition", () => {
    const native = env({ envelope_id: "n", schema_version: "1.2", source: { system: "zenc-siem", connector_id: "corr", health: "healthy" } });
    const third = env({ envelope_id: "tp", source: { system: "third-party-cloud-sec", connector_id: "c", health: "healthy" } });
    const { items } = runIntake([native, third], "t1");
    expect(items.map((i) => i.disposition)).toEqual(["accepted", "accepted"]);
  });
});
