"use client";

import Link from "next/link";
import { Activity, DatabaseZap, PlugZap, ShieldQuestion } from "lucide-react";
import { useTelemetrySources, useQuarantineQueue } from "@/hooks/use-siem";
import { useAudit } from "@/hooks/use-platform";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile, StatGrid } from "@/components/stat-tile";
import { ConnectorTable } from "@/components/siem/connector-health";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { DegradedSourceState, QueryErrorState, TableSkeleton } from "@/components/states";
import { formatRelative } from "@/lib/time";
import { formatCount } from "@/lib/format";

const AUDIT_TONE: Record<string, TimelineItem["tone"]> = {
  entitlement_changed: "primary",
  role_changed: "info",
  kill_switch_toggled: "warning",
};

export default function SiemDashboardPage() {
  const sources = useTelemetrySources();
  const quarantine = useQuarantineQueue();
  const audit = useAudit();

  if (sources.isError) {
    return (
      <>
        <PageHeader title="SIEM Dashboard" />
        <QueryErrorState error={sources.error} onRetry={() => sources.refetch()} />
      </>
    );
  }

  const rows = sources.data ?? [];
  const degraded = rows.filter((s) => s.health === "degraded" || s.health === "stale" || s.health === "unknown");
  const events24h = rows.reduce((n, s) => n + (s.events_ingested_24h ?? 0), 0);
  const failed24h = rows.reduce((n, s) => n + (s.schema_validation_failures_24h ?? 0), 0);
  const worstLag = rows.reduce((m, s) => Math.max(m, s.ingestion_lag_seconds ?? 0), 0);
  const sampleQuarantined = quarantine.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="SIEM Dashboard"
        description="Detect-layer health at a glance. ZenC SIEM runs standalone — nothing on this screen depends on ZenC SOAR."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/ingestion">Traffic &amp; Ingestion</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/log-explorer">Open Log Explorer</Link>
        </Button>
      </PageHeader>

      {sources.isLoading ? (
        <StatGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
        </StatGrid>
      ) : (
        <StatGrid>
          <div className="anim-rise">
            <StatTile label="Connectors" value={rows.length} sub={`${rows.length - degraded.length} healthy`} icon={PlugZap} tone="primary" />
          </div>
          <div className="anim-rise anim-delay-1">
            <StatTile
              label="Needing attention"
              value={degraded.length}
              tone={degraded.length ? "warning" : "success"}
              icon={ShieldQuestion}
              sub={degraded.map((d) => d.family).join(", ") || "none"}
            />
          </div>
          <div className="anim-rise anim-delay-2">
            <StatTile
              label="Events ingested / 24h"
              value={formatCount(events24h)}
              icon={DatabaseZap}
              sub={`stream total · worst lag ${Math.round(worstLag)}s`}
            />
          </div>
          <div className="anim-rise anim-delay-3">
            <StatTile
              label="Failed schema validation / 24h"
              value={formatCount(failed24h)}
              tone={failed24h ? "warning" : "success"}
              icon={Activity}
              sub={`quarantined on arrival · ${sampleQuarantined} in the explorable sample`}
            />
          </div>
        </StatGrid>
      )}

      {degraded.length > 0 && (
        <div className="mt-4">
          <DegradedSourceState>
            {degraded.map((d) => `${d.connector_label} (${d.health})`).join("; ")}. Detection coverage for these families
            is degraded until the connector recovers.
          </DegradedSourceState>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Telemetry sources</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/telemetry">Manage connectors</Link>
          </Button>
        </CardHeader>
        <CardContent>{sources.isLoading ? <TableSkeleton cols={7} /> : <ConnectorTable sources={rows} />}</CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent platform activity</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.isLoading && <TableSkeleton rows={3} cols={2} />}
          {audit.isError && <p className="text-sm text-muted-foreground">The audit trail is not visible to your role.</p>}
          {audit.data?.length === 0 && <p className="text-sm text-muted-foreground">No audit entries for this tenant.</p>}
          {audit.data && audit.data.length > 0 && (
            <Timeline
              items={audit.data.slice(0, 6).map((a) => ({
                id: a.audit_id,
                tone: AUDIT_TONE[a.action] ?? "default",
                title: <span className="capitalize">{a.action.replace(/_/g, " ")}</span>,
                meta: formatRelative(a.occurred_at),
                body: a.detail,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
