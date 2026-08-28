"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { useAgentRun, useRecordFeedback } from "@/hooks/use-siem";
import { useCapabilities } from "@/hooks/use-platform";
import { AGENT_MAP } from "@/data/agents";
import { drillHref } from "@/lib/use-nav";
import { formatDuration, formatTimestamp } from "@/lib/time";
import type { AnalystFeedback } from "@/schemas";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { LoadingState, QueryErrorState } from "@/components/states";

export default function AgentRunPage() {
  const params = useParams<{ id: string }>();
  const run = useAgentRun(params.id ?? null);
  const caps = useCapabilities();
  const feedbackMut = useRecordFeedback();
  const [determination, setDetermination] = React.useState("");
  const [mapsTo, setMapsTo] = React.useState<AnalystFeedback["maps_to_closure_classification"] | "">("");

  if (run.isLoading) return <LoadingState label="Loading agent run…" />;
  if (run.isError || !run.data) return <QueryErrorState error={run.error} onRetry={() => run.refetch()} />;

  const { run: r, messages, rule } = run.data;
  const canReview = caps.data?.permissions.includes("rule.review") || caps.data?.permissions.includes("case.work");

  return (
    <>
      <PageHeader
        title="Agent run"
        description="Rationale, evidence (supporting and contradictory), tool calls, policy outcome, versions, and the human decision — the full explainability record."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/agents/runs">All runs</Link>
        </Button>
      </PageHeader>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="font-mono text-sm">{r.agent_run_id}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.subject_type ?? "case"}: {rule ? rule.name : r.case_id}
              {rule && (
                <Link href={drillHref("/detections", { rule: rule.rule_id })} className="ml-2 inline-flex items-center gap-0.5 text-primary hover:underline">
                  open <ArrowUpRight className="size-3" />
                </Link>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={r.outcome === "completed" ? "success" : r.outcome.startsWith("escalated") ? "warning" : "danger"}>
              {r.outcome.replace(/_/g, " ")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {r.total_tool_calls ?? 0} tool calls · {r.elapsed_seconds != null ? formatDuration(r.elapsed_seconds) : "—"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {r.human_touchpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No human touchpoints yet — this run is waiting on a person.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {r.human_touchpoints.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  {formatTimestamp(h.at)} — <span className="capitalize text-foreground">{h.action}</span> by{" "}
                  <span className="font-mono">{h.principal_id}</span>
                  {h.note && ` — “${h.note}”`}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 space-y-4">
        {messages.map((m, i) => {
          const agent = AGENT_MAP[m.agent_name];
          const supporting = m.evidence.filter((e) => e.supports);
          const contradictory = m.evidence.filter((e) => !e.supports);
          return (
            <Card key={m.message_id} className={m.escalated ? "border-[var(--warning)]/50" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    Step {i + 1} · {agent?.label ?? m.agent_name}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{Math.round(m.confidence * 100)}% confidence</Badge>
                    {m.escalated && (
                      <Badge variant="warning">
                        <TriangleAlert className="size-3" /> escalated
                      </Badge>
                    )}
                  </span>
                </CardTitle>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {m.prompt_version} · {m.tool_version}
                  {m.rule_or_playbook_version && ` · ${m.rule_or_playbook_version}`}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Rationale (claim)</p>
                  <p className="mt-0.5">{m.claim}</p>
                </div>

                {m.tool_calls.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Tool calls</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {m.tool_calls.map((t, j) => (
                        <li key={j} className="font-mono text-[11px] text-muted-foreground">
                          {t.tool_name}
                          {t.scope_or_bound && <span> — {t.scope_or_bound}</span>}
                          {agent && !agent.tools.some((at) => at.name === t.tool_name) && (
                            <span className="ml-1 text-[var(--destructive)]">⚠ outside allowlist</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-1 text-xs font-medium text-[var(--success)]">
                      <CheckCircle2 className="size-3" /> Supporting evidence
                    </p>
                    <ul className="mt-0.5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {supporting.length === 0 && <li>—</li>}
                      {supporting.map((e, j) => (
                        <li key={j}>
                          {e.evidence_ref}
                          {e.freshness && <span> · {formatTimestamp(e.freshness)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-xs font-medium text-[var(--warning)]">
                      <TriangleAlert className="size-3" /> Contradictory evidence
                    </p>
                    <ul className="mt-0.5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {contradictory.length === 0 && <li>none</li>}
                      {contradictory.map((e, j) => (
                        <li key={j}>{e.evidence_ref}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {(m.escalated || m.policy_outcome) && (
                  <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                    {m.escalated && (
                      <p>
                        <span className="font-medium text-foreground">Escalation:</span> {m.escalation_reason?.replace(/_/g, " ")}
                      </p>
                    )}
                    {m.policy_outcome && (
                      <p>
                        <span className="font-medium text-foreground">Policy outcome:</span> {m.policy_outcome}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* analyst feedback */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Analyst feedback</CardTitle>
          <p className="text-sm text-muted-foreground">
            A correction is captured as a structured record — what the agent claimed, what the human determined, and
            which version it implicates — not a comment lost in a log.
          </p>
        </CardHeader>
        <CardContent>
          {r.analyst_feedback ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Human determination: </span>
                {r.analyst_feedback.human_determination}
              </p>
              {r.analyst_feedback.maps_to_closure_classification && (
                <p>
                  <span className="text-muted-foreground">Maps to: </span>
                  {r.analyst_feedback.maps_to_closure_classification.replace(/_/g, " ")}
                </p>
              )}
              {r.analyst_feedback.implicates_version && (
                <p className="font-mono text-xs text-muted-foreground">implicates {r.analyst_feedback.implicates_version}</p>
              )}
            </div>
          ) : canReview ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!determination.trim()) return;
                feedbackMut.mutate({
                  runId: r.agent_run_id,
                  feedback: {
                    human_determination: determination.trim(),
                    maps_to_closure_classification: mapsTo || undefined,
                    implicates_version: rule ? `${rule.rule_id}-v${rule.version}` : undefined,
                    agent_claim_ref: messages[messages.length - 1]?.message_id,
                  },
                });
              }}
            >
              <div>
                <Label htmlFor="det">What did you determine instead?</Label>
                <Input id="det" value={determination} onChange={(e) => setDetermination(e.target.value)} placeholder="e.g. the rule is too noisy — narrowed the time window before enabling" />
              </div>
              <div>
                <Label htmlFor="maps">Maps to closure classification (optional)</Label>
                <Select id="maps" value={mapsTo} onChange={(e) => setMapsTo(e.target.value as typeof mapsTo)} className="max-w-xs">
                  <option value="">—</option>
                  {["true_positive", "false_positive", "benign_true_positive", "duplicate", "suppressed"].map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" size="sm" disabled={feedbackMut.isPending || !determination.trim()}>
                Record feedback
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Your role cannot record feedback on this run.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
