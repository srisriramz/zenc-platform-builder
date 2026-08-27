"use client";

import Link from "next/link";
import { ArrowUpRight, Info, X } from "lucide-react";
import type { EntityRisk } from "@/schemas";
import { drillHref } from "@/lib/use-nav";
import { formatRelative, formatTimestamp } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { RiskBadge, trendLabel } from "./entity-risk-badge";

const KIND_LABEL: Record<string, string> = {
  auth: "Authentication",
  access: "Access",
  process: "Process / execution",
  network: "Network",
  admin: "Privilege / admin",
  data: "Data movement",
  anomaly: "Anomaly",
};

export function EntityRiskDetail({ risk, onClose }: { risk: EntityRisk; onClose: () => void }) {
  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 font-mono">
            {risk.entity_type}:{risk.value}
            <RiskBadge score={risk.score} band={risk.band} />
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {trendLabel(risk.trend)} · first seen {formatRelative(risk.first_seen)} · updated {formatTimestamp(risk.last_updated)}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 flex-none" />
          <span>
            <span className="font-medium text-foreground">Indicative only. </span>
            This score is a transparent weighted tally of signals observed in the ~72h event sample — not a verdict and
            not an ML model. {risk.peer_context}.
          </span>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Contributing signals</p>
          <ul className="space-y-1.5">
            {risk.signals.map((sig, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5 text-sm">
                <span>
                  <span className="text-muted-foreground">[{KIND_LABEL[sig.kind] ?? sig.kind}]</span> {sig.label}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-xs text-muted-foreground">+{sig.weight}</span>
                  {sig.evidence_query && (
                    <Button asChild variant="ghost" size="sm" className="h-7">
                      <Link href={drillHref("/log-explorer", { q: sig.evidence_query, range: "72h", quarantined: "1" })}>
                        Evidence
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button asChild variant="outline" size="sm">
            <Link href={drillHref("/log-explorer", { q: `entity.${risk.entity_type}:${risk.value}`, range: "72h" })}>
              All events for this entity
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
