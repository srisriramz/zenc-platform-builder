"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Hash, User } from "lucide-react";
import { useEvidenceQueue, useReviewEvidence } from "@/hooks/use-soc";
import { useBootstrap } from "@/hooks/use-platform";
import { useNavParams } from "@/lib/use-nav";
import { formatTimestamp } from "@/lib/time";
import { AGENT_MAP } from "@/data/agents";
import type { Evidence } from "@/schemas";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Card, CardContent, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EvidenceStateBadge } from "@/components/domain-badges";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";

export default function EvidencePage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading evidence…" />}>
      <EvidenceInner />
    </React.Suspense>
  );
}

function EvidenceInner() {
  const { params, setParams } = useNavParams();
  const state = params.get("state") ?? undefined;
  const q = useEvidenceQueue(state ? { state } : {});
  const boot = useBootstrap();
  const nameOf = (id: string) => AGENT_MAP[id]?.label ?? boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id;

  if (q.isError) {
    return (
      <>
        <PageHeader title="Evidence Review" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Evidence Review needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  const d = q.data;

  return (
    <>
      <PageHeader
        title="Evidence Review"
        description="Case evidence follows the same chain-of-custody rules as Assessment evidence: not editable once added (corrections are new items that supersede the old), a content hash is recorded as a tamper-evidence marker, and a second person reviews it before it counts. One approve/reject pattern regardless of origin."
      />

      {q.isLoading || !d ? (
        <LoadingState label="Loading evidence…" />
      ) : (
        <>
          <StatGrid>
            <StatTile label="Submitted" value={d.counts.submitted} tone={d.counts.submitted ? "primary" : "default"} onClick={() => setParams({ state: "submitted" })} />
            <StatTile label="Under review" value={d.counts.under_review} onClick={() => setParams({ state: "under_review" })} />
            <StatTile label="Approved" value={d.counts.approved} tone="success" onClick={() => setParams({ state: "approved" })} />
            <StatTile label="Rejected" value={d.counts.rejected} onClick={() => setParams({ state: "rejected" })} />
          </StatGrid>

          <Card className="mt-6">
            <CardContent className="pt-5">
              <div className="mb-3 flex items-center gap-2">
                <Select aria-label="Filter by state" className="h-8 w-44" value={state ?? ""} onChange={(e) => setParams({ state: e.target.value || null })}>
                  <option value="">All states</option>
                  {["submitted", "under_review", "approved", "rejected"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </Select>
                {!d.can_review && <span className="text-xs text-muted-foreground">Your role can view but not review evidence.</span>}
              </div>

              {d.rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                  No evidence in this state.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.rows.map((row) => (
                    <ReviewRow
                      key={row.evidence.evidence_id}
                      e={row.evidence}
                      caseTitle={row.case_title}
                      caseStatus={row.case_status}
                      canReview={d.can_review}
                      currentUserId={boot.data?.user.user_id ?? ""}
                      nameOf={nameOf}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function ReviewRow({
  e,
  caseTitle,
  caseStatus,
  canReview,
  currentUserId,
  nameOf,
}: {
  e: Evidence;
  caseTitle: string;
  caseStatus: string;
  canReview: boolean;
  currentUserId: string;
  nameOf: (id: string) => string;
}) {
  const review = useReviewEvidence();
  const [comment, setComment] = React.useState("");
  const isAgent = !!AGENT_MAP[e.submitted_by];
  const actionable = canReview && e.submitted_by !== currentUserId && (e.review_state === "submitted" || e.review_state === "under_review");

  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{e.title ?? e.evidence_id}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {e.linked_case_id && (
              <Link href={`/cases/${e.linked_case_id}`} className="inline-flex items-center gap-0.5 hover:underline">
                {caseTitle} <ArrowUpRight className="size-3" />
              </Link>
            )}
            <span className="ml-1">· case {caseStatus}</span>
          </p>
        </div>
        <EvidenceStateBadge state={e.review_state} />
      </div>

      {e.reference && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">{e.reference}</pre>}

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {isAgent ? <Bot className="size-3" /> : <User className="size-3" />} {nameOf(e.submitted_by)}
        </span>
        <span>· {formatTimestamp(e.submitted_at)}</span>
        <span>· confidence {Math.round(e.confidence * 100)}%</span>
        {e.content_hash && (
          <span className="inline-flex items-center gap-1 font-mono">
            · <Hash className="size-3" /> {e.content_hash}
          </span>
        )}
        {e.reviewer_id && <span>· {e.review_state} by {nameOf(e.reviewer_id)}{e.reviewer_comment ? ` — “${e.reviewer_comment}”` : ""}</span>}
      </p>

      {actionable && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <Input className="h-7 flex-1 text-xs" placeholder="Comment (required to reject)" value={comment} onChange={(ev) => setComment(ev.target.value)} />
          <Button size="sm" className="h-7" disabled={review.isPending} onClick={() => review.mutate({ evidenceId: e.evidence_id, decision: "approved", comment })}>
            Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={review.isPending || !comment.trim()} onClick={() => review.mutate({ evidenceId: e.evidence_id, decision: "rejected", comment })}>
            Reject
          </Button>
        </div>
      )}
      {canReview && e.submitted_by === currentUserId && (e.review_state === "submitted" || e.review_state === "under_review") && (
        <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">You submitted this — a second person must review it.</p>
      )}
      {review.isError && <p className="mt-1 text-[11px] text-[var(--destructive)]">{(review.error as Error)?.message}</p>}
    </li>
  );
}
