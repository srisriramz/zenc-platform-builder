"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkline } from "@/components/ui/sparkline";
import { HealthBadge, FamilyLabel } from "@/components/domain-badges";
import { formatBytes, formatBytesRate, formatCount, perDay } from "@/lib/format";
import type { LiveFrame, LiveSource } from "@/hooks/use-live-ingestion";

export function SourceStreamTable({
  sources,
  history,
  latest,
}: {
  sources: LiveSource[];
  history: LiveFrame[];
  latest: LiveFrame;
}) {
  const rows = sources
    .map((s) => {
      const sample = latest.per[s.id] ?? { eps: 0, bps: 0 };
      const series = history.map((f) => f.per[s.id]?.eps ?? 0);
      return { s, sample, series, share: latest.totalEps ? sample.eps / latest.totalEps : 0 };
    })
    .sort((a, b) => b.sample.eps - a.sample.eps);

  return (
    <Table containerClassName="rounded-lg border border-border">
      <TableHeader sticky>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Family</TableHead>
          <TableHead className="w-28">Trend (90s)</TableHead>
          <TableHead className="text-right">Events/sec</TableHead>
          <TableHead className="text-right">Bandwidth</TableHead>
          <TableHead className="text-right">Share</TableHead>
          <TableHead className="text-right">Proj. 24h</TableHead>
          <TableHead>Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ s, sample, series, share }) => (
          <TableRow key={s.id}>
            <TableCell>
              <div className="font-medium">{s.label}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{s.id}</div>
            </TableCell>
            <TableCell><FamilyLabel family={s.family} /></TableCell>
            <TableCell>
              <Sparkline
                data={series}
                strokeClass={s.health === "stale" ? "stroke-muted-foreground" : s.health === "degraded" ? "stroke-[var(--warning)]" : "stroke-primary"}
              />
            </TableCell>
            <TableCell className="text-right tabular-nums font-medium">{formatCount(sample.eps, 1)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytesRate(sample.bps)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{(share * 100).toFixed(0)}%</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {formatBytes(perDay(sample.bps))}
            </TableCell>
            <TableCell><HealthBadge health={s.health} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
