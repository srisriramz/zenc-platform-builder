import { describe, expect, it } from "vitest";
import type { AttackTactic, AttackTechnique } from "@/data/frameworks/attack";
import { buildCoverageMatrix, type CoverageInputs } from "./matrix";

const tactics: AttackTactic[] = [
  { tactic_id: "TA0006", name: "Credential Access", shortname: "credential-access", order: 6 },
  { tactic_id: "TA0002", name: "Execution", shortname: "execution", order: 2 },
];

const techniques: AttackTechnique[] = [
  { technique_id: "T1110", name: "Brute Force", tactic_shortnames: ["credential-access"], is_sub_technique: false, description: "", data_source_families: ["identity"] },
  { technique_id: "T1110.001", name: "Password Guessing", tactic_shortnames: ["credential-access"], is_sub_technique: true, parent_technique_id: "T1110", description: "", data_source_families: ["identity"] },
  { technique_id: "T1059", name: "Command Interpreter", tactic_shortnames: ["execution"], is_sub_technique: false, description: "", data_source_families: ["windows"] },
  { technique_id: "T1486", name: "Data Encrypted for Impact", tactic_shortnames: ["execution"], is_sub_technique: false, description: "", data_source_families: ["windows"] },
];

function inputs(over: Partial<CoverageInputs> = {}): CoverageInputs {
  return {
    techniques,
    tactics,
    connectedFamilies: new Set(["identity", "windows"]),
    liveFamilies: new Set(["identity", "windows"]),
    observedTechniqueIds: new Set(["T1059"]),
    enabledRules: [{ rule_id: "r1", name: "Brute force", attack_mapping: [{ technique_id: "T1110" }], d3fend_mapping: [{ d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis" }] }],
    firedRuleIds: new Set(["r1"]),
    enabledPlaybooks: [
      { playbook_id: "pb1", name: "Contain endpoint", applies_to_techniques: ["T1486"], steps: [{ d3fend_mapping: [{ d3fend_technique_id: "D3-NI", d3fend_technique_name: "Network Isolation" }] }] },
      { playbook_id: "pb-noresp", name: "No response step", applies_to_techniques: ["T1059"], steps: [{}] },
    ],
    ...over,
  };
}

describe("buildCoverageMatrix", () => {
  it("stages each technique along the pipeline", () => {
    const m = buildCoverageMatrix(inputs());
    const byId = Object.fromEntries(m.rows.map((r) => [r.technique_id, r]));
    expect(byId["T1110"].stage).toBe("correlated"); // rule fired
    expect(byId["T1059"].stage).toBe("activity"); // events tagged, no rule
    expect(byId["T1486"].stage).toBe("telemetry"); // family connected, no activity/rule
    expect(byId["T1110.001"].stage).toBe("telemetry"); // no rule of its own
  });

  it("computes detection and response coverage against the in-scope slice", () => {
    const m = buildCoverageMatrix(inputs());
    expect(m.kpis.techniques_in_scope).toBe(4);
    expect(m.kpis.detected).toBe(1); // only T1110
    expect(m.kpis.detection_coverage_pct).toBe(25);
    expect(m.kpis.responded).toBe(1); // only T1486 (pb-noresp has no d3fend step)
    expect(m.kpis.response_coverage_pct).toBe(25);
  });

  it("flags a technique whose data-source families are not connected", () => {
    const m = buildCoverageMatrix(inputs({ connectedFamilies: new Set(["windows"]), enabledRules: [], firedRuleIds: new Set() }));
    const byId = Object.fromEntries(m.rows.map((r) => [r.technique_id, r]));
    expect(byId["T1110"].telemetry).toBe(false); // identity family not connected
    expect(byId["T1110"].stage).toBe("no_telemetry"); // no telemetry, no rule
    expect(byId["T1059"].stage).toBe("activity"); // windows connected + tagged events
    expect(m.kpis.telemetry_gap).toBe(2); // T1110 + T1110.001 (both identity)
  });

  it("a playbook step with no d3fend_mapping does not count as response coverage", () => {
    const m = buildCoverageMatrix(inputs());
    const t1059 = m.rows.find((r) => r.technique_id === "T1059")!;
    expect(t1059.responded).toBe(false);
  });

  it("groups by tactic in tactic order, parents before sub-techniques", () => {
    const m = buildCoverageMatrix(inputs());
    expect(m.byTactic.map((g) => g.tactic.shortname)).toEqual(["execution", "credential-access"]);
    const ca = m.byTactic.find((g) => g.tactic.shortname === "credential-access")!;
    expect(ca.rows.map((r) => r.technique_id)).toEqual(["T1110", "T1110.001"]);
  });
});
