"use client";

import Link from "next/link";
import { useTelemetrySources, useQuarantineQueue } from "@/hooks/use-siem";
import { useAudit } from "@/hooks/use-platform";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { ConnectorTable } from "@/components/siem/connector-health";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  DegradedSourceState,
  QueryErrorState,
  TableSkeleton,
} from "@/components/states";
import { formatRelative } from "@/lib/time";

export default function SiemDashboardPage() {
  const sources = useTelemetrySources();
  const quarantine = useQuarantineQueue();
  const audit = useAudit();

  if (sources.isError) return <><PageHeader title="SIEM Dashboard" /><QueryErrorState error={sources.error} onRetry={() => sources.refetch()} /></>;

  const rows = sources.data ?? [];
  const degraded = rows.filter((s) => s.health === "degraded" || s.health === "stale" || s.health === "unknown");
  const events24h = rows.reduce((n, s) => n + (s.events_ingested_24h ?? 0), 0);
  const quarantined24h = rows.reduce((n, s) => n + (s.schema_validation_failures_24h ?? 0), 0);
  const worstLag = rows.reduce((m, s) => Math.max(m, s.ingestion_lag_seconds ?? 0), 0);

  return (
    <>
      <PageHeader
        title="SIEM Dashboard"
        description="Detect layer health at a glance. ZenC SIEM runs standalone — nothing on this screen depends on ZenC SOC."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/log-explorer">Open Log Explorer</Link>
        </Button>
      </PageHeader>

      {sources.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Connectors" value={rows.length} sub={`${rows.length - degraded.length} healthy`} />
          <StatTile
            label="Connectors needing attention"
            value={degraded.length}
            tone={degraded.length ? "warning" : "success"}
            sub={degraded.map((d) => d.family).join(", ") || "none"}
          />
          <StatTile label="Events ingested / 24h" value={events24h.toLocaleString()} sub={`worst lag ${Math.round(worstLag)}s`} />
          <StatTile
            label="Quarantined / 24h"
            value={quarantine.data?.length ?? quarantined24h}
            tone={(quarantine.data?.length ?? quarantined24h) ? "warning" : "success"}
            sub="schema validation on arrival — never silently dropped"
          />
        </div>
      )}

      {degraded.length > 0 && (
        <div className="mt-4">
          <DegradedSourceState>
            {degraded.map((d) => `${d.connector_label} (${d.health})`).join("; ")}. Detection coverage for these
            families is degraded until the connector recovers.
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
        <CardContent>
          {sources.isLoading ? <TableSkeleton cols={7} /> : <ConnectorTable sources={rows} />}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent platform activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {audit.isLoading && <TableSkeleton rows={3} cols={2} />}
          {audit.data?.length === 0 && <p className="text-muted-foreground">No audit entries for this tenant.</p>}
          {audit.data?.slice(0, 5).map((a) => (
            <div key={a.audit_id} className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
              <span>
                <span className="font-medium capitalize">{a.action.replace(/_/g, " ")}</span>{" "}
                <span className="text-muted-foreground">— {a.detail}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(a.occurred_at)}</span>
            </div>
          ))}
          {audit.isError && <p className="text-muted-foreground">Audit trail is not visible to your role.</p>}
        </CardContent>
      </Card>
    </>
  );
}
