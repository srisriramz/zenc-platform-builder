import { describe, expect, it } from "vitest";
import type { AlertEnvelope, Case } from "@/schemas";
import { buildSocReport, draftReportNarrative, type SocReportInputs } from "./reporting";

function c(over: Partial<Case>): Case {
  return {
    case_id: "case-1",
    tenant_id: "t1",
    title: "t",
    status: "investigating",
    severity: "high",
    owner_id: "u1",
    linked_alert_ids: ["a1"],
    created_at: "2026-08-28T08:00:00.000Z",
    ...over,
  } as Case;
}

const alert: AlertEnvelope = {
  envelope_id: "a1",
  schema_version: "1.2",
  tenant_id: "t1",
  source: { system: "zenc-siem", connector_id: "corr", health: "healthy" },
  source_alert_id: "sa",
  occurred_at: "2026-08-28T07:00:00.000Z",
  correlated_at: "2026-08-28T07:05:00.000Z",
  received_at: "2026-08-28T07:05:00.000Z",
  severity: "high",
  title: "x",
  raw_payload_ref: "raw/a",
};

function inputs(over: Partial<SocReportInputs> = {}): SocReportInputs {
  const cases = over.cases ?? [
    c({ case_id: "open-1", status: "investigating", owner_id: "u1", sla: { status: "on_track" } }),
    c({
      case_id: "closed-1",
      status: "closed",
      owner_id: "u2",
      triaged_at: "2026-08-28T08:30:00.000Z",
      closed_at: "2026-08-28T10:00:00.000Z",
      closure: { classification: "false_positive", closed_by: "u2" },
      sla: { due_at: "2026-08-28T12:00:00.000Z", status: "on_track" },
    }),
  ];
  return {
    cases,
    nativeAlerts: [alert],
    receivedAtByCase: new Map(cases.map((x) => [x.case_id, alert.received_at])),
    candidateCount: 5,
    intakeAcceptedCount: 8,
    stageSamples: { collection: [30, 40], siem_detection: [120], handoff: [0] },
    agentAssistedCaseIds: new Set(["closed-1"]),
    coverage: { detection_pct: 32, response_pct: 20, techniques_in_scope: 25 },
    ...over,
  };
}

describe("buildSocReport", () => {
  it("computes MTTD/MTTA/MTTR and the pipeline stages", () => {
    const r = buildSocReport(inputs());
    expect(r.latency.mttd_seconds).toBe(300); // occurred → correlated
    expect(r.latency.mttr_seconds).toBe(7200); // created → closed for closed-1
    expect(r.latency.pipeline.map((p) => p.key)).toEqual(["collection", "siem_detection", "handoff", "soc_ack", "resolve"]);
    expect(r.latency.pipeline.find((p) => p.key === "collection")!.seconds).toBe(35);
  });

  it("computes alert-to-case conversion against accepted alerts", () => {
    const r = buildSocReport(inputs());
    expect(r.throughput.alerts_accepted).toBe(8);
    expect(r.throughput.cases_opened).toBe(2);
    expect(r.throughput.alert_to_case_pct).toBe(25);
  });

  it("computes the agent-assisted ratio and SLA compliance", () => {
    const r = buildSocReport(inputs());
    expect(r.quality.agent_assisted_cases).toBe(1);
    expect(r.quality.agent_assisted_pct).toBe(50);
    expect(r.quality.sla_compliance_pct).toBe(100); // open on_track + closed before due_at
  });

  it("counts a case closed after its SLA due_at as non-compliant", () => {
    const late = c({
      case_id: "late",
      status: "closed",
      triaged_at: "2026-08-28T08:30:00.000Z",
      closed_at: "2026-08-28T20:00:00.000Z",
      closure: { classification: "true_positive", closed_by: "u1" },
      sla: { due_at: "2026-08-28T12:00:00.000Z", status: "breached" },
    });
    const r = buildSocReport(inputs({ cases: [late], receivedAtByCase: new Map([["late", alert.received_at]]) }));
    expect(r.quality.sla_breached).toBe(1);
    expect(r.quality.sla_compliance_pct).toBe(0);
  });

  it("closure mix comes only from closed cases", () => {
    const r = buildSocReport(inputs());
    expect(r.throughput.closure_mix).toEqual([{ classification: "false_positive", count: 1 }]);
  });

  it("passes coverage through unchanged (SIEM computes it)", () => {
    expect(buildSocReport(inputs()).coverage).toEqual({ detection_pct: 32, response_pct: 20, techniques_in_scope: 25 });
    expect(buildSocReport(inputs({ coverage: null })).coverage).toBeNull();
  });
});

describe("draftReportNarrative", () => {
  it("summarises the KPIs and always ends with the not-published disclaimer", () => {
    const text = draftReportNarrative(buildSocReport(inputs()), (id) => id.toUpperCase());
    expect(text).toMatch(/alert-to-case conversion 25%/i);
    expect(text).toMatch(/detection coverage 32%/i);
    expect(text.trim().endsWith("External-facing copy requires human review and sign-off.")).toBe(true);
  });

  it("notes when coverage is unavailable", () => {
    const text = draftReportNarrative(buildSocReport(inputs({ coverage: null })), (id) => id);
    expect(text).toMatch(/no ZenC SIEM/i);
  });
});
