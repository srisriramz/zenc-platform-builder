"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useAgentRuns } from "@/hooks/use-siem";
import { drillHref } from "@/lib/use-nav";
import { formatRelative, formatDuration } from "@/lib/time";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, QueryErrorState, TableSkeleton } from "@/components/states";

const OUTCOME_VARIANT: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
  completed: "success",
  escalated_pending_human: "warning",
  denied: "danger",
  expired: "outline",
  error: "danger",
};

export default function AgentRunsPage() {
  const runs = useAgentRuns();

  return (
    <>
      <PageHeader
        title="Agent Runs"
        description="Every end-to-end agentic task, with its full message trail. An agent output that doesn't fit the agent-message / agent-run shape doesn't ship — this is what makes post-hoc audit possible."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/agents">Roster</Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-5">
          {runs.isLoading && <TableSkeleton cols={5} />}
          {runs.isError && <QueryErrorState error={runs.error} onRetry={() => runs.refetch()} />}
          {runs.data?.length === 0 && (
            <EmptyState title="No agent runs yet">
              The Detection Engineer Agent produces a run when it proposes a rule (from Detection Engineering).
            </EmptyState>
          )}
          {runs.data && runs.data.length > 0 && (
            <Table containerClassName="rounded-lg border border-border">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data.map((r) => (
                  <TableRow key={r.agent_run_id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatRelative(r.started_at)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{r.subject_label}</div>
                      <div className="text-[11px] text-muted-foreground">{r.subject_type ?? "case"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[...new Set(r.message_ids.map((m) => m.split("-")[1]))].length} step
                      {r.message_ids.length === 1 ? "" : "s"} · {r.total_tool_calls ?? 0} tool calls
                    </TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_VARIANT[r.outcome] ?? "outline"}>{r.outcome.replace(/_/g, " ")}</Badge>
                      {r.analyst_feedback && (
                        <Badge variant="info" className="ml-1">
                          feedback
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {r.elapsed_seconds != null ? formatDuration(r.elapsed_seconds) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="h-7">
                        <Link href={drillHref(`/agents/runs/${r.agent_run_id}`, {})}>
                          Explain
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
