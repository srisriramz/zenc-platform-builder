import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alertEnvelopeSchema,
  auditEventSchema,
  correlationRuleSchema,
  normalizedEventSchema,
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
});
