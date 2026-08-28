import { afterEach, describe, expect, it } from "vitest";
import type { AgentMessage, AgentRun } from "@/schemas";
import { addAgentRun, getSession, resetSession } from "./session-store";

afterEach(() => resetSession());

const run: AgentRun = {
  agent_run_id: "run-test-1",
  tenant_id: "t1",
  case_id: "case-1",
  subject_type: "case",
  started_at: "2026-08-28T09:00:00.000Z",
  message_ids: ["m1"],
  human_touchpoints: [],
  outcome: "completed",
};

const message: AgentMessage = {
  message_id: "m1",
  agent_run_id: "run-test-1",
  agent_name: "triage-agent",
  tenant_id: "t1",
  occurred_at: "2026-08-28T09:00:00.000Z",
  prompt_version: "v1",
  tool_version: "v1",
  input_ref: "x",
  tool_calls: [],
  claim: "c",
  confidence: 0.7,
  evidence: [],
};

describe("addAgentRun contract enforcement", () => {
  it("stores a well-formed run + message", () => {
    addAgentRun(run, [message]);
    expect(getSession().agentRuns).toHaveLength(1);
    expect(getSession().agentMessages).toHaveLength(1);
  });

  it("rejects a message that escalated with no escalation_reason", () => {
    expect(() => addAgentRun(run, [{ ...message, escalated: true }])).toThrow();
    expect(getSession().agentRuns).toHaveLength(0);
  });

  it("rejects a message with an out-of-range confidence", () => {
    expect(() => addAgentRun(run, [{ ...message, confidence: 1.4 }])).toThrow();
  });

  it("rejects a run with an unknown outcome", () => {
    expect(() => addAgentRun({ ...run, outcome: "vibes" as never }, [message])).toThrow();
  });
});
