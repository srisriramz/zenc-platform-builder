import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@/schemas";
import { alertEnvelopeSchema } from "@/schemas";
import type { SeededRule } from "@/data/correlation-rules";
import { runCorrelation, type CorrelationContext } from "./engine";

const ctx: CorrelationContext = { familyOf: () => "windows", healthOf: () => "healthy" };

function ev(p: Partial<NormalizedEvent> & { event_type: string; occurred_at: string }): NormalizedEvent {
  return {
    event_id: `e-${p.event_type}-${p.occurred_at}-${Math.random().toString(36).slice(2, 6)}`,
    tenant_id: "t1",
    telemetry_source_id: "ts",
    ingested_at: p.occurred_at,
    raw_payload_ref: "raw/x",
    normalization_status: "normalized",
    ...p,
  };
}

const baseRule = (over: Partial<SeededRule>): SeededRule => ({
  rule_id: "r1",
  tenant_id: "t1",
  name: "R",
  version: "1.0.0",
  lifecycle_state: "enabled",
  enabled_by: "user-x",
  rule_type: "threshold",
  severity: "high",
  confidence: 0.7,
  attack_mapping: [{ tactic: "Credential Access", technique_id: "T1110", technique_name: "Brute Force" }],
  d3fend_mapping: [{ d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis", category: "Detect" }],
  definition: { kind: "single_event", match: {} },
  alert_title: "T",
  alert_summary: () => "s",
  ...over,
});

describe("runCorrelation", () => {
  it("only fires enabled rules", () => {
    const rules = [
      baseRule({ rule_id: "on", lifecycle_state: "enabled", definition: { kind: "single_event", match: { event_type: ["x"] } } }),
      baseRule({ rule_id: "review", lifecycle_state: "peer_review", definition: { kind: "single_event", match: { event_type: ["x"] } } }),
    ];
    const events = [ev({ event_type: "x", occurred_at: "2026-08-28T10:00:00Z", entities: [{ entity_type: "user", value: "u" }] })];
    const firings = runCorrelation(events, rules, ctx);
    expect(firings.map((f) => f.rule.rule_id)).toEqual(["on"]);
  });

  it("threshold: fires once per group key when the count is met inside the window", () => {
    const rule = baseRule({
      rule_type: "threshold",
      definition: { kind: "threshold", match: { event_type: ["fail"] }, group_by: "entity.ip", threshold: 3, window_seconds: 300 },
    });
    const ip = (v: string) => ({ entity_type: "ip" as const, value: v });
    const events = [
      ev({ event_type: "fail", occurred_at: "2026-08-28T10:00:00Z", entities: [ip("1.1.1.1")] }),
      ev({ event_type: "fail", occurred_at: "2026-08-28T10:01:00Z", entities: [ip("1.1.1.1")] }),
      ev({ event_type: "fail", occurred_at: "2026-08-28T10:02:00Z", entities: [ip("1.1.1.1")] }),
      ev({ event_type: "fail", occurred_at: "2026-08-28T10:20:00Z", entities: [ip("2.2.2.2")] }), // below threshold
    ];
    const [firing] = runCorrelation(events, [rule], ctx);
    expect(firing.alerts).toHaveLength(1);
    expect(firing.alerts[0].attack_techniques?.[0].contributing_event_refs.length).toBe(3);
  });

  it("every produced alert validates against alert-envelope v1.2 and cites contributing events", () => {
    const rule = baseRule({ definition: { kind: "single_event", match: { event_type: ["guardrail_off"] } } });
    const events = [
      ev({ event_type: "guardrail_off", occurred_at: "2026-08-28T03:00:00Z", entities: [{ entity_type: "user", value: "svc" }] }),
    ];
    const [firing] = runCorrelation(events, [rule], ctx);
    const alert = firing.alerts[0];
    expect(alertEnvelopeSchema.safeParse(alert).success).toBe(true);
    expect(alert.schema_version).toBe("1.2");
    expect(alert.correlated_at).toBeTruthy();
    expect(Date.parse(alert.correlated_at!)).toBeGreaterThanOrEqual(Date.parse(alert.occurred_at));
    for (const t of alert.attack_techniques ?? []) {
      expect(t.contributing_event_refs.length).toBeGreaterThan(0);
      expect(t.source_rule_id).toBe(rule.rule_id);
    }
  });

  it("is deterministic — same input, same envelope ids", () => {
    const rule = baseRule({ definition: { kind: "single_event", match: { event_type: ["x"] } } });
    const mk = () => [ev({ event_id: "fixed", event_type: "x", occurred_at: "2026-08-28T10:00:00Z", entities: [{ entity_type: "user", value: "u" }] })];
    const a = runCorrelation(mk().map((e) => ({ ...e, event_id: "fixed" })), [rule], ctx)[0].alerts[0];
    const b = runCorrelation(mk().map((e) => ({ ...e, event_id: "fixed" })), [rule], ctx)[0].alerts[0];
    expect(a.envelope_id).toBe(b.envelope_id);
    expect(a.dedupe_key).toBe(b.dedupe_key);
  });

  it("sequence: step 2 must follow step 1 within the window, joined by entity", () => {
    const rule = baseRule({
      rule_type: "sequence",
      definition: {
        kind: "sequence",
        steps: [{ match: { event_type: ["fail"] } }, { match: { event_type: ["ok"] } }],
        join_by: "entity.user",
        within_seconds: 600,
      },
    });
    const u = { entity_type: "user" as const, value: "alice" };
    const hit = runCorrelation(
      [
        ev({ event_type: "fail", occurred_at: "2026-08-28T10:00:00Z", entities: [u] }),
        ev({ event_type: "ok", occurred_at: "2026-08-28T10:05:00Z", entities: [u] }),
      ],
      [rule],
      ctx,
    )[0];
    expect(hit.alerts).toHaveLength(1);

    const miss = runCorrelation(
      [
        ev({ event_type: "fail", occurred_at: "2026-08-28T10:00:00Z", entities: [u] }),
        ev({ event_type: "ok", occurred_at: "2026-08-28T10:30:00Z", entities: [u] }), // outside window
      ],
      [rule],
      ctx,
    )[0];
    expect(miss.alerts).toHaveLength(0);
  });
});
