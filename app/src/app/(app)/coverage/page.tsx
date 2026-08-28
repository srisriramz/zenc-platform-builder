"use client";

import * as React from "react";
import { useCoverageMatrix } from "@/hooks/use-siem";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";
import { CoverageMatrixTable, TacticHeatStrip, StageBadge } from "@/components/siem/coverage/coverage-matrix";
import { STAGE_ORDER } from "@/lib/coverage/matrix";

export default function CoveragePage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading coverage…" />}>
      <CoverageInner />
    </React.Suspense>
  );
}

function CoverageInner() {
  const { params, setParams } = useNavParams();
  const gapsOnly = params.get("gaps") === "1";
  const q = useCoverageMatrix();

  if (q.isError) {
    return (
      <>
        <PageHeader title="ATT&CK × D3FEND Coverage" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="The coverage matrix needs ZenC SIEM." />
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
        title="ATT&CK × D3FEND Coverage"
        description="Per technique, staged honestly along the detection pipeline — not a binary covered/not-covered flag. Detection is an enabled correlation rule; response is an enabled playbook with a D3FEND-mapped step. Percentages are against the seeded ATT&CK slice, not the full matrix."
      >
        <Button size="sm" variant={gapsOnly ? "default" : "outline"} onClick={() => setParams({ gaps: gapsOnly ? null : "1" })}>
          {gapsOnly ? "Showing gaps" : "Show gaps only"}
        </Button>
      </PageHeader>

      {q.isLoading || !d ? (
        <LoadingState label="Computing coverage…" />
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Detection coverage"
              value={`${d.kpis.detection_coverage_pct}%`}
              sub={`${d.kpis.detected}/${d.kpis.techniques_in_scope} techniques · ${d.kpis.correlated} firing`}
              tone="primary"
            />
            <StatTile
              label="Response coverage"
              value={d.has_soc ? `${d.kpis.response_coverage_pct}%` : "—"}
              sub={d.has_soc ? `${d.kpis.responded}/${d.kpis.techniques_in_scope} with a playbook` : "no ZenC SOAR on this tenant"}
            />
            <StatTile label="Techniques in scope" value={d.kpis.techniques_in_scope} sub={d.attack_version} />
            <StatTile
              label="Telemetry gaps"
              value={d.kpis.telemetry_gap}
              tone={d.kpis.telemetry_gap ? "warning" : "success"}
              sub="techniques with no connected data source"
            />
          </StatGrid>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Coverage by tactic</CardTitle>
            </CardHeader>
            <CardContent>
              <TacticHeatStrip data={d} />
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Pipeline stages:</span>
            {STAGE_ORDER.map((s) => (
              <StageBadge key={s} stage={s} />
            ))}
            <span>— the furthest stage each technique has reached.</span>
          </div>

          <div className="mt-4">
            <CoverageMatrixTable data={d} gapsOnly={gapsOnly} />
          </div>
        </>
      )}
    </>
  );
}
