"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { PipelineFunnel, FunnelStage } from "@/lib/pipeline/funnel";
import { AGENT_MAP } from "@/data/agents";
import { AGENT_STAGE_ROLE } from "@/lib/why-soc/content";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { useCountUp, useInViewOnce } from "./anim";

export function FunnelDiagram({ funnel }: { funnel: PipelineFunnel }) {
  const [open, setOpen] = React.useState<string | null>("detect");
  return (
    <div className="space-y-2">
      {funnel.stages.map((stage, i) => (
        <StageRow
          key={stage.key}
          stage={stage}
          index={i}
          open={open === stage.key}
          onToggle={() => setOpen((k) => (k === stage.key ? null : stage.key))}
        />
      ))}
    </div>
  );
}

function StageRow({
  stage,
  index,
  open,
  onToggle,
}: {
  stage: FunnelStage;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const shown = useCountUp(stage.value, inView, 900 + index * 120);
  const width = inView ? stage.widthPct : 12;

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full flex-col items-center"
      >
        <div
          className={cn(
            "relative flex min-h-[4.25rem] w-full items-center justify-between gap-4 overflow-hidden rounded-xl border px-4 py-3 text-left transition-[width,border-color,background-color] duration-700 ease-out sm:px-6",
            open
              ? "border-primary/50 bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))]"
              : "border-border bg-card hover:border-border-strong",
          )}
          style={{ width: `${width}%`, minWidth: "min(100%, 18rem)" }}
        >
          {/* jade edge accent */}
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary/70" />
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{stage.label}</span>
            {stage.pctOfIntake != null && stage.key !== "intake" && (
              <span className="ml-2 text-[10px] tabular-nums text-primary">{stage.pctOfIntake}% of intake</span>
            )}
            {stage.sideNote && (
              <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{stage.sideNote}</p>
            )}
          </div>
          <div className="flex flex-none items-center gap-2 text-right">
            <div>
              <div className="font-display text-lg font-bold tabular-nums leading-none sm:text-xl">
                {stage.value >= 100000 ? formatCount(shown, 1) : Math.round(shown).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">{stage.unit}</div>
            </div>
            <ChevronDown className={cn("size-4 flex-none text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
        </div>
      </button>

      {open && (
        <div className="anim-fade mx-auto mt-2 max-w-2xl rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="text-muted-foreground">{stage.what}</p>
          {stage.sideNote && <p className="mt-1 text-xs text-primary">{stage.sideNote}</p>}

          {stage.agents.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agents here</p>
              {stage.agents.map((name) => (
                <div key={name} className="flex items-start gap-2 text-xs">
                  <Badge variant="primary" className="mt-0.5 flex-none">
                    {AGENT_MAP[name]?.default_autonomy ?? "L1"}
                  </Badge>
                  <span>
                    <span className="font-medium text-foreground">{AGENT_MAP[name]?.label ?? name}</span>{" "}
                    <span className="text-muted-foreground">— {AGENT_STAGE_ROLE[name] ?? AGENT_MAP[name]?.purpose}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <Link
            href={stage.href}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            See it live — {stage.screenLabel} <ArrowRight className="size-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
