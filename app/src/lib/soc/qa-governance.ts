/**
 * QA & Governance Agent (L1). Reviews another agent's run for schema, policy,
 * evidence, and tool-allowlist compliance BEFORE it reaches a human queue
 * (references/agentic-architecture.md). It never approves anything and never
 * acts on another agent's behalf — it only produces a pass/flag verdict.
 */
import type { AgentMessage, AgentRun } from "@/schemas";
import { agentMessageSchema } from "@/schemas";
import { AGENT_MAP } from "@/data/agents";

export interface QaCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface QaVerdict {
  agent_run_id: string;
  agent_name: string | null;
  verdict: "pass" | "flag";
  checks: QaCheck[];
}

export function reviewAgentRun(run: AgentRun, messages: AgentMessage[]): QaVerdict {
  const checks: QaCheck[] = [];
  const agentName = messages[0]?.agent_name ?? null;
  const def = agentName ? AGENT_MAP[agentName] : undefined;

  // 1. schema
  const badMsg = messages.find((m) => !agentMessageSchema.safeParse(m).success);
  checks.push({
    name: "message schema",
    ok: !badMsg,
    detail: badMsg ? `message ${badMsg.message_id} does not validate against agent-message` : `${messages.length} message(s) valid`,
  });

  // 2. escalation carries a reason
  const escNoReason = messages.find((m) => m.escalated && !m.escalation_reason);
  checks.push({
    name: "escalation reason",
    ok: !escNoReason,
    detail: escNoReason ? `escalated message ${escNoReason.message_id} has no escalation_reason` : "ok",
  });

  // 3. tool allowlist
  const outOfAllowlist: string[] = [];
  if (def) {
    for (const m of messages) {
      for (const tc of m.tool_calls) {
        if (!def.tools.some((t) => t.name === tc.tool_name)) outOfAllowlist.push(tc.tool_name);
      }
    }
  }
  checks.push({
    name: "tool allowlist",
    ok: outOfAllowlist.length === 0,
    detail: outOfAllowlist.length ? `tool(s) outside allowlist: ${[...new Set(outOfAllowlist)].join(", ")}` : "every tool call is in the agent's allowlist",
  });

  // 4. a confident claim should cite supporting evidence
  const unsupported = messages.find((m) => m.confidence >= 0.6 && m.evidence.filter((e) => e.supports).length === 0 && m.tool_calls.length > 0);
  checks.push({
    name: "evidence for confident claims",
    ok: !unsupported,
    detail: unsupported ? `message ${unsupported.message_id} claims ${Math.round(unsupported.confidence * 100)}% with no supporting evidence` : "ok",
  });

  // 5. low confidence must escalate (agent should hand off, not proceed silently)
  const lowNoEsc = messages.find((m) => m.confidence < 0.4 && !m.escalated);
  checks.push({
    name: "low-confidence handoff",
    ok: !lowNoEsc,
    detail: lowNoEsc ? `message ${lowNoEsc.message_id} is ${Math.round(lowNoEsc.confidence * 100)}% confident but did not escalate` : "ok",
  });

  // 6. outcome / escalation consistency
  const anyEscalated = messages.some((m) => m.escalated);
  const inconsistent = anyEscalated && run.outcome === "completed";
  checks.push({
    name: "run outcome consistency",
    ok: !inconsistent,
    detail: inconsistent ? "a message escalated but the run outcome is 'completed'" : "ok",
  });

  return {
    agent_run_id: run.agent_run_id,
    agent_name: agentName,
    verdict: checks.every((c) => c.ok) ? "pass" : "flag",
    checks,
  };
}
