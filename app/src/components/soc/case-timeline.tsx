"use client";

import { AlertTriangle, Bot, CircleCheck, FileText, FlagTriangleRight, ListChecks, Lock, Radar } from "lucide-react";
import type { TimelineEntry, TimelineKind } from "@/lib/soc/timeline";
import { formatTimestamp } from "@/lib/time";

const ICON: Record<TimelineKind, React.ComponentType<{ className?: string }>> = {
  alert_occurred: AlertTriangle,
  alert_correlated: Radar,
  case_created: FlagTriangleRight,
  triaged: CircleCheck,
  status_changed: FlagTriangleRight,
  evidence_added: FileText,
  evidence_reviewed: Lock,
  task_created: ListChecks,
  task_completed: CircleCheck,
  agent_run: Bot,
  closed: CircleCheck,
};

export function CaseTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Nothing on the timeline yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-border pl-5">
      {entries.map((e, i) => {
        const Icon = ICON[e.kind] ?? FileText;
        return (
          <li key={i} className="relative">
            <span className="absolute -left-[27px] grid size-4 place-items-center rounded-full border border-border bg-background">
              <Icon className="size-2.5 text-muted-foreground" />
            </span>
            <p className="text-sm">
              {e.title}
              {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">{formatTimestamp(e.at)}</p>
          </li>
        );
      })}
    </ol>
  );
}
