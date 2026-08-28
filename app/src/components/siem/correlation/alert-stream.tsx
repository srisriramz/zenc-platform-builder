"use client";

import type { AlertEnvelope } from "@/schemas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { SeverityBadge } from "@/components/domain-badges";
import { formatTimestamp } from "@/lib/time";

export function AlertStream({
  alerts,
  selectedId,
  onSelect,
}: {
  alerts: AlertEnvelope[];
  selectedId: string | null;
  onSelect: (a: AlertEnvelope) => void;
}) {
  return (
    <Table containerClassName="max-h-[36rem] overflow-y-auto rounded-lg border border-border">
      <TableHeader sticky>
        <TableRow>
          <TableHead className="w-40">Detected</TableHead>
          <TableHead className="w-24">Severity</TableHead>
          <TableHead>Alert</TableHead>
          <TableHead className="w-52">Techniques</TableHead>
          <TableHead className="w-16 text-right">Conf.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <TableRow
            key={a.envelope_id}
            data-state={selectedId === a.envelope_id ? "selected" : undefined}
            className="cursor-pointer"
            onClick={() => onSelect(a)}
          >
            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {formatTimestamp(a.correlated_at ?? a.occurred_at)}
            </TableCell>
            <TableCell>
              <SeverityBadge severity={a.severity} />
            </TableCell>
            <TableCell>
              <div className="font-medium">{a.title}</div>
              <div className="line-clamp-1 text-xs text-muted-foreground">{a.description}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {(a.attack_techniques ?? []).slice(0, 3).map((t) => (
                  <Badge key={t.technique_id} variant="outline" className="font-mono text-[10px]">
                    {t.technique_id}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
              {a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
