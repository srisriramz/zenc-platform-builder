"use client";

import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import type { HealthState } from "@/schemas";
import { usePipelineFunnel } from "@/hooks/use-pipeline";
import { WHY_SOC_CONTENT } from "@/lib/why-soc/content";
import { formatCount } from "@/lib/format";
import { formatDuration } from "@/lib/time";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { QueryErrorState, TableSkeleton } from "@/components/states";
import { HealthBadge } from "@/components/domain-badges";
import { FunnelDiagram } from "@/components/why-soc/funnel-diagram";
import { AgentLane } from "@/components/why-soc/agent-lane";

const C = WHY_SOC_CONTENT;

export default function WhySocPage() {
  const q = usePipelineFunnel();

  return (
    <>
      <PageHeader title="Why a SOC" description={C.hero.lede} />

      {q.isError && <QueryErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && <TableSkeleton rows={8} cols={3} />}

      {q.data && (
        <div className="space-y-14">
          {/* 1 — the problem */}
          <section className="space-y-4">
            <SectionEyebrow>{C.problem.title}</SectionEyebrow>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                {C.problem.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">
                    {q.data.funnel.tenantLabel} — {q.data.funnel.families.length} device families, live estimate
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold tabular-nums">
                    {formatCount(q.data.funnel.stages[0].value, 1)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">events / day</span>
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {q.data.funnel.families.map((f) => (
                      <li key={f.family} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{f.label}</span>
                          <HealthBadge health={f.health as HealthState} />
                        </span>
                        <span className="tabular-nums text-muted-foreground">{f.sharePct}% of volume</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 2 — the funnel */}
          <section className="space-y-4">
            <SectionEyebrow>{C.funnel.title}</SectionEyebrow>
            <p className="max-w-2xl text-sm text-muted-foreground">{C.funnel.lede}</p>
            <FunnelDiagram funnel={q.data.funnel} />
          </section>

          {/* 3 — the agents */}
          <section className="space-y-4">
            <SectionEyebrow>{C.agents.title}</SectionEyebrow>
            <p className="max-w-2xl text-sm text-muted-foreground">{C.agents.lede}</p>
            <AgentLane funnel={q.data.funnel} />
          </section>

          {/* 4 — the outcome */}
          <section className="space-y-4">
            <SectionEyebrow>{C.outcome.title}</SectionEyebrow>
            <p className="max-w-2xl text-sm text-muted-foreground">{C.outcome.lede}</p>
            <StatGrid>
              <StatTile
                label="Mean time to detect"
                value={q.data.funnel.outcome.mttdSeconds != null ? formatDuration(q.data.funnel.outcome.mttdSeconds) : "—"}
                sub="event occurred → alert correlated"
                tone="primary"
              />
              <StatTile
                label="Mean time to resolve"
                value={q.data.funnel.outcome.mttrSeconds != null ? formatDuration(q.data.funnel.outcome.mttrSeconds) : "—"}
                sub="case opened → closed"
              />
              <StatTile
                label="Agent-assisted cases"
                value={`${q.data.funnel.outcome.agentAssistedPct}%`}
                sub={
                  q.data.funnel.outcome.agentAcceptancePct > 0
                    ? `${q.data.funnel.outcome.agentAcceptancePct}% of reviewed runs accepted as-is`
                    : "an agent touched every case"
                }
              />
              <StatTile
                label="ATT&CK coverage"
                value={q.data.funnel.outcome.detectionCoveragePct != null ? `${q.data.funnel.outcome.detectionCoveragePct}%` : "—"}
                sub={
                  q.data.funnel.outcome.responseCoveragePct != null
                    ? `${q.data.funnel.outcome.responseCoveragePct}% with a response playbook`
                    : undefined
                }
                href="/coverage"
              />
            </StatGrid>

            <Card>
              <CardContent className="flex flex-col items-start gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Every figure on this page is live from the {q.data.funnel.tenantLabel} demo tenant. Walk the same
                  pipeline step by step, or open the operational screens directly.
                </p>
                <div className="flex flex-none gap-2">
                  <Button asChild size="sm">
                    <Link href="/demo">
                      <PlayCircle /> Guided walkthrough
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/siem-dashboard">
                      Dashboards <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
      <span className="h-px w-8 bg-primary/50" />
      {children}
    </h2>
  );
}
