"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Ban, Copy, ShieldAlert } from "lucide-react";
import type { IntakeQueueResponse, IntakeQueueRow } from "@/mock/api";
import { useConfirmCaseOpen, useSuppressCandidate } from "@/hooks/use-soc";
import { useCapabilities } from "@/hooks/use-platform";
import { formatTimestamp } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge } from "@/components/domain-badges";
import { EmptyState } from "@/components/states";
import { TriageRecommendation } from "./triage-recommendation";

export function IntakeQueue({
  data,
  selectedId,
  onSelect,
}: {
  data: IntakeQueueResponse;
  selectedId: string | null;
  onSelect: (candidateId: string | null) => void;
}) {
  const selected =
    data.pending.find((r) => r.candidate.candidate_id === selectedId) ??
    data.actioned.find((r) => r.candidate.candidate_id === selectedId) ??
    null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,28rem)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending triage ({data.pending.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Grouped, accepted alerts awaiting a human open-vs-suppress decision. The Triage Agent recommends; a person
              confirms.
            </p>
          </CardHeader>
          <CardContent>
            {data.pending.length === 0 ? (
              <EmptyState title="Queue clear">Every accepted alert has been actioned into a case or suppressed.</EmptyState>
            ) : (
              <CandidateTable rows={data.pending} selectedId={selectedId} onSelect={onSelect} />
            )}
          </CardContent>
        </Card>

        {data.actioned.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Actioned ({data.actioned.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <CandidateTable rows={data.actioned} selectedId={selectedId} onSelect={onSelect} />
            </CardContent>
          </Card>
        )}

        {data.rejected.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Not accepted ({data.rejected.length})</CardTitle>
              <p className="text-xs text-muted-foreground">
                Nothing is dropped. A malformed or unsupported envelope is quarantined; a repeat of a{" "}
                <span className="font-mono">dedupe_key</span> is kept as a duplicate.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.rejected.map((item) => (
                <div key={item.intake_id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
                  {item.disposition === "quarantined" ? (
                    <ShieldAlert className="mt-0.5 size-4 flex-none text-[var(--warning)]" />
                  ) : (
                    <Copy className="mt-0.5 size-4 flex-none text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {item.envelope_id} · {item.source_system}
                    </p>
                    <p className="truncate">{item.envelope.title ?? "(no title)"}</p>
                    <p className="text-xs text-muted-foreground">
                      <Badge variant={item.disposition === "quarantined" ? "warning" : "outline"} className="mr-1.5 capitalize">
                        {item.disposition}
                      </Badge>
                      {item.disposition_reason}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        {selected ? (
          <CandidateDetail row={selected} onClose={() => onSelect(null)} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Select a candidate to see its grouped alerts, the Triage Agent recommendation, and the confirm / suppress
              controls.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CandidateTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: IntakeQueueRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Table containerClassName="rounded-lg border border-border">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">Last activity</TableHead>
          <TableHead className="w-20">Severity</TableHead>
          <TableHead>Grouped alerts</TableHead>
          <TableHead className="w-28">Triage</TableHead>
          <TableHead className="w-24">State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.candidate.candidate_id}
            data-state={selectedId === r.candidate.candidate_id ? "selected" : undefined}
            className="cursor-pointer"
            onClick={() => onSelect(r.candidate.candidate_id)}
          >
            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {formatTimestamp(r.candidate.last_occurred_at)}
            </TableCell>
            <TableCell>
              <SeverityBadge severity={r.candidate.max_severity} />
            </TableCell>
            <TableCell>
              <div className="font-medium">{r.candidate.envelope_ids.length} alert{r.candidate.envelope_ids.length === 1 ? "" : "s"}</div>
              <div className="line-clamp-1 text-xs text-muted-foreground">{r.candidate.grouping_rationale}</div>
            </TableCell>
            <TableCell className="text-xs">
              {r.triage ? (
                <Badge variant={r.triage.recommendation === "suppress" ? "outline" : "warning"} className="capitalize">
                  {r.triage.recommendation}
                </Badge>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-xs">
              {r.decision === "opened" ? (
                <Badge variant="success">opened</Badge>
              ) : r.decision === "suppressed" ? (
                <Badge variant="outline">suppressed</Badge>
              ) : (
                <Badge variant="info">pending</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CandidateDetail({ row, onClose }: { row: IntakeQueueRow; onClose: () => void }) {
  const caps = useCapabilities();
  const canWork = caps.data?.permissions.includes("case.work");
  const confirmOpen = useConfirmCaseOpen();
  const suppress = useSuppressCandidate();
  const [reason, setReason] = React.useState("");
  const pending = row.decision === null;

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Intake candidate</CardTitle>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{row.candidate.candidate_id}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Grouped because</p>
          <p className="text-sm">{row.candidate.grouping_rationale}</p>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Alerts in this candidate</p>
          <ul className="space-y-1">
            {row.alerts.map((a) => (
              <li key={a.envelope_id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="font-medium">{a.title}</span>
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {a.source.system}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {a.envelope_id} · schema {a.schema_version} · occurred {formatTimestamp(a.occurred_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {(row.candidate.techniques.length > 0 || row.candidate.entities.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {row.candidate.techniques.map((t) => (
              <Badge key={t.technique_id} variant="outline" className="font-mono text-[10px]">
                {t.technique_id}
              </Badge>
            ))}
            {row.candidate.entities.slice(0, 8).map((e, i) => (
              <span key={i} className="rounded border border-border px-2 py-0.5 font-mono text-[11px]">
                <span className="text-muted-foreground">{e.entity_type}</span> {e.value}
              </span>
            ))}
          </div>
        )}

        {row.triage && <TriageRecommendation triage={row.triage} runId={`run-triage-${row.candidate.candidate_id}`} />}

        {row.decision === "opened" && row.case_id && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${row.case_id}`}>
              Open case <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        )}
        {row.decision === "suppressed" && (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            <Ban className="mr-1 inline size-3" />
            Suppressed by <span className="font-mono">{row.decided_by}</span> — “{row.suppress_reason}”
          </p>
        )}

        {pending && canWork && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Your decision (L2 — a human confirms)</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={confirmOpen.isPending}
                onClick={() => confirmOpen.mutate(row.candidate.candidate_id)}
              >
                Confirm — open case
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                placeholder="Reason (required to suppress)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={suppress.isPending || !reason.trim()}
                onClick={() => suppress.mutate({ candidateId: row.candidate.candidate_id, reason })}
              >
                Suppress
              </Button>
            </div>
            {(confirmOpen.isError || suppress.isError) && (
              <p className="text-xs text-[var(--destructive)]">
                {(confirmOpen.error as Error)?.message ?? (suppress.error as Error)?.message}
              </p>
            )}
          </div>
        )}
        {pending && !canWork && (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Your role can review the queue but not open or suppress. That needs <span className="font-mono">case.work</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
