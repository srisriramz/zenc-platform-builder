import { z } from "zod";
import { isoDateTime } from "./common";

/** Mirrors schemas/audit-event.schema.json — append-only. */
export const auditAction = z.enum([
  "approval_granted",
  "approval_denied",
  "action_executed",
  "action_rolled_back",
  "evidence_added",
  "evidence_reviewed",
  "role_changed",
  "entitlement_changed",
  "playbook_state_changed",
  "kill_switch_toggled",
]);

export const auditTargetType = z.enum([
  "action_request",
  "evidence",
  "case",
  "assessment",
  "playbook",
  "role",
  "entitlement",
  "policy",
]);

export const auditEventSchema = z.object({
  audit_id: z.string(),
  tenant_id: z.string(),
  occurred_at: isoDateTime,
  actor: z.object({
    principal_id: z.string(),
    principal_type: z.enum(["human", "agent", "system"]),
  }),
  action: auditAction,
  target_type: auditTargetType,
  target_id: z.string(),
  detail: z.string().optional(),
  supersedes_audit_id: z.string().nullable().optional(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
