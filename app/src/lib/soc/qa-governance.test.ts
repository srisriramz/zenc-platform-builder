import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentRun } from "@/schemas";
import { reviewAgentRun } from "./qa-governance";

function msg(over: Partial<AgentMessage> = {}): AgentMessage {
  return {
    message_id: "m1",
    agent_run_id: "run-triage-x",
    agent_name: "triage-agent",
    tenant_id: "t1",
    occurred_at: "2026-08-28T09:00:00.000Z",
    prompt_version: "v1",
    tool_version: "v1",
    input_ref: "x",
    tool_calls: [{ tool_name: "alert-read", called_at: "2026-08-28T09:00:00.000Z" }],
    claim: "c",
    confidence: 0.7,
    evidence: [{ evidence_ref: "e", supports: true }],
    ...over,
  };
}

const run: AgentRun = {
  agent_run_id: "run-triage-x",
  tenant_id: "t1",
  case_id: "case-1",
  subject_type: "case",
  started_at: "2026-08-28T09:00:00.000Z",
  message_ids: ["m1"],
  human_touchpoints: [],
  outcome: "completed",
};

describe("reviewAgentRun", () => {
  it("passes a clean run", () => {
    expect(reviewAgentRun(run, [msg()]).verdict).toBe("pass");
  });

  it("flags a tool call outside the agent's allowlist", () => {
    const v = reviewAgentRun(run, [msg({ tool_calls: [{ tool_name: "action-request-draft", called_at: "2026-08-28T09:00:00.000Z" }] })]);
    expect(v.verdict).toBe("flag");
    expect(v.checks.find((c) => c.name === "tool allowlist")?.ok).toBe(false);
  });

  it("flags a confident claim with no supporting evidence", () => {
    const v = reviewAgentRun(run, [msg({ confidence: 0.8, evidence: [] })]);
    expect(v.checks.find((c) => c.name === "evidence for confident claims")?.ok).toBe(false);
  });

  it("flags a low-confidence message that did not escalate", () => {
    const v = reviewAgentRun(run, [msg({ confidence: 0.3, escalated: false })]);
    expect(v.checks.find((c) => c.name === "low-confidence handoff")?.ok).toBe(false);
  });

  it("flags an escalated message with a 'completed' run outcome", () => {
    const v = reviewAgentRun(run, [msg({ escalated: true, escalation_reason: "low_confidence" })]);
    expect(v.checks.find((c) => c.name === "run outcome consistency")?.ok).toBe(false);
  });

  it("never returns an approval — it only produces a verdict", () => {
    const v = reviewAgentRun(run, [msg()]);
    expect(Object.keys(v)).toEqual(["agent_run_id", "agent_name", "verdict", "checks"]);
  });
});
