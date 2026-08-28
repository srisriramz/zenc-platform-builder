import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alertEnvelopeSchema,
  auditEventSchema,
  caseSchema,
  correlationRuleSchema,
  evidenceSchema,
  normalizedEventSchema,
  taskSchema,
  telemetrySourceSchema,
} from "./index";

/** Load a fixture from the repo-root `examples/` directory. */
function example(name: string): unknown {
  const url = new URL(`../../../examples/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

describe("Zod schemas accept the repo's example fixtures", () => {
  const cases: [string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }][] = [
    ["sample-telemetry-source.json", telemetrySourceSchema],
    ["sample-normalized-event.json", normalizedEventSchema],
    ["sample-alert-envelope.json", alertEnvelopeSchema],
    ["sample-correlation-rule.json", correlationRuleSchema],
    ["sample-audit-event.json", auditEventSchema],
    ["sample-case.json", caseSchema],
    ["sample-evidence.json", evidenceSchema],
    ["sample-task.json", taskSchema],
  ];

  for (const [file, schema] of cases) {
    it(`${file} validates`, () => {
      const result = schema.safeParse(example(file));
      if (!result.success) console.error(file, result.error);
      expect(result.success).toBe(true);
    });
  }
});

describe("schema refinements enforce the non-negotiable invariants", () => {
  const alert = example("sample-alert-envelope.json") as Record<string, unknown>;
  const rule = example("sample-correlation-rule.json") as Record<string, unknown>;
  const nevent = example("sample-normalized-event.json") as Record<string, unknown>;

  it("an ATT&CK technique claim with no contributing_event_refs is rejected", () => {
    const broken = {
      ...alert,
      attack_techniques: [{ tactic: "execution", technique_id: "T1059", technique_name: "x", contributing_event_refs: [] }],
    };
    expect(alertEnvelopeSchema.safeParse(broken).success).toBe(false);
  });

  it("a quarantined envelope without a reason is rejected", () => {
    expect(alertEnvelopeSchema.safeParse({ ...alert, validation_status: "quarantined" }).success).toBe(false);
  });

  it("accepts a v1.2 envelope with correlated_at / confidence / sector_tags", () => {
    const v12 = {
      ...alert,
      schema_version: "1.2",
      correlated_at: "2026-08-20T03:14:30Z",
      confidence: 0.7,
      sector_tags: ["BFSI"],
    };
    expect(alertEnvelopeSchema.safeParse(v12).success).toBe(true);
  });

  it("rejects an out-of-range confidence", () => {
    expect(alertEnvelopeSchema.safeParse({ ...alert, schema_version: "1.2", confidence: 1.5 }).success).toBe(false);
  });

  it("an enabled rule with no D3FEND mapping and no d3fend_unmapped is rejected", () => {
    const { d3fend_mapping, ...rest } = rule;
    void d3fend_mapping;
    expect(correlationRuleSchema.safeParse(rest).success).toBe(false);
  });

  it("an enabled rule with no enabled_by (human principal) is rejected", () => {
    const { enabled_by, ...rest } = rule;
    void enabled_by;
    expect(correlationRuleSchema.safeParse(rest).success).toBe(false);
  });

  it("an enabled rule IS accepted once d3fend_unmapped is explicitly set", () => {
    const { d3fend_mapping, ...rest } = rule;
    void d3fend_mapping;
    expect(correlationRuleSchema.safeParse({ ...rest, d3fend_unmapped: true }).success).toBe(true);
  });

  it("a quarantined normalized event without a reason is rejected", () => {
    expect(normalizedEventSchema.safeParse({ ...nevent, normalization_status: "quarantined" }).success).toBe(false);
  });

  it("an unknown telemetry family is rejected", () => {
    const src = example("sample-telemetry-source.json") as Record<string, unknown>;
    expect(telemetrySourceSchema.safeParse({ ...src, family: "carrier_pigeon" }).success).toBe(false);
  });

  it("a closed case with no closure classification is rejected", () => {
    const c = example("sample-case.json") as Record<string, unknown>;
    const { closure, ...rest } = c;
    void closure;
    expect(caseSchema.safeParse(rest).success).toBe(false);
  });

  it("a suppressed case closure with no documented reason is rejected", () => {
    const c = example("sample-case.json") as Record<string, unknown>;
    expect(
      caseSchema.safeParse({ ...c, closure: { classification: "suppressed", closed_by: "u1" } }).success,
    ).toBe(false);
  });

  it("SOC-origin evidence must link to a case", () => {
    const e = example("sample-evidence.json") as Record<string, unknown>;
    expect(evidenceSchema.safeParse({ ...e, origin: "soc", linked_case_id: undefined }).success).toBe(false);
  });

  it("approved evidence with no reviewer is rejected", () => {
    const e = example("sample-evidence.json") as Record<string, unknown>;
    const { reviewer_id, reviewed_at, ...rest } = e;
    void reviewer_id;
    void reviewed_at;
    expect(evidenceSchema.safeParse(rest).success).toBe(false);
  });

  it("a done task with no completed_by is rejected", () => {
    const t = example("sample-task.json") as Record<string, unknown>;
    const { completed_by, ...rest } = t;
    void completed_by;
    expect(taskSchema.safeParse(rest).success).toBe(false);
  });
});
