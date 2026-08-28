/**
 * Regression test for a correlation rule: re-run the deterministic engine for
 * just this rule against the ~72h normalized sample (that IS the synthetic
 * corpus) and report the fields the detection-engineering spec requires.
 *
 * This is a workflow/telemetry exercise, not a detection-quality oracle — a
 * rule matching in test does not prove it's a good rule, and the health
 * verdict says so when the result is ambiguous.
 */
import type { NormalizedEvent, RegressionTestResult } from "@/schemas";
import type { SeededRule } from "@/data/correlation-rules";
import { hashString } from "@/lib/prng";
import { runCorrelation, type CorrelationContext } from "@/lib/correlation/engine";

export function runRegression(
  rule: SeededRule,
  sample: NormalizedEvent[],
  ctx: CorrelationContext,
  now: string,
): RegressionTestResult {
  const tenantSample = sample.filter((e) => e.tenant_id === rule.tenant_id);
  const [firing] = runCorrelation(tenantSample, [{ ...rule, lifecycle_state: "enabled" }], ctx);
  const alerts = firing?.alerts ?? [];

  const observed = alerts.length;
  const expected = rule.expected_test_matches ?? observed;

  // alerts whose contributing events are entirely from the planted scenarios
  // are "true"; an alert with no scenario events on a scenario-driven rule is
  // treated as an unexpected match (noise).
  const scenarioRule = expected > 0 && rule.expected_test_matches != null;
  const noScenarioAlerts = scenarioRule
    ? alerts.filter((a) => !(a.attack_techniques ?? []).some((t) => t.contributing_event_refs.some((r) => r.startsWith("nevt-scn-")))).length
    : 0;

  const missed = Math.max(0, expected - observed);
  const unexpected = Math.max(0, observed - expected) + noScenarioAlerts;
  const noise = unexpected / Math.max(1, observed);

  const health: RegressionTestResult["rule_health"] =
    missed > expected / 2
      ? "failing"
      : noise > 0.25 || (expected > 0 && observed === 0)
        ? "needs_tuning"
        : "healthy";

  return {
    run_at: now,
    corpus_id: `corpus-${rule.tenant_id.replace("tenant-", "")}-sample-72h`,
    events_evaluated: tenantSample.filter((e) => e.normalization_status === "normalized").length,
    expected_matches: expected,
    observed_matches: observed,
    missed_expected: missed,
    unexpected_matches: unexpected,
    noise_indicator: Math.round(noise * 100) / 100,
    execution_time_ms: 30 + (hashString(rule.rule_id + rule.version) % 380),
    rule_health: health,
  };
}
