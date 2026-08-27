"use client";

import type { EntityRisk, NormalizedEvent } from "@/schemas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { FamilyLabel } from "@/components/domain-badges";
import { RiskDot } from "@/components/siem/entity-risk-badge";
import { formatTimestamp } from "@/lib/time";
import { cn } from "@/lib/utils";

export type RiskLookup = (entityType: string, value: string) => EntityRisk | undefined;

function EntityCells({ event, riskFor }: { event: NormalizedEvent; riskFor?: RiskLookup }) {
  const entities = event.entities ?? [];
  if (entities.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
      {entities.slice(0, 4).map((x, i) => {
        const risk = riskFor?.(x.entity_type, x.value);
        return (
          <span key={i} className="inline-flex items-center gap-1">
            {risk && <RiskDot band={risk.band} />}
            {x.entity_type}={x.value}
          </span>
        );
      })}
      {entities.length > 4 && <span>+{entities.length - 4}</span>}
    </span>
  );
}

export function ResultsTable({
  rows,
  familyOf,
  selectedId,
  onSelect,
  riskFor,
}: {
  rows: NormalizedEvent[];
  familyOf: (id: string) => string | undefined;
  selectedId: string | null;
  onSelect: (e: NormalizedEvent) => void;
  riskFor?: RiskLookup;
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
            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{formatTimestamp(e.occurred_at)}</TableCell>
            <TableCell>
              <FamilyLabel family={familyOf(e.telemetry_source_id) ?? "unknown"} />
            </TableCell>
            <TableCell className="font-mono text-xs">{e.event_type}</TableCell>
            <TableCell className="max-w-md">
              <EntityCells event={e} riskFor={riskFor} />
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
