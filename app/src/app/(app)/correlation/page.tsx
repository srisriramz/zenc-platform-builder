"use client";

import * as React from "react";
import Link from "next/link";
import { useAlerts, useCorrelationRules } from "@/hooks/use-siem";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile, StatGrid } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Select } from "@/components/ui/primitives";
import { EmptyState, EntitlementMissingState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";
import { AlertStream } from "@/components/siem/correlation/alert-stream";
import { AlertDetail } from "@/components/siem/correlation/alert-detail";

export default function CorrelationPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading correlation…" />}>
      <CorrelationInner />
    </React.Suspense>
  );
}

function CorrelationInner() {
  const { params, setParams } = useNavParams();
  const severity = params.get("severity") ?? undefined;
  const selectedAlert = params.get("alert");

  const rules = useCorrelationRules();
  const alerts = useAlerts(severity ? { severity } : {});

  if (alerts.isError) {
    return (
      <>
        <PageHeader title="Correlation" />
        {alerts.error && (alerts.error as { code?: string }).code === "entitlement_missing" ? (
          <EntitlementMissingState message="Correlation needs ZenC SIEM." />
        ) : (
          <QueryErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
        )}
      </>
    );
  }

  const allAlerts = alerts.data ?? [];
  const enabledRules = (rules.data ?? []).filter((r) => r.lifecycle_state === "enabled");
  const inReview = (rules.data ?? []).filter((r) => r.lifecycle_state === "peer_review" || r.lifecycle_state === "test");
  const bySeverity = (s: string) => (alerts.data ?? []).filter((a) => a.severity === s).length;

  return (
    <>
      <PageHeader
        title="Correlation"
        description="Deterministic, LLM-free correlation over the normalized-event sample. Every alert is a real alert-envelope (v1.2) whose ATT&CK technique claims cite the specific contributing events."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/detections">Rule catalog</Link>
        </Button>
      </PageHeader>

      {rules.isLoading || alerts.isLoading ? (
        <StatGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted" />
          ))}
        </StatGrid>
      ) : (
        <StatGrid>
          <StatTile label="Alerts (72h sample)" value={allAlerts.length} tone="primary" href="/correlation" />
          <StatTile label="Enabled rules" value={enabledRules.length} sub={`${inReview.length} in review / test`} href="/detections" />
          <StatTile label="High + critical" value={bySeverity("high") + bySeverity("critical")} tone={bySeverity("critical") ? "danger" : "warning"} onClick={() => setParams({ severity: "high" })} />
          <StatTile
            label="Rules with D3FEND"
            value={`${enabledRules.filter((r) => r.d3fend_mapping?.length).length}/${enabledRules.length}`}
            sub="detect-side mapping"
            href="/coverage"
          />
        </StatGrid>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Alert stream</CardTitle>
            <Select
              aria-label="Filter by severity"
              className="h-8 w-36"
              value={severity ?? ""}
              onChange={(e) => setParams({ severity: e.target.value || null, alert: null })}
            >
              <option value="">All severities</option>
              {["critical", "high", "medium", "low", "informational"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </CardHeader>
          <CardContent>
            {alerts.isLoading ? (
              <TableSkeleton cols={5} />
            ) : allAlerts.length === 0 ? (
              <EmptyState title="No alerts match">
                {severity ? "No alerts at this severity in the sample." : "No enabled rule fired on the current sample."}
              </EmptyState>
            ) : (
              <AlertStream
                alerts={allAlerts}
                selectedId={selectedAlert}
                onSelect={(a) => setParams({ alert: a.envelope_id })}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedAlert ? (
            <AlertDetail envelopeId={selectedAlert} onClose={() => setParams({ alert: null })} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select an alert to see its ATT&amp;CK technique breakdown and contributing events.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
