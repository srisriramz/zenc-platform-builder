import { z } from "zod";
import { isoDateTime } from "./common";

/**
 * Mirrors schemas/task.schema.json — an assignable unit of work under a Case.
 * Tasks carry their own due clocks; the Case SLA panel rolls them up. Task
 * history survives case closure (it is audit trail, not working state).
 */
export const taskStatus = z.enum(["open", "in_progress", "blocked", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatus>;

export const taskSchema = z
  .object({
    task_id: z.string(),
    tenant_id: z.string(),
    case_id: z.string(),
    title: z.string(),
    detail: z.string().optional(),
    status: taskStatus,
    assignee_id: z.string().optional(),
    due_at: isoDateTime.optional(),
    created_at: isoDateTime,
    created_by: z.string(),
    completed_at: isoDateTime.optional(),
    completed_by: z.string().optional(),
    source: z.enum(["human", "agent", "playbook"]),
    proposed_by_agent: z.string().optional(),
  })
  .refine((t) => t.status !== "done" || (!!t.completed_at && !!t.completed_by), {
    message: "a done task needs completed_at and completed_by",
    path: ["completed_at"],
  });
export type Task = z.infer<typeof taskSchema>;
