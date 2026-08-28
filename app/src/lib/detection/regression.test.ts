import { describe, expect, it } from "vitest";
import { runRegression } from "./regression";
import { CORRELATION_RULES } from "@/data/correlation-rules";
import { getStore } from "@/mock/store";
import type { CorrelationContext } from "@/lib/correlation/engine";

/**
 * `references/testing-acceptance.md` → regression results must report events
 * evaluated, expected vs. observed, missed detections, unexpected matches, a
 * noise indicator, and a rule-health verdict — for every tested rule.
 */

const store = getStore();
const familyMap = new Map(store.telemetrySources.map((s) => [s.telemetry_source_id, s.family]));
const healthMap = new Map(store.telemetrySources.map((s) => [s.telemetry_source_id, s.health]));
const ctx: CorrelationContext = {
  familyOf: (id) => familyMap.get(id),
  healthOf: (id) => healthMap.get(id),
};
const NOW = "2026-08-28T12:00:00.000Z";

const bruteForce = CORRELATION_RULES.find((r) => r.rule_id === "rule-nwb-cred-brute-force")!;
const noisyPowershell = CORRELATION_RULES.find((r) => r.rule_id === "rule-nwb-powershell-download")!;

describe("runRegression", () => {
  it("reports every field the detection-engineering spec requires", () => {
    const r = runRegression(bruteForce, store.normalizedEvents, ctx, NOW);
    for (const k of [
      "events_evaluated",
      "expected_matches",
      "observed_matches",
      "missed_expected",
      "unexpected_matches",
      "noise_indicator",
      "execution_time_ms",
      "rule_health",
    ] as const) {
      expect(r[k], `missing ${k}`).not.toBeUndefined();
    }
    expect(r.events_evaluated).toBeGreaterThan(0);
    expect(["healthy", "needs_tuning", "failing"]).toContain(r.rule_health);
  });

  it("a rule that fires on its planted scenario comes back healthy with matched expectations", () => {
    const r = runRegression(bruteForce, store.normalizedEvents, ctx, NOW);
    expect(r.observed_matches).toBeGreaterThanOrEqual(r.expected_matches);
    expect(r.missed_expected).toBe(0);
    expect(r.rule_health).toBe("healthy");
  });

  it("a rule that expects matches but fires on nothing reports missed detections and a non-healthy verdict", () => {
    const r = runRegression(noisyPowershell, store.normalizedEvents, ctx, NOW);
    expect(r.expected_matches).toBeGreaterThan(0);
    expect(r.observed_matches).toBe(0);
    expect(r.missed_expected).toBe(r.expected_matches);
    expect(r.rule_health).not.toBe("healthy");
  });

  it("only evaluates the rule's own tenant's telemetry", () => {
    // the markets brute-force rule must not be scored against Northwind Bank events
    const nwm = CORRELATION_RULES.find((r) => r.rule_id === "rule-nwm-cred-brute-force")!;
    const r = runRegression(nwm, store.normalizedEvents, ctx, NOW);
    const nwmEvents = store.normalizedEvents.filter(
      (e) => e.tenant_id === "tenant-northwind-markets" && e.normalization_status === "normalized",
    ).length;
    expect(r.events_evaluated).toBe(nwmEvents);
  });

  it("is deterministic — identical inputs produce an identical result", () => {
    const a = runRegression(bruteForce, store.normalizedEvents, ctx, NOW);
    const b = runRegression(bruteForce, store.normalizedEvents, ctx, NOW);
    expect(a).toEqual(b);
  });
});
