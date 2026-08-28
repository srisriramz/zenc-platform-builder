import { z } from "zod";
import { isoDateTime, severity } from "./common";

/**
 * Mirrors schemas/case.schema.json — the SOAR unit of investigation/response
 * work, grouping one or more alert-envelopes plus evidence, tasks, a timeline,
 * and (on close) a closure classification.
 *
 * `triaged_at` is an additive field (not in the original JSON schema) so the
 * pipeline-latency breakdown can measure the SOC-ack stage:
 *   occurred_at → correlated_at (SIEM) → received_at (intake) → triaged_at →
 *   closed_at.
 */
export const caseStatus = z.enum([
  "new",
  "triaged",
  "investigating",
  "contained",
  "recovering",
  "closed",
  "reopened",
]);
export type CaseStatus = z.infer<typeof caseStatus>;

export const closureClassification = z.enum([
  "true_positive",
  "false_positive",
  "benign_true_positive",
  "duplicate",
  "suppressed",
]);
export type ClosureClassification = z.infer<typeof closureClassification>;

export const caseSchema = z
  .object({
    case_id: z.string(),
    tenant_id: z.string(),
    title: z.string().optional(),
    status: caseStatus,
    severity: severity.optional(),
    owner_id: z.string(),
    linked_alert_ids: z.array(z.string()),
    evidence_ids: z.array(z.string()).optional(),
    task_ids: z.array(z.string()).optional(),
    agent_run_ids: z.array(z.string()).optional(),
    sla: z
      .object({
        due_at: isoDateTime.optional(),
        status: z.enum(["on_track", "at_risk", "breached"]).optional(),
      })
      .optional(),
    created_at: isoDateTime,
    triaged_at: isoDateTime.optional(),
    closed_at: isoDateTime.optional(),
    closure: z
      .object({
        classification: closureClassification,
        reason: z.string().optional(),
        closed_by: z.string(),
      })
      .optional(),
  })
  .refine((c) => c.status !== "closed" || (!!c.closed_at && !!c.closure?.classification && !!c.closure?.closed_by), {
    message: "a closed case needs closed_at and a closure classification with closed_by",
    path: ["closure"],
  })
  .refine((c) => c.status !== "closed" || c.closure?.classification !== "suppressed" || !!c.closure?.reason, {
    message: "a suppressed closure needs a documented reason",
    path: ["closure", "reason"],
  });
export type Case = z.infer<typeof caseSchema>;
