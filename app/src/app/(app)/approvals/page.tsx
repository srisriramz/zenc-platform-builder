"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, ShieldAlert, ShieldCheck } from "lucide-react";
import { useApprovalQueue, useApproveAction, useDenyAction } from "@/hooks/use-soc";
import { useBootstrap } from "@/hooks/use-platform";
import { formatRelative } from "@/lib/time";
import { AGENT_MAP } from "@/data/agents";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Card, CardContent, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionClassBadge } from "@/components/domain-badges";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";

export default function ApprovalsPage() {
  const q = useApprovalQueue();
  const boot = useBootstrap();
  const nameOf = (id: string) => AGENT_MAP[id]?.label ?? boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;

  if (q.isError) {
    return (
      <>
        <PageHeader title="Approval Queue" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="The Approval Queue needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  const d = q.data;
  const rows = d?.rows ?? [];
  const byClass = (c: string) => rows.filter((r) => r.request.action_class === c).length;

  return (
    <>
      <PageHeader
        title="Approval Queue"
        description="An action request needs approval per its class: A2 at the default L2 autonomy, A3 unless a precise tenant policy pre-authorizes that exact action type, A4 always — regardless of policy. The requester can never be the approver (enforced in validation, not just the UI)."
      />

      {q.isLoading || !d ? (
        <LoadingState label="Loading queue…" />
      ) : (
        <>
          <StatGrid>
            <StatTile label="Pending" value={rows.length} tone={rows.length ? "primary" : "success"} />
            <StatTile label="A2 · reversible" value={byClass("A2")} />
            <StatTile label="A3 · security control" value={byClass("A3")} tone={byClass("A3") ? "warning" : "default"} />
            <StatTile label="A4 · broad / privileged" value={byClass("A4")} tone={byClass("A4") ? "danger" : "default"} />
          </StatGrid>

          <div className="mt-6 space-y-3">
            {rows.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nothing pending approval. Requests appear here when a responder submits an A2+ action from a case.
                </CardContent>
              </Card>
            ) : (
              rows.map((row) => (
                <ApprovalRow key={row.request.action_request_id} row={row} canApprove={d.can_approve} nameOf={nameOf} />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}

type Row = NonNullable<ReturnType<typeof useApprovalQueue>["data"]>["rows"][number];

function ApprovalRow({ row, canApprove, nameOf }: { row: Row; canApprove: boolean; nameOf: (id: string) => string }) {
  const approve = useApproveAction();
  const deny = useDenyAction();
  const [reason, setReason] = React.useState("");
  const r = row.request;

  return (
    <Card className={r.action_class === "A4" ? "border-[var(--destructive)]/40" : r.action_class === "A3" ? "border-[var(--warning)]/40" : undefined}>
      <CardContent className="space-y-2 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {r.action_type}
              {r.target && <span className="text-muted-foreground"> on {r.target}</span>}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{r.summary}</p>
          </div>
          <ActionClassBadge actionClass={r.action_class} />
        </div>

        <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="font-mono">{r.action_request_id}</span>
          <Link href={`/cases/${r.case_id}`} className="inline-flex items-center gap-0.5 hover:underline">
            case <ArrowUpRight className="size-3" />
          </Link>
          <span>· requested by {nameOf(r.requested_by.principal_id)}</span>
          {r.requested_at && <span>· {formatRelative(r.requested_at)}</span>}
          {r.playbook_step_id && <span>· from playbook step {r.playbook_step_id}</span>}
          <span>· dry-run</span>
        </p>

        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
          <span className="font-medium text-foreground">Policy:</span> {row.requirement.rationale}
        </div>

        {canApprove ? (
          row.can_i_approve ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(r.action_request_id)}>
                <ShieldCheck className="size-3" /> Approve
              </Button>
              <Input className="h-8 flex-1" placeholder="Reason (required to deny)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" variant="outline" disabled={deny.isPending || !reason.trim()} onClick={() => deny.mutate({ id: r.action_request_id, reason })}>
                Deny
              </Button>
              {(approve.isError || deny.isError) && (
                <p className="w-full text-xs text-[var(--destructive)]">{(approve.error as Error)?.message ?? (deny.error as Error)?.message}</p>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 border-t border-border pt-2 text-xs text-[var(--warning)]">
              <ShieldAlert className="size-3.5" /> {row.block_reason}
            </p>
          )
        ) : (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            Your role can watch the queue but not decide. Approving needs <span className="font-mono">action.approve</span>.
            {AGENT_MAP[r.requested_by.principal_id] && (
              <span className="ml-1 inline-flex items-center gap-1">
                <Bot className="size-3" /> drafted by an agent — a human still approves.
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
