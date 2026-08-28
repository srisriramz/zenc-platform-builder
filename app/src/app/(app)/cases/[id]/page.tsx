"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Bot, Play } from "lucide-react";
import {
  useCaseDetail,
  useAssignCaseOwner,
  useCloseCase,
  useRunCaseAgent,
  useSetCaseStatus,
} from "@/hooks/use-soc";
import { useBootstrap, useCapabilities } from "@/hooks/use-platform";
import { formatDuration, formatTimestamp } from "@/lib/time";
import type { CaseStatus, ClosureClassification } from "@/schemas";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CaseStatusBadge, SeverityBadge, SlaBadge } from "@/components/domain-badges";
import { LoadingState, QueryErrorState } from "@/components/states";
import { CaseAttackBreakdown } from "@/components/soc/case-attack-breakdown";
import { TriageRecommendation } from "@/components/soc/triage-recommendation";
import { CaseTimeline } from "@/components/soc/case-timeline";
import { CaseEvidence } from "@/components/soc/case-evidence";
import { CaseTasks, TaskSlaBadge } from "@/components/soc/case-tasks";
import { EnrichmentPanel, AdvisorPanel } from "@/components/soc/case-agent-panels";
import { CaseResponse } from "@/components/soc/case-response";

const CLOSURE_OPTIONS: ClosureClassification[] = ["true_positive", "false_positive", "benign_true_positive", "duplicate", "suppressed"];
const TABS = ["Overview", "Timeline", "Evidence", "Tasks", "Context", "Response", "Agents"] as const;
type Tab = (typeof TABS)[number];

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const q = useCaseDetail(params.id ?? null);
  const caps = useCapabilities();
  const boot = useBootstrap();
  const setStatus = useSetCaseStatus();
  const assign = useAssignCaseOwner();
  const close = useCloseCase();
  const runAgent = useRunCaseAgent();

  const [tab, setTab] = React.useState<Tab>("Overview");
  const [classification, setClassification] = React.useState<ClosureClassification>("true_positive");
  const [closeReason, setCloseReason] = React.useState("");

  const nameOf = (id: string) => boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;
  const canWork = !!caps.data?.permissions.includes("case.work");

  if (q.isLoading) return <LoadingState label="Loading case…" />;
  if (q.isError || !q.data) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;

  const {
    case: c, allowed_transitions, can_close, linkedAlerts, techniqueBreakdown, triage, agentRuns,
    evidence, tasks, task_sla, enrichment, advisor, timeline, latency, caseWorkers, canReviewEvidence,
    responsePlan, actionRequests, can_plan_response, can_request_action, kill_switch_scope,
  } = q.data;
  const needsReason = classification === "suppressed";
  const triageRunId = agentRuns.find((r) => r.agent_run_id.startsWith("run-triage"))?.agent_run_id;

  return (
    <>
      <PageHeader title={c.title ?? c.case_id} description={`${c.case_id} · ${c.tenant_id}`}>
        <Button asChild variant="outline" size="sm">
          <Link href="/cases">
            <ArrowLeft className="size-3.5" /> All cases
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-3">
              <Kv k="Status" v={<CaseStatusBadge status={c.status} />} />
              <Kv k="Severity" v={c.severity ? <SeverityBadge severity={c.severity} /> : "—"} />
              <Kv k="Owner" v={nameOf(c.owner_id)} />
              <Kv k="SLA" v={c.status === "closed" ? "—" : c.sla?.status ? <SlaBadge status={c.sla.status} /> : "—"} />
              <Kv k="Tasks" v={<TaskSlaBadge overdue={task_sla.overdue} dueSoon={task_sla.due_soon} />} />
              <Kv k="Evidence" v={`${evidence.filter((e) => e.review_state === "approved").length}/${evidence.length} approved`} />
              <Kv k="Opened" v={formatTimestamp(c.created_at)} mono />
              <Kv k="Triaged" v={formatTimestamp(c.triaged_at)} mono />
              {c.closed_at && <Kv k="Closed" v={formatTimestamp(c.closed_at)} mono />}
              {c.closure && (
                <div className="sm:col-span-3">
                  <p className="text-xs font-medium text-muted-foreground">Closure</p>
                  <p className="mt-0.5 text-sm">
                    {c.closure.classification.replace(/_/g, " ")}
                    {c.closure.reason && <span className="block text-xs text-muted-foreground">{c.closure.reason}</span>}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t}
                {t === "Evidence" && evidence.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({evidence.length})</span>}
                {t === "Tasks" && tasks.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({tasks.length})</span>}
              </button>
            ))}
          </div>

          {tab === "Overview" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Linked alerts ({linkedAlerts.length})</CardTitle>
                  <p className="text-xs text-muted-foreground">Native and third-party alerts are handled identically — the badge shows origin, the logic does not branch on it.</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {linkedAlerts.length === 0 && <p className="text-sm text-muted-foreground">No linked alerts (opened from a hunt result).</p>}
                  {linkedAlerts.map((a) => (
                    <div key={a.envelope_id} className="rounded-md border border-border p-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <SeverityBadge severity={a.severity} />
                          <span className="font-medium">{a.title}</span>
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {a.source.system} · schema {a.schema_version}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {a.envelope_id} · occurred {formatTimestamp(a.occurred_at)}
                        {a.correlated_at && ` · correlated ${formatTimestamp(a.correlated_at)}`}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>ATT&amp;CK technique breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <CaseAttackBreakdown breakdown={techniqueBreakdown} />
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "Timeline" && (
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <p className="text-xs text-muted-foreground">A derived view over the case&rsquo;s alerts, evidence, tasks, and agent runs.</p>
              </CardHeader>
              <CardContent>
                <CaseTimeline entries={timeline} />
              </CardContent>
            </Card>
          )}

          {tab === "Evidence" && (
            <Card>
              <CardHeader>
                <CardTitle>Evidence &amp; chain of custody</CardTitle>
              </CardHeader>
              <CardContent>
                <CaseEvidence
                  caseId={c.case_id}
                  evidence={evidence}
                  canWork={canWork}
                  canReview={canReviewEvidence}
                  currentUserId={boot.data?.user.user_id ?? ""}
                />
              </CardContent>
            </Card>
          )}

          {tab === "Tasks" && (
            <Card>
              <CardHeader>
                <CardTitle>Tasks &amp; SLA</CardTitle>
              </CardHeader>
              <CardContent>
                <CaseTasks caseId={c.case_id} tasks={tasks} canWork={canWork} workers={caseWorkers} nameOf={nameOf} />
              </CardContent>
            </Card>
          )}

          {tab === "Context" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Enrichment</CardTitle>
                  {canWork && (
                    <Button size="sm" variant="outline" disabled={runAgent.isPending} onClick={() => runAgent.mutate({ caseId: c.case_id, agent: "enrichment" })}>
                      <Play className="size-3" /> Re-run
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <EnrichmentPanel enrichment={enrichment} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Digital Advisor</CardTitle>
                  {canWork && (
                    <Button size="sm" variant="outline" disabled={runAgent.isPending} onClick={() => runAgent.mutate({ caseId: c.case_id, agent: "advisor" })}>
                      <Play className="size-3" /> Re-ask
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <AdvisorPanel advisor={advisor} />
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "Response" && (
            <CaseResponse
              caseId={c.case_id}
              plan={responsePlan}
              actionRequests={actionRequests}
              canPlan={can_plan_response}
              canRequest={can_request_action}
              canWork={canWork}
              killSwitchScope={kill_switch_scope}
            />
          )}

          {tab === "Agents" && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Agent activity</CardTitle>
                {canWork && (
                  <Button size="sm" variant="outline" disabled={runAgent.isPending} onClick={() => runAgent.mutate({ caseId: c.case_id, agent: "investigation" })}>
                    <Bot className="size-3" /> Run investigation
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {triage && <TriageRecommendation triage={triage} runId={triageRunId} />}
                {agentRuns.length === 0 && <p className="text-sm text-muted-foreground">No agent runs on this case yet.</p>}
                {agentRuns.map((r) => (
                  <Link
                    key={r.agent_run_id}
                    href={`/agents/runs/${r.agent_run_id}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      <Bot className="size-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs">{r.agent_run_id}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={r.outcome.startsWith("escalated") ? "warning" : "outline"}>{r.outcome.replace(/_/g, " ")}</Badge>
                      <ArrowUpRight className="size-3" />
                    </span>
                  </Link>
                ))}
                {runAgent.isError && <p className="text-xs text-[var(--destructive)]">{(runAgent.error as Error)?.message}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* actions rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!canWork ? (
                <p className="text-xs text-muted-foreground">
                  Your role can view this case but not work it. That needs <span className="font-mono">case.work</span>.
                </p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Move to</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allowed_transitions.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {allowed_transitions.map((to: CaseStatus) => (
                        <Button key={to} size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ caseId: c.case_id, to })}>
                          {to}
                        </Button>
                      ))}
                    </div>
                    {setStatus.isError && <p className="mt-1 text-xs text-[var(--destructive)]">{(setStatus.error as Error)?.message}</p>}
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Owner</p>
                    <Select className="h-8" value={c.owner_id} onChange={(e) => assign.mutate({ caseId: c.case_id, ownerId: e.target.value })} disabled={assign.isPending}>
                      {caseWorkers.map((w: { user_id: string; display_name: string }) => (
                        <option key={w.user_id} value={w.user_id}>
                          {w.display_name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {can_close && (
                    <div className="border-t border-border pt-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Close case</p>
                      <Select className="h-8" value={classification} onChange={(e) => setClassification(e.target.value as ClosureClassification)}>
                        {CLOSURE_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o.replace(/_/g, " ")}
                          </option>
                        ))}
                      </Select>
                      {needsReason && (
                        <input
                          className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                          placeholder="Reason (required for suppressed)"
                          value={closeReason}
                          onChange={(e) => setCloseReason(e.target.value)}
                        />
                      )}
                      <Button
                        size="sm"
                        className="mt-2 w-full"
                        disabled={close.isPending || (needsReason && !closeReason.trim())}
                        onClick={() => close.mutate({ caseId: c.case_id, classification, reason: closeReason.trim() || undefined })}
                      >
                        Close
                      </Button>
                      {close.isError && <p className="mt-1 text-xs text-[var(--destructive)]">{(close.error as Error)?.message}</p>}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline latency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <LatencyRow label="Detect (occurred → correlated)" seconds={mttdOf(linkedAlerts)} note="native alerts only" />
              <LatencyRow label="Acknowledge (received → triaged)" seconds={latency.ack_seconds} />
              <LatencyRow label="Resolve (opened → closed)" seconds={latency.resolve_seconds} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function mttdOf(alerts: { occurred_at: string; correlated_at?: string }[]): number | null {
  const xs = alerts.filter((a) => a.correlated_at).map((a) => (Date.parse(a.correlated_at!) - Date.parse(a.occurred_at)) / 1000);
  return xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null;
}

function LatencyRow({ label, seconds, note }: { label: string; seconds: number | null; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">
        {label}
        {note && <span className="ml-1 text-[10px]">({note})</span>}
      </span>
      <span className="font-mono tabular-nums">{seconds != null ? formatDuration(seconds) : "—"}</span>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{k}</p>
      <p className={mono ? "mt-0.5 font-mono text-[11px]" : "mt-0.5 text-sm"}>{v ?? "—"}</p>
    </div>
  );
}
