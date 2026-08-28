import { z } from "zod";
import { isoDateTime } from "./common";
import { d3fendMappingEntry, ruleLifecycleState } from "./correlation-rule";

/**
 * Mirrors schemas/playbook.schema.json. A playbook's lifecycle is the SAME as
 * a detection rule's (draft → test → peer_review → approved → enabled →
 * disabled → retired) and carries the same guarantee: an agent
 * (response-planner-agent) may propose or test one but can never set
 * `enabled` — that is a human action, always (soc-spec.md).
 *
 * Every step declares its `action_class` up front so approval requirements
 * are known before the playbook runs, and either a response-side
 * `d3fend_mapping` or an explicit `d3fend_unmapped` marker — never silently
 * blank.
 */
export const playbookLifecycleState = ruleLifecycleState;
export type PlaybookLifecycleState = z.infer<typeof playbookLifecycleState>;

export const actionClass = z.enum(["A0", "A1", "A2", "A3", "A4"]);
export type ActionClass = z.infer<typeof actionClass>;

export const playbookStepSchema = z
  .object({
    step_id: z.string(),
    order: z.number().int(),
    action_class: actionClass,
    description: z.string(),
    action_type: z.string().optional(),
    d3fend_mapping: z.array(d3fendMappingEntry).optional(),
    d3fend_unmapped: z.boolean().optional(),
  })
  .refine((s) => !(s.d3fend_unmapped && (s.d3fend_mapping?.length ?? 0) > 0), {
    message: "a step is either d3fend-mapped or explicitly unmapped, not both",
    path: ["d3fend_unmapped"],
  })
  // a response step (A2+) must carry a D3FEND mapping or an explicit unmapped
  // marker — never silently blank. A0/A1 read-only steps implement no defensive
  // technique, so the marker is optional there.
  .refine(
    (s) => !["A2", "A3", "A4"].includes(s.action_class) || (s.d3fend_mapping?.length ?? 0) > 0 || s.d3fend_unmapped === true,
    { message: "an A2+ step needs a d3fend_mapping or an explicit d3fend_unmapped marker", path: ["d3fend_mapping"] },
  );
export type PlaybookStep = z.infer<typeof playbookStepSchema>;

export const playbookSchema = z
  .object({
    playbook_id: z.string(),
    tenant_id: z.string(),
    name: z.string(),
    version: z.string(),
    lifecycle_state: playbookLifecycleState,
    proposed_by: z.string().optional(),
    enabled_by: z.string().optional(),
    steps: z.array(playbookStepSchema),
    test_results: z
      .object({
        run_against_synthetic_case_id: z.string().optional(),
        passed: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .optional(),
    history: z
      .array(
        z.object({
          from_state: z.string(),
          to_state: z.string(),
          changed_by: z.string(),
          changed_at: isoDateTime,
        }),
      )
      .optional(),
  })
  .refine((p) => p.lifecycle_state !== "enabled" || !!p.enabled_by, {
    message: "an enabled playbook needs a human enabled_by",
    path: ["enabled_by"],
  });
export type Playbook = z.infer<typeof playbookSchema>;
