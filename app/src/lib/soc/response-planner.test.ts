import { describe, expect, it } from "vitest";
import type { AlertEnvelope, Case } from "@/schemas";
import type { SeededPlaybook } from "@/data/playbooks";
import { planResponse } from "./response-planner";
import type { ApprovalPolicy } from "./action-approval";

const policy: ApprovalPolicy = { default_autonomy_level: "L2", pre_authorized_action_classes: ["A0", "A1"], l3_preauthorized_action_types: [] };

const theCase: Case = {
  case_id: "case-1",
  tenant_id: "t1",
  title: "Suspected ransomware",
  status: "investigating",
  owner_id: "u1",
  linked_alert_ids: ["a"],
  created_at: "2026-08-28T09:00:00.000Z",
};

const alert: AlertEnvelope = {
  envelope_id: "a",
  schema_version: "1.1",
  tenant_id: "t1",
  source: { system: "third-party-edr", connector_id: "c", health: "healthy" },
  source_alert_id: "sa",
  occurred_at: "2026-08-28T08:00:00.000Z",
  received_at: "2026-08-28T08:00:10.000Z",
  severity: "critical",
  title: "Ransomware",
  raw_payload_ref: "raw/a",
  entities: [{ entity_type: "host", value: "fs-02" }],
  attack_techniques: [{ tactic: "Impact", technique_id: "T1486", technique_name: "Data Encrypted for Impact", contributing_event_refs: ["x"] }],
};

const containPb: SeededPlaybook = {
  playbook_id: "pb-contain",
  tenant_id: "t1",
  name: "Contain a compromised endpoint",
  version: "1.0.0",
  lifecycle_state: "enabled",
  enabled_by: "u2",
  applies_to_techniques: ["T1486", "T1055"],
  steps: [
    { step_id: "s1", order: 1, action_class: "A2", action_type: "create_containment_tasks", description: "tasks", d3fend_unmapped: true },
    { step_id: "s2", order: 2, action_class: "A3", action_type: "isolate_host", description: "isolate", d3fend_mapping: [{ d3fend_technique_id: "D3-NI", d3fend_technique_name: "Network Isolation", category: "Isolate" }] },
  ],
};

describe("planResponse", () => {
  it("matches an enabled playbook by technique overlap and resolves the target from case entities", () => {
    const plan = planResponse(theCase, [alert], [containPb], policy);
    expect(plan.source).toBe("playbook");
    expect(plan.playbook_id).toBe("pb-contain");
    expect(plan.steps.find((s) => s.action_type === "isolate_host")?.target).toBe("fs-02");
  });

  it("flags every A3+ step as needing approval / escalation", () => {
    const plan = planResponse(theCase, [alert], [containPb], policy);
    const isolate = plan.steps.find((s) => s.action_type === "isolate_host")!;
    expect(isolate.needs_human_approval).toBe(true);
    expect(isolate.escalation).toBeTruthy();
    expect(plan.escalations.length).toBe(1);
  });

  it("reflects an L3 pre-authorization instead of escalating", () => {
    const preauth: ApprovalPolicy = { ...policy, l3_preauthorized_action_types: ["isolate_host"] };
    const plan = planResponse(theCase, [alert], [containPb], preauth);
    const isolate = plan.steps.find((s) => s.action_type === "isolate_host")!;
    expect(isolate.needs_human_approval).toBe(false);
    expect(isolate.policy_basis).toMatch(/isolate_host/);
  });

  it("returns no_match when no enabled playbook maps to the techniques", () => {
    const plan = planResponse(theCase, [{ ...alert, attack_techniques: [] }], [containPb], policy);
    expect(plan.source).toBe("no_match");
    expect(plan.steps).toHaveLength(0);
  });
});
