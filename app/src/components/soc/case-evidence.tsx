"use client";

import * as React from "react";
import { Bot, FileText, Hash, Link2, ShieldCheck, StickyNote, User } from "lucide-react";
import type { Evidence } from "@/schemas";
import { useAddEvidence, useReviewEvidence } from "@/hooks/use-soc";
import { formatTimestamp } from "@/lib/time";
import { AGENT_MAP } from "@/data/agents";
import { Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EvidenceStateBadge } from "@/components/domain-badges";

const REF_ICON = { file: FileText, link: Link2, note: StickyNote } as const;

export function CaseEvidence({
  caseId,
  evidence,
  canWork,
  canReview,
  currentUserId,
}: {
  caseId: string;
  evidence: Evidence[];
  canWork: boolean;
  canReview: boolean;
  currentUserId: string;
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Not editable once added — a correction is a new item that supersedes the old one, never an edit. The content
          hash is recorded as a tamper-evidence marker.
        </p>
        {canWork && (
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Add evidence"}
          </Button>
        )}
      </div>

      {adding && <AddEvidenceForm caseId={caseId} evidence={evidence} onDone={() => setAdding(false)} />}

      {evidence.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No evidence on this case yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {evidence.map((e) => (
            <EvidenceRow key={e.evidence_id} e={e} canReview={canReview} currentUserId={currentUserId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceRow({ e, canReview, currentUserId }: { e: Evidence; canReview: boolean; currentUserId: string }) {
  const review = useReviewEvidence();
  const [comment, setComment] = React.useState("");
  const RefIcon = REF_ICON[e.reference_type ?? "note"];
  const submitterIsAgent = !!AGENT_MAP[e.submitted_by];
  const canActOnThis = canReview && e.submitted_by !== currentUserId && (e.review_state === "submitted" || e.review_state === "under_review");

  return (
    <li className="rounded-md border border-border p-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          <RefIcon className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{e.title ?? e.evidence_id}</span>
        </span>
        <EvidenceStateBadge state={e.review_state} />
      </div>

      {e.reference && <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">{e.reference}</pre>}

      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-3">
        <div className="flex items-center gap-1">
          {submitterIsAgent ? <Bot className="size-3" /> : <User className="size-3" />}
          {submitterIsAgent ? AGENT_MAP[e.submitted_by].label : e.submitted_by}
        </div>
        <div>{formatTimestamp(e.submitted_at)}</div>
        <div>confidence {Math.round(e.confidence * 100)}%</div>
        {e.content_hash && (
          <div className="col-span-2 flex items-center gap-1 font-mono sm:col-span-3">
            <Hash className="size-3" /> {e.content_hash}
          </div>
        )}
        {e.supersedes_evidence_id && <div className="col-span-2 sm:col-span-3">supersedes {e.supersedes_evidence_id}</div>}
        {e.reviewer_id && (
          <div className="col-span-2 flex items-center gap-1 sm:col-span-3">
            <ShieldCheck className="size-3" /> {e.review_state} by {e.reviewer_id}
            {e.reviewer_comment && ` — “${e.reviewer_comment}”`}
          </div>
        )}
      </dl>

      {canActOnThis && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <Input
            className="h-7 flex-1 text-xs"
            placeholder="Reviewer comment (required to reject)"
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
          />
          <Button size="sm" className="h-7" disabled={review.isPending} onClick={() => review.mutate({ evidenceId: e.evidence_id, decision: "approved", comment })}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={review.isPending || !comment.trim()}
            onClick={() => review.mutate({ evidenceId: e.evidence_id, decision: "rejected", comment })}
          >
            Reject
          </Button>
        </div>
      )}
      {canReview && e.submitted_by === currentUserId && (e.review_state === "submitted" || e.review_state === "under_review") && (
        <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
          You submitted this item — a second person must review it.
        </p>
      )}
      {review.isError && <p className="mt-1 text-[11px] text-[var(--destructive)]">{(review.error as Error)?.message}</p>}
    </li>
  );
}

function AddEvidenceForm({ caseId, evidence, onDone }: { caseId: string; evidence: Evidence[]; onDone: () => void }) {
  const add = useAddEvidence();
  const [title, setTitle] = React.useState("");
  const [refType, setRefType] = React.useState<"file" | "link" | "note">("note");
  const [reference, setReference] = React.useState("");
  const [confidence, setConfidence] = React.useState(0.7);
  const [supersedes, setSupersedes] = React.useState("");

  return (
    <form
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!title.trim() || !reference.trim()) return;
        add.mutate(
          { case_id: caseId, title: title.trim(), reference_type: refType, reference: reference.trim(), confidence, supersedes_evidence_id: supersedes || undefined },
          { onSuccess: onDone },
        );
      }}
    >
      <div>
        <Label htmlFor="ev-title">Title</Label>
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Memory image — scu-fs-02" />
      </div>
      <div className="flex gap-2">
        <div className="w-32">
          <Label htmlFor="ev-type">Type</Label>
          <Select id="ev-type" className="h-8" value={refType} onChange={(e) => setRefType(e.target.value as typeof refType)}>
            <option value="note">note</option>
            <option value="file">file</option>
            <option value="link">link</option>
          </Select>
        </div>
        <div className="flex-1">
          <Label htmlFor="ev-ref">Reference</Label>
          <Input id="ev-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={refType === "link" ? "https://…" : refType === "file" ? "path or export name" : "free text"} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-40">
          <Label htmlFor="ev-conf">Confidence: {Math.round(confidence * 100)}%</Label>
          <input id="ev-conf" type="range" min={0} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full" />
        </div>
        {evidence.length > 0 && (
          <div className="flex-1">
            <Label htmlFor="ev-sup">Supersedes (optional)</Label>
            <Select id="ev-sup" className="h-8" value={supersedes} onChange={(e) => setSupersedes(e.target.value)}>
              <option value="">— none —</option>
              {evidence.map((e) => (
                <option key={e.evidence_id} value={e.evidence_id}>
                  {e.title ?? e.evidence_id}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={add.isPending || !title.trim() || !reference.trim()}>
          Add
        </Button>
        {add.isError && <span className="text-[11px] text-[var(--destructive)]">{(add.error as Error)?.message}</span>}
      </div>
    </form>
  );
}
