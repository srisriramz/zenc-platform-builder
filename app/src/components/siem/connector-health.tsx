"use client";

import type { ConnectorRuntime } from "@/mock/store";
import { HealthBadge, FamilyLabel } from "@/components/domain-badges";
import { formatDuration, formatRelative } from "@/lib/time";
import { formatCount } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ConnectorTable({
  sources,
  onSelect,
}: {
  sources: ConnectorRuntime[];
  onSelect?: (s: ConnectorRuntime) => void;
}) {
  return (
    <Table>
      <TableHeader sticky>
        <TableRow>
          <TableHead>Connector</TableHead>
          <TableHead>Family</TableHead>
          <TableHead>Health</TableHead>
          <TableHead className="text-right">Ingest lag</TableHead>
          <TableHead className="text-right">Events / 24h</TableHead>
          <TableHead className="text-right">Failed / 24h</TableHead>
          <TableHead>Last event</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((s) => (
          <TableRow
            key={s.telemetry_source_id}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={() => onSelect?.(s)}
          >
            <TableCell>
              <div className="font-medium">{s.connector_label}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{s.connector_id}</div>
            </TableCell>
            <TableCell><FamilyLabel family={s.family} /></TableCell>
            <TableCell><HealthBadge health={s.health} /></TableCell>
            <TableCell className="text-right tabular-nums">{formatDuration(s.ingestion_lag_seconds ?? 0)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCount(s.events_ingested_24h ?? 0)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {s.schema_validation_failures_24h ? (
                <span className="text-[var(--warning)]">{formatCount(s.schema_validation_failures_24h)}</span>
              ) : (
                "0"
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatRelative(s.last_event_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
