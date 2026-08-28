"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, CheckCircle2, Play, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { ActionRequest } from "@/schemas";
import type { ResponsePlan } from "@/lib/soc/response-planner";
import { usePlanCaseResponse, useRequestAction, useExecuteAction, useCaseOrchestration } from "@/hooks/use-soc";
import { formatTimestamp } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionClassBadge, ActionStatusBadge } from "@/components/domain-badges";

export function CaseResponse({
  caseId,
  plan,
  actionRequests,
  canPlan,
  canRequest,
  canWork,
}: {
  caseId: string;
  plan: ResponsePlan | null;
  actionRequests: ActionRequest[];
  canPlan: boolean;
  canRequest: boolean;
  canWork: boolean;
}) {
  const planMut = usePlanCaseResponse();
  const requestMut = useRequestAction();
  const execMut = useExecuteAction();
  const orch = useCaseOrchestration(caseId);

  const reqByStep = new Map(actionRequests.filter((r) => r.playbook_step_id).map((r) => [r.playbook_step_id, r] as const));

  return (
    <div className="space-y-4">
      {/* Supervisor summary */}
      {orch.data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4" /> Supervisor
            </CardTitle>
            <p className="text-xs text-muted-foreground">Orchestration only — routing and policy enforcement. Never approves or executes.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {orch.data.supervisor.routed.map((r) => (
                <Link key={r.run_id} href={`/agents/runs/${r.run_id}`} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent">
                  {r.agent_label} · {r.outcome.replace(/_/g, " ")}
                </Link>
              ))}
            </div>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {orch.data.supervisor.policy_notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
            <p className={`flex items-center gap-1.5 text-xs ${orch.data.supervisor.invariants_ok ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
              {orch.data.supervisor.invariants_ok ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
              {orch.data.supervisor.invariants_ok
                ? "Invariants hold: no agent approved or executed an action; no self-approval; every A3+ has a human approver or policy basis."
                : orch.data.supervisor.violations.join("; ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Response plan */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Response plan</CardTitle>
          {canPlan && (
            <Button size="sm" variant="outline" disabled={planMut.isPending} onClick={() => planMut.mutate(caseId)}>
              <Play className="size-3" /> {plan ? "Re-plan" : "Plan response"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!plan ? (
            <p className="text-sm text-muted-foreground">
              No plan yet. The Response Planner matches the case&rsquo;s ATT&amp;CK techniques to an enabled playbook; every
              step&rsquo;s action class is labelled up front so approval requirements are known before anything runs.
            </p>
          ) : plan.source === "no_match" ? (
            <p className="text-sm text-muted-foreground">{plan.summary}</p>
          ) : (
            <>
              <p className="text-sm">{plan.summary}</p>
              <ol className="space-y-2">
                {plan.steps.map((s) => {
                  const existing = reqByStep.get(s.step_id);
                  return (
                    <li key={s.step_id} className="rounded-md border border-border p-2.5 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span>
                          <span className="mr-2 font-mono text-xs text-muted-foreground">{s.order}.</span>
                          {s.description}
                          {s.target && <span className="text-muted-foreground"> → {s.target}</span>}
                        </span>
                        <ActionClassBadge actionClass={s.action_class} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-mono">{s.action_type}</span>
                        {s.d3fend.map((d) => (
                          <Badge key={d.d3fend_technique_id} variant="outline">{d.d3fend_technique_id}</Badge>
                        ))}
                        {s.d3fend_unmapped && <Badge variant="outline">D3FEND unmapped</Badge>}
                      </p>
                      {s.escalation && (
                        <p className="mt-1 flex items-start gap-1 text-[11px] text-[var(--warning)]">
                          <ShieldQuestion className="mt-0.5 size-3 flex-none" /> {s.escalation}
                        </p>
                      )}
                      <div className="mt-2">
                        {existing ? (
                          <span className="flex items-center gap-1.5 text-xs">
                            <ActionStatusBadge status={existing.status} />
                            <Link href="/approvals" className="text-primary hover:underline">
                              {existing.status === "pending_approval" ? "in the approval queue" : "see Response Actions"}
                            </Link>
                          </span>
                        ) : s.action_class === "A0" || s.action_class === "A1" ? (
                          <span className="text-[11px] text-muted-foreground">A0/A1 — no request needed.</span>
                        ) : canRequest ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={requestMut.isPending}
                            onClick={() =>
                              requestMut.mutate({
                                case_id: caseId,
                                playbook_id: plan.playbook_id ?? undefined,
                                playbook_step_id: s.step_id,
                                action_class: s.action_class as "A2" | "A3" | "A4",
                                action_type: s.action_type,
                                target: s.target ?? undefined,
                                summary: s.description,
                              })
                            }
                          >
                            Request approval for this step
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Requesting an action needs action.request.</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          {(planMut.isError || requestMut.isError) && (
            <p className="text-xs text-[var(--destructive)]">{(planMut.error as Error)?.message ?? (requestMut.error as Error)?.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Action requests for this case */}
      {actionRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Action requests ({actionRequests.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionRequests.map((r) => (
              <div key={r.action_request_id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.action_type}
                    {r.target && <span className="text-muted-foreground"> on {r.target}</span>}
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">dry run</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ActionClassBadge actionClass={r.action_class} />
                    <ActionStatusBadge status={r.status} />
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  requested by {r.requested_by.principal_id}
                  {r.approved_by && ` · approved by ${r.approved_by.principal_id} (human)`}
                  {r.policy_basis && ` · ${r.policy_basis}`}
                  {r.execution && ` · executed ${formatTimestamp(r.execution.executed_at)}`}
                </p>
                {r.status === "approved" && canWork && (
                  <Button size="sm" className="mt-2 h-7" disabled={execMut.isPending} onClick={() => execMut.mutate(r.action_request_id)}>
                    Execute (dry-run)
                  </Button>
                )}
                {r.status === "pending_approval" && (
                  <Link href="/approvals" className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                    open in the approval queue <ArrowUpRight className="size-3" />
                  </Link>
                )}
                {r.execution?.result_note && <p className="mt-1 text-[11px] text-muted-foreground">{r.execution.result_note}</p>}
                {execMut.isError && <p className="mt-1 text-[11px] text-[var(--destructive)]">{(execMut.error as Error)?.message}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
