import { z } from "zod";
import { isoDateTime } from "./common";

/**
 * Mirrors schemas/agent-message.schema.json and schemas/agent-run.schema.json.
 * Every agent output validates against these before it reaches a human or
 * drafts an action request (references/agentic-architecture.md, "Agent
 * message and run contract"). A malformed agent output is quarantined, never
 * silently coerced.
 */
export const agentName = z.enum([
  "intake-agent",
  "triage-agent",
  "enrichment-agent",
  "investigation-agent",
  "hunt-agent",
  "response-planner-agent",
  "detection-engineer-agent",
  "assessment-assistant-agent",
  "reporting-agent",
  "digital-advisor-agent",
  "qa-governance-agent",
  "supervisor",
]);
export type AgentName = z.infer<typeof agentName>;

export const escalationReason = z.enum([
  "low_confidence",
  "action_class_too_high",
  "contradictory_or_missing_evidence",
  "policy_ambiguous_or_absent",
  "tool_outside_allowlist",
]);

export const agentMessageSchema = z
  .object({
    message_id: z.string(),
    agent_run_id: z.string(),
    agent_name: agentName,
    tenant_id: z.string(),
    occurred_at: isoDateTime,
    prompt_version: z.string(),
    tool_version: z.string(),
    rule_or_playbook_version: z.string().optional(),
    input_ref: z.string(),
    tool_calls: z.array(
      z.object({
        tool_name: z.string(),
        called_at: isoDateTime,
        scope_or_bound: z.string().optional(),
      }),
    ),
    claim: z.string(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(
      z.object({
        evidence_ref: z.string(),
        supports: z.boolean(),
        freshness: isoDateTime.optional(),
      }),
    ),
    escalated: z.boolean().optional(),
    escalation_reason: escalationReason.optional(),
    policy_outcome: z.string().optional(),
  })
  .refine((m) => !m.escalated || !!m.escalation_reason, {
    message: "an escalated message must carry an escalation_reason",
    path: ["escalation_reason"],
  });
export type AgentMessage = z.infer<typeof agentMessageSchema>;

export const humanTouchpoint = z.object({
  principal_id: z.string(),
  action: z.enum(["approved", "denied", "corrected", "reviewed"]),
  at: isoDateTime,
  note: z.string().optional(),
});

export const analystFeedbackSchema = z.object({
  agent_claim_ref: z.string().optional(),
  human_determination: z.string(),
  maps_to_closure_classification: z
    .enum(["true_positive", "false_positive", "benign_true_positive", "duplicate", "suppressed"])
    .optional(),
  implicates_version: z.string().optional(),
});
export type AnalystFeedback = z.infer<typeof analystFeedbackSchema>;

export const agentRunSchema = z.object({
  agent_run_id: z.string(),
  tenant_id: z.string(),
  /**
   * The work item this run is about. Historically a case_id (SOC); v1.1 adds
   * `subject_type` so a non-case run (e.g. the Detection Engineer Agent
   * proposing a rule) can carry a detection_rule id here instead.
   */
  case_id: z.string(),
  subject_type: z.enum(["case", "detection_rule", "playbook"]).optional(),
  started_at: isoDateTime,
  completed_at: isoDateTime.optional(),
  message_ids: z.array(z.string()),
  total_tool_calls: z.number().int().optional(),
  elapsed_seconds: z.number().optional(),
  human_touchpoints: z.array(humanTouchpoint),
  outcome: z.enum(["completed", "escalated_pending_human", "denied", "expired", "error"]),
  analyst_feedback: analystFeedbackSchema.nullable().optional(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;
