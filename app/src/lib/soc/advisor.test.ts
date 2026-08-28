import { describe, expect, it } from "vitest";
import type { Case, Evidence } from "@/schemas";
import { adviseCase } from "./advisor";

const theCase: Case = {
  case_id: "case-1",
  tenant_id: "tenant-summit-cu",
  title: "Suspected ransomware",
  status: "investigating",
  owner_id: "user-priya-analyst",
  linked_alert_ids: ["a"],
  created_at: "2026-08-28T09:00:00.000Z",
};

function ev(state: Evidence["review_state"]): Evidence {
  return {
    evidence_id: `ev-${state}`,
    tenant_id: "tenant-summit-cu",
    origin: "soc",
    linked_case_id: "case-1",
    submitted_by: "user-priya-analyst",
    submitted_at: "2026-08-28T09:30:00.000Z",
    review_state: state,
    confidence: 0.8,
  };
}

describe("adviseCase", () => {
  it("maps a ransomware technique to the ransomware lesson and its tasks", () => {
    const r = adviseCase(theCase, ["T1486"], [], "2026-08-28T12:00:00.000Z");
    expect(r.based_on.knowledge.some((k) => k.knowledge_id === "kb-ransomware-impact")).toBe(true);
    expect(r.suggested_tasks.some((t) => t.toLowerCase().includes("memory image"))).toBe(true);
  });

  it("always carries the advisory-only + dry-run caveats", () => {
    const r = adviseCase(theCase, ["T1486"], [], "2026-08-28T12:00:00.000Z");
    expect(r.caveats.some((c) => c.includes("cannot approve"))).toBe(true);
    expect(r.caveats.some((c) => c.toLowerCase().includes("dry-run"))).toBe(true);
  });

  it("weighs only approved evidence and flags unreviewed items", () => {
    const r = adviseCase(theCase, ["T1486"], [ev("approved"), ev("submitted"), ev("submitted")], "2026-08-28T12:00:00.000Z");
    expect(r.based_on.approved_evidence_count).toBe(1);
    expect(r.based_on.unreviewed_evidence_count).toBe(2);
    expect(r.caveats.some((c) => c.includes("not yet reviewed"))).toBe(true);
  });

  it("falls back to a generic recommendation when no lesson matches", () => {
    const r = adviseCase(theCase, ["T9999"], [], "2026-08-28T12:00:00.000Z");
    expect(r.based_on.knowledge).toHaveLength(0);
    expect(r.recommendation).toMatch(/standard triage/i);
  });
});
