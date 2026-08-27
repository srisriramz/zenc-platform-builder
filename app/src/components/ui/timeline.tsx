import * as React from "react";
import { cn } from "@/lib/utils";

export type TimelineTone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "muted";

const DOT_TONE: Record<TimelineTone, string> = {
  default: "bg-foreground/70 ring-foreground/15",
  primary: "bg-primary ring-primary/25",
  success: "bg-[var(--success)] ring-[color-mix(in_oklch,var(--success)_30%,transparent)]",
  warning: "bg-[var(--warning)] ring-[color-mix(in_oklch,var(--warning)_30%,transparent)]",
  danger: "bg-[var(--destructive)] ring-[color-mix(in_oklch,var(--destructive)_30%,transparent)]",
  info: "bg-[var(--info)] ring-[color-mix(in_oklch,var(--info)_30%,transparent)]",
  muted: "bg-muted-foreground/50 ring-transparent",
};

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  body?: React.ReactNode;
  tone?: TimelineTone;
  icon?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-0", className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const Node = item.onClick ? "button" : "div";
        return (
          <li key={item.id} className="relative flex gap-3">
            {/* rail */}
            <div className="relative flex w-4 flex-none flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-2.5 flex-none rounded-full ring-4 transition-transform",
                  DOT_TONE[item.tone ?? "default"],
                  item.active && "scale-125",
                )}
              />
              {!last && <span className="w-px flex-1 bg-border" />}
            </div>
            {/* content */}
            <Node
              onClick={item.onClick}
              className={cn(
                "mb-4 min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition-colors",
                item.onClick && "hover:bg-accent focus-visible:bg-accent",
                item.active && "bg-accent",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {item.icon}
                  {item.title}
                </span>
                {item.meta && <span className="font-mono text-[11px] text-muted-foreground">{item.meta}</span>}
              </div>
              {item.body && <div className="mt-0.5 text-xs text-muted-foreground">{item.body}</div>}
            </Node>
          </li>
        );
      })}
    </ol>
  );
}
