"use client";

import * as React from "react";
import { Activity, Gauge, HardDrive, Pause, Play, Waves } from "lucide-react";
import type { HealthState } from "@/schemas";
import type { ConnectorRuntime } from "@/mock/store";
import { useLiveIngestion, type LiveSource } from "@/hooks/use-live-ingestion";
import { FAMILY_INGESTION_PROFILE } from "@/data/ingestion-profile";
import { formatBytes, formatBytesRate, formatCount, perDay } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { StatTile, StatGrid } from "@/components/stat-tile";
import { BarList, type BarDatum } from "@/components/ui/bar-list";
import { DegradedSourceState } from "@/components/states";
import { LiveAreaChart } from "./live-area-chart";
import { IngestionHealth } from "./ingestion-health";
import { SourceStreamTable } from "./source-stream-table";

const FAMILY_BAR: Record<string, string> = {
  windows: "bg-[var(--info)]",
  linux_syslog: "bg-primary",
  firewall: "bg-[var(--warning)]",
  cloud: "bg-[var(--success)]",
  identity: "bg-[color-mix(in_oklch,var(--primary)_60%,var(--info))]",
  email: "bg-[var(--sev-informational)]",
};

export function LiveIngestionDashboard({ sources }: { sources: ConnectorRuntime[] }) {
  const liveSources = React.useMemo<LiveSource[]>(
    () =>
      sources.map((s) => ({
        id: s.telemetry_source_id,
        label: s.connector_label,
        family: s.family,
        health: s.health,
        nominalEps: s.nominal_eps,
        avgEventBytes: s.avg_event_bytes,
      })),
    [sources],
  );

  const { history, latest, paused, togglePaused, tickMs } = useLiveIngestion(liveSources);

  const epsSeries = history.map((f) => ({ ago: latest.t - f.t, value: f.totalEps }));
  const bpsSeries = history.map((f) => ({ ago: latest.t - f.t, value: f.totalBps }));

  const nominalTotal = liveSources.reduce((n, s) => n + (s.health === "stale" ? 0 : s.nominalEps), 0);
  const healthCounts = liveSources.reduce(
    (acc, s) => {
      acc[s.health] = (acc[s.health] ?? 0) + 1;
      return acc;
    },
    {} as Record<HealthState, number>,
  );
  const unsettled = liveSources.filter((s) => s.health === "degraded" || s.health === "stale");

  // bandwidth by family (sum current bps of each source, grouped)
  const byFamily = new Map<string, number>();
  for (const s of liveSources) {
    byFamily.set(s.family, (byFamily.get(s.family) ?? 0) + (latest.per[s.id]?.bps ?? 0));
  }
  const familyBars: BarDatum[] = [...byFamily.entries()]
    .map(([family, bps]) => ({
      key: family,
      label: FAMILY_INGESTION_PROFILE[family as keyof typeof FAMILY_INGESTION_PROFILE].label,
      value: bps,
      display: formatBytesRate(bps),
      barClass: FAMILY_BAR[family],
    }))
    .sort((a, b) => b.value - a.value);

  const avgEps = Math.round(history.reduce((n, f) => n + f.totalEps, 0) / Math.max(1, history.length));
  const peakBps = Math.max(...history.map((f) => f.totalBps), 0);

  return (
    <div className="space-y-6">
      {/* live control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex size-2">
            {!paused && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--success)] opacity-60" />
            )}
            <span className={`relative inline-flex size-2 rounded-full ${paused ? "bg-muted-foreground" : "bg-[var(--success)]"}`} />
          </span>
          <span className="font-medium">{paused ? "Stream paused" : "Live"}</span>
          <span className="text-muted-foreground">· simulated · refresh {(tickMs / 1000).toFixed(1)}s</span>
        </div>
        <Button size="sm" variant="outline" onClick={togglePaused}>
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>

      <StatGrid>
        <StatTile label="Events / sec" value={formatCount(latest.totalEps, 1)} icon={Activity} tone="primary" sub={`${formatCount(avgEps, 1)} avg · ${formatCount(nominalTotal, 1)} nominal`} />
        <StatTile label="Ingest bandwidth" value={formatBytesRate(latest.totalBps)} icon={Waves} sub={`peak ${formatBytesRate(peakBps)} in window`} />
        <StatTile label="Projected 24h volume" value={formatCount(latest.totalEps * 86400, 1)} icon={Gauge} sub="events at current rate" />
        <StatTile
          label="Projected 24h ingest"
          value={formatBytes(perDay(latest.totalBps))}
          icon={HardDrive}
          sub="pre-compression, on the wire"
        />
      </StatGrid>

      {unsettled.length > 0 && (
        <DegradedSourceState>
          {unsettled.map((s) => `${s.label} (${s.health})`).join("; ")} — a stale feed contributes 0 events/sec; a
          degraded feed is throttled and spiky. Throughput below reflects that.
        </DegradedSourceState>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Events per second</CardTitle>
            <p className="text-sm text-muted-foreground">Simulated live ingestion throughput across all connected sources.</p>
          </CardHeader>
          <CardContent>
            <LiveAreaChart data={epsSeries} colorVar="--primary" format={(n) => formatCount(n, 1)} ariaLabel={`Events per second, currently ${latest.totalEps}`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ingest bandwidth</CardTitle>
            <p className="text-sm text-muted-foreground">Bytes per second on the wire, before parsing and compression.</p>
          </CardHeader>
          <CardContent>
            <LiveAreaChart data={bpsSeries} colorVar="--info" format={(n) => formatBytes(n, 0)} ariaLabel={`Ingest bandwidth, currently ${formatBytesRate(latest.totalBps)}`} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Bandwidth by source family</CardTitle>
            <Badge variant="outline">{formatBytesRate(latest.totalBps)} total</Badge>
          </CardHeader>
          <CardContent>
            {familyBars.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bandwidth right now.</p>
            ) : (
              <BarList data={familyBars} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ingestion health</CardTitle>
            <p className="text-sm text-muted-foreground">{sources.length} connected sources.</p>
          </CardHeader>
          <CardContent>
            <IngestionHealth counts={healthCounts} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-source streams</CardTitle>
          <p className="text-sm text-muted-foreground">
            Live events/sec, bandwidth, and 24h projections per connector. Trend is the last 90 seconds.
          </p>
        </CardHeader>
        <CardContent>
          <SourceStreamTable sources={liveSources} history={history} latest={latest} />
        </CardContent>
      </Card>
    </div>
  );
}
