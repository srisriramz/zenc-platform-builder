import { z } from "zod";
import { isoDateTime } from "./common";
import { actionClass } from "./playbook";

/**
 * Mirrors schemas/action-request.schema.json.
 *
 * The no-self-approval invariant (`requested_by` ≠ `approved_by`) CANNOT be
 * expressed in JSON Schema, so it lives here as a `.refine` AND is re-checked
 * in `lib/soc/action-approval.ts` — never only in a disabled button
 * (SKILL.md, action-request.schema.json description).
 *
 * `approved_by.principal_type` is `const "human"` — an agent can never be the
 * approver of any action class. A4 always requires `approved_by` once it
 * moves toward approved/executed/verified, regardless of tenant policy.
 */
export const actionRequestStatus = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "denied",
  "expired",
  "executed",
  "verified",
  "rolled_back",
]);
export type ActionRequestStatus = z.infer<typeof actionRequestStatus>;

const principal = z.object({
  principal_id: z.string(),
  principal_type: z.enum(["human", "agent"]),
});

export const actionRequestSchema = z
  .object({
    action_request_id: z.string(),
    tenant_id: z.string(),
    case_id: z.string(),
    playbook_id: z.string().optional(),
    playbook_step_id: z.string().nullable().optional(),
    action_class: actionClass,
    action_type: z.string(),
    /** short human-readable summary of what would happen */
    summary: z.string().optional(),
    /** the concrete target (host, account, indicator) */
    target: z.string().optional(),
    requested_by: principal,
    requested_at: isoDateTime.optional(),
    approved_by: z
      .object({ principal_id: z.string(), principal_type: z.literal("human") })
      .nullable()
      .optional(),
    approved_at: isoDateTime.optional(),
    denied_reason: z.string().optional(),
    status: actionRequestStatus,
    policy_basis: z.string().nullable().optional(),
    expires_at: isoDateTime.optional(),
    dry_run: z.boolean().default(true),
    reversible: z.boolean().optional(),
    execution: z
      .object({
        executed_at: isoDateTime,
        executed_by: z.string(),
        precondition_recheck_passed: z.boolean(),
        idempotent_noop: z.boolean().optional(),
        result_note: z.string().optional(),
      })
      .optional(),
    verification: z
      .object({
        verified_at: isoDateTime,
        outcome_confirmed: z.boolean(),
        notes: z.string().optional(),
      })
      .optional(),
    rollback: z
      .object({
        reversible: z.boolean(),
        rolled_back_at: isoDateTime.optional(),
        rolled_back_by: z.string().optional(),
      })
      .optional(),
  })
  // no self-approval — the requester can never be the approver
  .refine((r) => !r.approved_by || r.approved_by.principal_id !== r.requested_by.principal_id, {
    message: "the requester of an action can never be its approver (no self-approval)",
    path: ["approved_by"],
  })
  // A4 requires a human approver once it advances toward execution
  .refine(
    (r) => r.action_class !== "A4" || !["approved", "executed", "verified"].includes(r.status) || !!r.approved_by,
    { message: "an A4 action always requires an independent human approver", path: ["approved_by"] },
  )
  // an A3 that reached 'approved' with no human approver must cite the policy that pre-authorized it
  .refine(
    (r) => r.action_class !== "A3" || r.status !== "approved" || !!r.approved_by || !!r.policy_basis,
    { message: "an A3 approved without a human approver must cite its policy_basis", path: ["policy_basis"] },
  )
  .refine((r) => r.status !== "expired" || !!r.expires_at, {
    message: "an expired request must carry expires_at",
    path: ["expires_at"],
  });
export type ActionRequest = z.infer<typeof actionRequestSchema>;
