"use client";

import Link from "next/link";
import { ArrowUpRight, Undo2 } from "lucide-react";
import { useActionLog, useRollbackAction } from "@/hooks/use-soc";
import { useBootstrap } from "@/hooks/use-platform";
import { formatTimestamp } from "@/lib/time";
import { AGENT_MAP } from "@/data/agents";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionClassBadge, ActionStatusBadge } from "@/components/domain-badges";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";

export default function ActionsPage() {
  const q = useActionLog();
  const boot = useBootstrap();
  const rollback = useRollbackAction();
  const nameOf = (id: string) => AGENT_MAP[id]?.label ?? boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;

  if (q.isError) {
    return (
      <>
        <PageHeader title="Response Actions" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Response Actions needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  const rows = q.data ?? [];

  return (
    <>
      <PageHeader
        title="Response Actions"
        description="The execution / verification / rollback log. The Response Executor is a deterministic service — not an agent — and only ever runs an approved request: precondition re-check, kill-switch gate, idempotent dry-run, a verification step, and a rollback path for anything reversible. Every action here is simulation-only."
      />

      {q.isLoading ? (
        <LoadingState label="Loading action log…" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No decided or executed actions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ request: r, case_title, can_rollback }) => (
            <Card key={r.action_request_id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {r.action_type}
                      {r.target && <span className="text-muted-foreground"> on {r.target}</span>}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        dry run
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Link href={`/cases/${r.case_id}`} className="inline-flex items-center gap-0.5 hover:underline">
                        {case_title} <ArrowUpRight className="size-3" />
                      </Link>
                      <span className="ml-1 font-mono">{r.action_request_id}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ActionClassBadge actionClass={r.action_class} />
                    <ActionStatusBadge status={r.status} />
                  </div>
                </div>

                <dl className="grid gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
                  {r.requested_by && <Kv k="Requested by" v={nameOf(r.requested_by.principal_id)} />}
                  {r.approved_by && <Kv k="Approved by" v={`${nameOf(r.approved_by.principal_id)} (human)`} />}
                  {r.policy_basis && <Kv k="Policy basis" v={r.policy_basis} />}
                  {r.denied_reason && <Kv k="Denied" v={r.denied_reason} />}
                  {r.expires_at && <Kv k="Approval expires" v={formatTimestamp(r.expires_at)} />}
                  {r.execution && (
                    <Kv
                      k="Executed"
                      v={`${formatTimestamp(r.execution.executed_at)} — precondition re-check ${r.execution.precondition_recheck_passed ? "passed" : "FAILED"}`}
                    />
                  )}
                  {r.execution?.result_note && <Kv k="Result" v={r.execution.result_note} />}
                  {r.verification && (
                    <Kv k="Verification" v={`${r.verification.outcome_confirmed ? "confirmed" : "not confirmed"} — ${r.verification.notes ?? ""}`} />
                  )}
                  {r.rollback?.rolled_back_at && <Kv k="Rolled back" v={`${formatTimestamp(r.rollback.rolled_back_at)} by ${nameOf(r.rollback.rolled_back_by ?? "")}`} />}
                  <Kv k="Reversible" v={(r.rollback?.reversible ?? r.reversible) ? "yes — rollback path available" : "no — marked irreversible before execution"} />
                </dl>

                {can_rollback && (
                  <div className="border-t border-border pt-2">
                    <Button size="sm" variant="outline" disabled={rollback.isPending} onClick={() => rollback.mutate(r.action_request_id)}>
                      <Undo2 className="size-3" /> Roll back (dry-run)
                    </Button>
                    {rollback.isError && <p className="mt-1 text-xs text-[var(--destructive)]">{(rollback.error as Error)?.message}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="font-medium text-foreground">{k}: </span>
      {v}
    </div>
  );
}
