import { describe, expect, it } from "vitest";
import type { AlertEnvelope, Case, Evidence, Task } from "@/schemas";
import { buildCaseTimeline } from "./timeline";

const theCase: Case = {
  case_id: "case-1",
  tenant_id: "t1",
  title: "t",
  status: "closed",
  owner_id: "u1",
  linked_alert_ids: ["a"],
  created_at: "2026-08-28T09:00:00.000Z",
  triaged_at: "2026-08-28T09:30:00.000Z",
  closed_at: "2026-08-28T11:00:00.000Z",
  closure: { classification: "true_positive", closed_by: "u1" },
};

const alert: AlertEnvelope = {
  envelope_id: "a",
  schema_version: "1.2",
  tenant_id: "t1",
  source: { system: "zenc-siem", connector_id: "c", health: "healthy" },
  source_alert_id: "sa",
  occurred_at: "2026-08-28T08:00:00.000Z",
  correlated_at: "2026-08-28T08:05:00.000Z",
  received_at: "2026-08-28T08:05:00.000Z",
  severity: "high",
  title: "Alert A",
  raw_payload_ref: "raw/a",
};

const evidence: Evidence[] = [
  {
    evidence_id: "ev-1",
    tenant_id: "t1",
    origin: "soc",
    linked_case_id: "case-1",
    title: "Export",
    submitted_by: "u1",
    submitted_at: "2026-08-28T10:00:00.000Z",
    review_state: "approved",
    reviewer_id: "u2",
    reviewed_at: "2026-08-28T10:30:00.000Z",
    confidence: 0.9,
  },
];

const tasks: Task[] = [
  {
    task_id: "t-1",
    tenant_id: "t1",
    case_id: "case-1",
    title: "Isolate host",
    status: "done",
    created_at: "2026-08-28T09:45:00.000Z",
    created_by: "u1",
    completed_at: "2026-08-28T10:15:00.000Z",
    completed_by: "u1",
    source: "human",
  },
];

describe("buildCaseTimeline", () => {
  it("is sorted ascending and covers every record kind", () => {
    const t = buildCaseTimeline({ theCase, linkedAlerts: [alert], evidence, tasks, agentRuns: [], statusChanges: [] });
    const times = t.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const kinds = new Set(t.map((e) => e.kind));
    expect(kinds).toContain("alert_occurred");
    expect(kinds).toContain("alert_correlated");
    expect(kinds).toContain("case_created");
    expect(kinds).toContain("triaged");
    expect(kinds).toContain("evidence_added");
    expect(kinds).toContain("evidence_reviewed");
    expect(kinds).toContain("task_created");
    expect(kinds).toContain("task_completed");
    expect(kinds).toContain("closed");
  });

  it("puts the closed entry last", () => {
    const t = buildCaseTimeline({ theCase, linkedAlerts: [alert], evidence, tasks, agentRuns: [], statusChanges: [] });
    expect(t[t.length - 1].kind).toBe("closed");
  });
});
