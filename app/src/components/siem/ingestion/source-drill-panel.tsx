"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { LiveFrame, LiveSource } from "@/hooks/use-live-ingestion";
import { drillHref } from "@/lib/use-nav";
import { formatBytes, formatBytesRate, formatCount, perDay } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { HealthBadge, FamilyLabel } from "@/components/domain-badges";
import { LiveAreaChart } from "./live-area-chart";

export function SourceDrillPanel({
  source,
  runtime,
  history,
  latest,
  onClose,
}: {
  source: LiveSource;
  runtime: { health_note?: string; sample_events: number; quarantined_in_sample: number };
  history: LiveFrame[];
  latest: LiveFrame;
  onClose: () => void;
}) {
  const epsSeries = history.map((f) => ({ ago: latest.t - f.t, value: f.per[source.id]?.eps ?? 0 }));
  const bpsSeries = history.map((f) => ({ ago: latest.t - f.t, value: f.per[source.id]?.bps ?? 0 }));
  const now = latest.per[source.id] ?? { eps: 0, bps: 0 };
  const share = latest.totalEps ? (now.eps / latest.totalEps) * 100 : 0;

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {source.label}
            <HealthBadge health={source.health} />
          </CardTitle>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{source.id}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Kv k="Family" v={<FamilyLabel family={source.family} />} />
          <Kv k="Events / sec" v={formatCount(now.eps, 1)} />
          <Kv k="Bandwidth" v={formatBytesRate(now.bps)} />
          <Kv k="Share of stream" v={`${share.toFixed(0)}%`} />
          <Kv k="Nominal rate" v={`${formatCount(source.nominalEps, 1)}/s`} />
          <Kv k="Avg event size" v={formatBytes(source.avgEventBytes, 0)} />
          <Kv k="Proj. 24h volume" v={formatCount(now.eps * 86400, 1)} />
          <Kv k="Proj. 24h ingest" v={formatBytes(perDay(now.bps))} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Events / sec — last 90s</p>
            <LiveAreaChart data={epsSeries} colorVar="--primary" format={(n) => formatCount(n, 1)} ariaLabel={`${source.label} events per second`} height={140} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Bandwidth — last 90s</p>
            <LiveAreaChart data={bpsSeries} colorVar="--info" format={(n) => formatBytes(n, 0)} ariaLabel={`${source.label} bandwidth`} height={140} />
          </div>
        </div>

        {runtime.health_note && (
          <div className="rounded-md border border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Health note. </span>
            {runtime.health_note}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>Explorable sample: {runtime.sample_events.toLocaleString()} events{runtime.quarantined_in_sample > 0 ? ` · ${runtime.quarantined_in_sample} quarantined` : ""}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={drillHref("/log-explorer", { q: `telemetry_source_id:${source.id}`, range: "24h" })}>
              Events in Log Explorer
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={drillHref("/telemetry", { source: source.id })}>
              Connector detail
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{k}</p>
      <p className="mt-0.5 tabular-nums">{v}</p>
    </div>
  );
}
