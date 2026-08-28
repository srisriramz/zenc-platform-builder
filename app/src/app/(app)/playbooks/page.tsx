"use client";

import * as React from "react";
import { Bot, ShieldCheck } from "lucide-react";
import { usePlaybooks, usePlaybookDetail, useTransitionPlaybook } from "@/hooks/use-soc";
import { useCapabilities } from "@/hooks/use-platform";
import { useNavParams } from "@/lib/use-nav";
import { formatTimestamp } from "@/lib/time";
import type { PlaybookLifecycleState } from "@/schemas";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionClassBadge, LifecycleBadge } from "@/components/domain-badges";
import { EntitlementMissingState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";

export default function PlaybooksPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading playbooks…" />}>
      <PlaybooksInner />
    </React.Suspense>
  );
}

function PlaybooksInner() {
  const { params, setParams } = useNavParams();
  const selected = params.get("playbook");
  const q = usePlaybooks();

  if (q.isError) {
    return (
      <>
        <PageHeader title="Playbooks" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Playbooks needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  const playbooks = q.data ?? [];

  return (
    <>
      <PageHeader
        title="Playbooks"
        description="Named, versioned response sequences. Same lifecycle as a detection rule — draft → test → peer review → approved → enabled. The Response Planner may propose and test one; only a human enables it. Every step declares its action class and a D3FEND response mapping up front."
      />

      <Card>
        <CardContent className="pt-5">
          {q.isLoading ? (
            <TableSkeleton cols={5} />
          ) : (
            <Table containerClassName="rounded-lg border border-border">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>Playbook</TableHead>
                  <TableHead className="w-28">State</TableHead>
                  <TableHead className="w-20">Steps</TableHead>
                  <TableHead className="w-40">Highest class</TableHead>
                  <TableHead className="w-24">Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playbooks.map((p) => {
                  const highest = p.steps.map((s) => s.action_class).sort().at(-1) ?? "A0";
                  return (
                    <TableRow
                      key={p.playbook_id}
                      data-state={selected === p.playbook_id ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => setParams({ playbook: p.playbook_id })}
                    >
                      <TableCell>
                        <span className="font-medium">{p.name}</span>
                        {p.is_agent_proposed && (
                          <Badge variant="outline" className="ml-2">
                            <Bot className="size-3" /> agent-proposed
                          </Badge>
                        )}
                        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{p.playbook_id}</span>
                      </TableCell>
                      <TableCell><LifecycleBadge state={p.lifecycle_state} /></TableCell>
                      <TableCell className="tabular-nums">{p.steps.length}</TableCell>
                      <TableCell><ActionClassBadge actionClass={highest} /></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">v{p.version}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div className="mt-4">
          <PlaybookDetail playbookId={selected} onClose={() => setParams({ playbook: null })} />
        </div>
      )}
    </>
  );
}

function PlaybookDetail({ playbookId, onClose }: { playbookId: string; onClose: () => void }) {
  const q = usePlaybookDetail(playbookId);
  const caps = useCapabilities();
  const transition = useTransitionPlaybook();

  if (q.isLoading) return <Card><CardContent className="pt-5"><LoadingState label="Loading…" /></CardContent></Card>;
  if (q.isError || !q.data) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;

  const pb = q.data.playbook;

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{pb.name}</CardTitle>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{pb.playbook_id} · v{pb.version}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <LifecycleBadge state={pb.lifecycle_state} />
          {pb.proposed_by && <span className="text-xs text-muted-foreground">proposed by {pb.proposed_by}</span>}
          {pb.enabled_by && <span className="text-xs text-muted-foreground">· enabled by {pb.enabled_by}</span>}
        </div>

        {pb.test_results && (
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
            <span className="font-medium">Test:</span> {pb.test_results.passed ? "passed" : "not passed"} against{" "}
            <span className="font-mono">{pb.test_results.run_against_synthetic_case_id}</span> — {pb.test_results.notes}
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Steps</p>
          <ol className="space-y-1.5">
            {pb.steps.slice().sort((a, b) => a.order - b.order).map((s) => (
              <li key={s.step_id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{s.order}.</span>
                    {s.description}
                  </span>
                  <ActionClassBadge actionClass={s.action_class} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {s.action_type && <span className="font-mono">{s.action_type}</span>}
                  {s.d3fend_mapping?.map((d) => (
                    <Badge key={d.d3fend_technique_id} variant="outline">
                      <ShieldCheck className="size-3" /> {d.d3fend_technique_id} {d.d3fend_technique_name}
                    </Badge>
                  ))}
                  {s.d3fend_unmapped && <Badge variant="outline">D3FEND: unmapped (reviewed)</Badge>}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {caps.data?.permissions.some((p) => p === "action.request" || p === "action.approve") ? (
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Lifecycle</p>
            <div className="flex flex-wrap gap-1.5">
              {pb.allowed_transitions.length === 0 && <span className="text-xs text-muted-foreground">No transition available to your role from “{pb.lifecycle_state}”.</span>}
              {pb.allowed_transitions.map((to: PlaybookLifecycleState) => (
                <Button key={to} size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ playbookId, to })}>
                  → {to}
                </Button>
              ))}
            </div>
            {transition.isError && <p className="mt-1 text-xs text-[var(--destructive)]">{(transition.error as Error)?.message}</p>}
          </div>
        ) : null}

        {pb.history && pb.history.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">History</p>
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {pb.history.map((h, i) => (
                <li key={i}>
                  {formatTimestamp(h.changed_at)} — {h.from_state} → {h.to_state} by <span className="font-mono">{h.changed_by}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
