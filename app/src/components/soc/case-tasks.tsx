"use client";

import * as React from "react";
import { Bot, Clock } from "lucide-react";
import type { Task, TaskStatus } from "@/schemas";
import { useAddTask, useUpdateTaskStatus } from "@/hooks/use-soc";
import { DEMO_NOW_ISO, formatRelative, formatTimestamp } from "@/lib/time";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { TaskStatusBadge } from "@/components/domain-badges";

const NEXT: Record<TaskStatus, TaskStatus[]> = {
  open: ["in_progress", "blocked", "cancelled"],
  in_progress: ["done", "blocked", "open"],
  blocked: ["in_progress", "cancelled"],
  done: ["in_progress"],
  cancelled: ["open"],
};

export function CaseTasks({
  caseId,
  tasks,
  canWork,
  workers,
  nameOf,
}: {
  caseId: string;
  tasks: Task[];
  canWork: boolean;
  workers: { user_id: string; display_name: string }[];
  nameOf: (id: string) => string;
}) {
  const [adding, setAdding] = React.useState(false);
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {done}/{tasks.length} done. Overdue tasks roll into the case SLA.
        </p>
        {canWork && (
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Add task"}
          </Button>
        )}
      </div>

      {adding && <AddTaskForm caseId={caseId} workers={workers} onDone={() => setAdding(false)} />}

      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <TaskRow key={t.task_id} t={t} canWork={canWork} nameOf={nameOf} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ t, canWork, nameOf }: { t: Task; canWork: boolean; nameOf: (id: string) => string }) {
  const update = useUpdateTaskStatus();
  const overdue = t.due_at && t.status !== "done" && t.status !== "cancelled" && Date.parse(t.due_at) < Date.parse(DEMO_NOW_ISO);
  return (
    <li className="rounded-md border border-border p-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={t.status === "done" || t.status === "cancelled" ? "text-muted-foreground line-through" : ""}>{t.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {t.source === "agent" ? (
              <span className="inline-flex items-center gap-1">
                <Bot className="size-3" /> {t.proposed_by_agent}
              </span>
            ) : (
              <span>by {nameOf(t.created_by)}</span>
            )}
            {t.assignee_id && <span>· {nameOf(t.assignee_id)}</span>}
            {t.due_at && (
              <span className={overdue ? "text-[var(--destructive)]" : ""}>
                · <Clock className="inline size-3" /> due {formatRelative(t.due_at)}
              </span>
            )}
            {t.completed_at && <span>· done {formatTimestamp(t.completed_at)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TaskStatusBadge status={t.status} />
        </div>
      </div>
      {canWork && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(NEXT[t.status] ?? []).map((to) => (
            <Button key={to} size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={update.isPending} onClick={() => update.mutate({ taskId: t.task_id, to })}>
              {to.replace("_", " ")}
            </Button>
          ))}
        </div>
      )}
      {update.isError && <p className="mt-1 text-[11px] text-[var(--destructive)]">{(update.error as Error)?.message}</p>}
    </li>
  );
}

function AddTaskForm({ caseId, workers, onDone }: { caseId: string; workers: { user_id: string; display_name: string }[]; onDone: () => void }) {
  const add = useAddTask();
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [dueHours, setDueHours] = React.useState(8);
  return (
    <form
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        add.mutate({ case_id: caseId, title: title.trim(), assignee_id: assignee || undefined, due_in_hours: dueHours }, { onSuccess: onDone });
      }}
    >
      <div>
        <Label htmlFor="task-title">Title</Label>
        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Confirm sign-ins with the account owner" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="task-assignee">Assignee</Label>
          <select id="task-assignee" className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">case owner</option>
            {workers.map((w) => (
              <option key={w.user_id} value={w.user_id}>
                {w.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <Label htmlFor="task-due">Due in (h)</Label>
          <Input id="task-due" type="number" min={1} max={168} value={dueHours} onChange={(e) => setDueHours(Number(e.target.value))} className="h-8" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={add.isPending || !title.trim()}>
          Add
        </Button>
        {add.isError && <span className="text-[11px] text-[var(--destructive)]">{(add.error as Error)?.message}</span>}
      </div>
    </form>
  );
}

export function TaskSlaBadge({ overdue, dueSoon }: { overdue: number; dueSoon: number }) {
  if (overdue > 0) return <Badge variant="danger">{overdue} task{overdue === 1 ? "" : "s"} overdue</Badge>;
  if (dueSoon > 0) return <Badge variant="warning">{dueSoon} due soon</Badge>;
  return <Badge variant="success">tasks on track</Badge>;
}
