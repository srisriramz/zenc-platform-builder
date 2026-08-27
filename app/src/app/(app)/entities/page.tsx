"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { useEntityRisk } from "@/hooks/use-siem";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile, StatGrid } from "@/components/stat-tile";
import { Card, CardContent } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";
import { RiskBadge, trendLabel } from "@/components/siem/entity-risk-badge";
import { EntityRiskDetail } from "@/components/siem/entity-risk-detail";

export default function EntitiesPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading entity risk…" />}>
      <EntitiesInner />
    </React.Suspense>
  );
}

function EntitiesInner() {
  const risk = useEntityRisk();
  const { params, setParams } = useNavParams();
  const selKey = params.get("entity"); // "type:value"

  const rows = risk.data ?? [];
  const selected = rows.find((r) => `${r.entity_type}:${r.value}` === selKey) ?? null;

  const bandCount = (b: string) => rows.filter((r) => r.band === b).length;

  return (
    <>
      <PageHeader
        title="Entities at Risk"
        description="Seeded, indicative entity risk (the demo's UEBA stand-in). Each score is a transparent weighted tally of signals observed in the ~72h event sample — it informs triage, it never fires an alert, and every signal traces back to real events."
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 flex-none" />
        <span>
          <span className="font-medium text-foreground">Not a behavioural-analytics engine. </span>
          Full UEBA (baselining, peer-group modelling, streaming anomaly scores) is deferred — this fixture exists so
          triage has entity context to work with.
        </span>
      </div>

      {risk.isError && <QueryErrorState error={risk.error} onRetry={() => risk.refetch()} />}

      {!risk.isError && (
        <>
          {risk.isLoading ? (
            <StatGrid className="lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted" />
              ))}
            </StatGrid>
          ) : (
            <StatGrid className="lg:grid-cols-4">
              <StatTile label="Entities scored" value={rows.length} tone="primary" />
              <StatTile label="Critical" value={bandCount("critical")} tone={bandCount("critical") ? "danger" : "success"} />
              <StatTile label="High" value={bandCount("high")} tone={bandCount("high") ? "warning" : "success"} />
              <StatTile label="Rising" value={rows.filter((r) => r.trend === "rising").length} />
            </StatGrid>
          )}

          <Card className="mt-6">
            <CardContent className="pt-5">
              {risk.isLoading ? (
                <TableSkeleton cols={5} />
              ) : rows.length === 0 ? (
                <EmptyState title="No entities above the risk threshold">
                  Every user and host in the sample is below the indicative-risk threshold.
                </EmptyState>
              ) : (
                <Table containerClassName="rounded-lg border border-border">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead>Top signals</TableHead>
                      <TableHead className="text-right">Signals</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={`${r.entity_type}:${r.value}`}
                        data-state={selKey === `${r.entity_type}:${r.value}` ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setParams({ entity: `${r.entity_type}:${r.value}` })}
                      >
                        <TableCell>
                          <div className="font-mono text-sm">{r.value}</div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.entity_type}</div>
                        </TableCell>
                        <TableCell>
                          <RiskBadge score={r.score} band={r.band} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{trendLabel(r.trend)}</TableCell>
                        <TableCell className="max-w-md text-xs text-muted-foreground">
                          {r.signals.slice(0, 2).map((s) => s.label).join(" · ")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.signals.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {selected && (
            <div className="mt-4">
              <EntityRiskDetail risk={selected} onClose={() => setParams({ entity: null })} />
            </div>
          )}
        </>
      )}
    </>
  );
}
