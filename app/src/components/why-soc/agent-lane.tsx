"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { PipelineFunnel } from "@/lib/pipeline/funnel";
import { AGENT_MAP } from "@/data/agents";
import { AGENT_STAGE_ROLE } from "@/lib/why-soc/content";
import { Badge } from "@/components/ui/primitives";

/**
 * The agent-over-pipeline view: the funnel stages as columns, each listing the
 * agents that work it, with the two orchestration agents shown spanning the
 * whole width beneath.
 */
export function AgentLane({ funnel }: { funnel: PipelineFunnel }) {
  const stagesWithAgents = funnel.stages.filter((s) => s.agents.length > 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stagesWithAgents.map((stage) => (
          <div key={stage.key} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{stage.label}</span>
              <Link href={stage.href} className="text-[10px] text-primary hover:underline">
                {stage.screenLabel}
              </Link>
            </div>
            <ul className="mt-2 space-y-2">
              {stage.agents.map((name) => (
                <li key={name} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="primary" className="flex-none px-1 py-0 text-[9px]">
                      {AGENT_MAP[name]?.default_autonomy ?? "L1"}
                    </Badge>
                    <span className="font-medium">{AGENT_MAP[name]?.label ?? name}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{AGENT_STAGE_ROLE[name] ?? AGENT_MAP[name]?.purpose}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-primary/40 bg-[color-mix(in_oklch,var(--primary)_7%,var(--card))] p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Across every stage</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {funnel.spanningAgents.map((name) => (
            <div key={name} className="text-xs">
              <div className="flex items-center gap-1.5">
                <Badge variant="primary" className="flex-none px-1 py-0 text-[9px]">
                  {AGENT_MAP[name]?.default_autonomy ?? "L1"}
                </Badge>
                <span className="font-medium">{AGENT_MAP[name]?.label ?? name}</span>
              </div>
              <p className="mt-0.5 text-muted-foreground">{AGENT_STAGE_ROLE[name] ?? AGENT_MAP[name]?.purpose}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Every agent has a fixed tool allowlist and a fixed autonomy ceiling. None can approve an action, enable a rule or
        playbook, or widen its own scope — those steps are human-only or run by a deterministic service.{" "}
        <Link href="/agents" className="text-primary hover:underline">
          The full agent roster
        </Link>
        .
      </p>
    </div>
  );
}
