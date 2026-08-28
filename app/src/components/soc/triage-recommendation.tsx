"use client";

import Link from "next/link";
import { ArrowUpRight, Bot, CheckCircle2, TriangleAlert } from "lucide-react";
import type { TriageResult } from "@/lib/soc/types";
import { Badge } from "@/components/ui/primitives";
import { SeverityBadge } from "@/components/domain-badges";

/**
 * The Triage Agent's recommendation, rendered as an advisory — never an action.
 * The buttons that act on it live on the parent (a human at L2).
 */
export function TriageRecommendation({
  triage,
  runId,
  compact,
}: {
  triage: TriageResult;
  runId?: string;
  compact?: boolean;
}) {
  const suppress = triage.recommendation === "suppress";
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Bot className="size-3.5" /> Triage Agent · advisory only
        </span>
        <span className="flex items-center gap-2">
          <Badge variant={suppress ? "outline" : "warning"} className="capitalize">
            recommends {triage.recommendation}
          </Badge>
          <Badge variant="outline">{Math.round(triage.confidence * 100)}% confidence</Badge>
          <SeverityBadge severity={triage.recommended_severity} />
        </span>
      </div>

      <p className="mt-2 text-sm">{triage.claim}</p>

      {!compact && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1 text-xs font-medium text-[var(--success)]">
              <CheckCircle2 className="size-3" /> Supporting
            </p>
            <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
              {triage.supporting.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs font-medium text-[var(--warning)]">
              <TriangleAlert className="size-3" /> Contradictory
            </p>
            <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
              {triage.contradictory.length === 0 && <li>none</li>}
              {triage.contradictory.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {runId && (
        <Link
          href={`/agents/runs/${runId}`}
          className="mt-2 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
        >
          full agent run <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  );
}
