"use client";

import type { NormalizedEvent } from "@/schemas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { FamilyLabel } from "@/components/domain-badges";
import { formatTimestamp } from "@/lib/time";
import { cn } from "@/lib/utils";

function entitySummary(e: NormalizedEvent): string {
  const parts = (e.entities ?? []).map((x) => `${x.entity_type}=${x.value}`);
  return parts.slice(0, 3).join("  ") + (parts.length > 3 ? `  +${parts.length - 3}` : "");
}

export function ResultsTable({
  rows,
  familyOf,
  selectedId,
  onSelect,
}: {
  rows: NormalizedEvent[];
  familyOf: (id: string) => string | undefined;
  selectedId: string | null;
  onSelect: (e: NormalizedEvent) => void;
}) {
  return (
    <Table containerClassName="max-h-[32rem] overflow-y-auto rounded-lg border border-border">
      <TableHeader sticky>
        <TableRow>
          <TableHead className="w-44">Occurred</TableHead>
          <TableHead className="w-28">Family</TableHead>
          <TableHead className="w-56">Event type</TableHead>
          <TableHead>Entities</TableHead>
          <TableHead className="w-28">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((e) => (
          <TableRow
            key={e.event_id}
            data-state={selectedId === e.event_id ? "selected" : undefined}
            className="cursor-pointer"
            onClick={() => onSelect(e)}
          >
            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {formatTimestamp(e.occurred_at)}
            </TableCell>
            <TableCell><FamilyLabel family={familyOf(e.telemetry_source_id) ?? "unknown"} /></TableCell>
            <TableCell className="font-mono text-xs">{e.event_type}</TableCell>
            <TableCell className="max-w-md truncate font-mono text-[11px] text-muted-foreground">
              {entitySummary(e) || "—"}
            </TableCell>
            <TableCell>
              <Badge
                variant={e.normalization_status === "quarantined" ? "warning" : "outline"}
                className={cn(e.normalization_status === "normalized" && "text-muted-foreground")}
              >
                {e.normalization_status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
