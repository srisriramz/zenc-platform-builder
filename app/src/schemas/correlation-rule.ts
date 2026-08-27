import { z } from "zod";
import { isoDateTime, severity } from "./common";

/**
 * Mirrors schemas/correlation-rule.schema.json.
 * Deterministic — no LLM decides whether a rule matches. Lifecycle is
 * identical in shape to the SOC playbook lifecycle by design. A rule reaches
 * `enabled` only via a human principal (`enabled_by`), never an agent.
 * Fully exercised in milestone M2 / M3; the shape is fixed here so the
 * detection-coverage staging in M1 can reference it.
 */
export const ruleLifecycleState = z.enum([
  "draft",
  "test",
  "peer_review",
  "approved",
  "enabled",
  "disabled",
  "retired",
]);
export type RuleLifecycleState = z.infer<typeof ruleLifecycleState>;

export const ruleType = z.enum([
  "single_event",
  "sequence",
  "threshold",
  "aggregation",
  "field_join",
  "entity_join",
  "time_window",
  "suppression",
]);

export const attackMappingEntry = z.object({
  tactic: z.string(),
  technique_id: z.string(),
  technique_name: z.string(),
  sub_technique_id: z.string().optional(),
});

export const d3fendMappingEntry = z.object({
  d3fend_technique_id: z.string(),
  d3fend_technique_name: z.string(),
  category: z.string(),
});

export const regressionTestResult = z.object({
  run_at: isoDateTime,
  corpus_id: z.string().optional(),
  events_evaluated: z.number().int(),
  expected_matches: z.number().int(),
  observed_matches: z.number().int(),
  missed_expected: z.number().int(),
  unexpected_matches: z.number().int(),
  noise_indicator: z.number().optional(),
  execution_time_ms: z.number().optional(),
  rule_health: z.enum(["healthy", "needs_tuning", "failing"]),
});

export const correlationRuleSchema = z
  .object({
    rule_id: z.string(),
    tenant_id: z.string(),
    name: z.string(),
    version: z.string(),
    lifecycle_state: ruleLifecycleState,
    proposed_by: z.string().optional(),
    enabled_by: z.string().optional(),
    rule_type: ruleType,
    definition: z.record(z.string(), z.unknown()).optional(),
    severity: severity.optional(),
    attack_mapping: z.array(attackMappingEntry).min(1),
    d3fend_mapping: z.array(d3fendMappingEntry).optional(),
    d3fend_unmapped: z.boolean().optional(),
    regression_test_results: z.array(regressionTestResult).optional(),
    history: z
      .array(
        z.object({
          from_state: z.string(),
          to_state: z.string(),
          changed_by: z.string(),
          changed_at: isoDateTime,
        }),
      )
      .optional(),
  })
  .refine(
    (r) =>
      r.lifecycle_state !== "enabled" ||
      (r.d3fend_mapping && r.d3fend_mapping.length > 0) ||
      r.d3fend_unmapped === true,
    { message: "an enabled rule needs a D3FEND mapping or an explicit d3fend_unmapped flag" },
  )
  .refine((r) => r.lifecycle_state !== "enabled" || !!r.enabled_by, {
    message: "an enabled rule must record the human principal in enabled_by",
    path: ["enabled_by"],
  });
export type CorrelationRule = z.infer<typeof correlationRuleSchema>;
