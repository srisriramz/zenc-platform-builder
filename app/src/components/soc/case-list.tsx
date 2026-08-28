"use client";

import Link from "next/link";
import type { Case } from "@/schemas";
import { formatRelative, formatTimestamp } from "@/lib/time";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { CaseStatusBadge, SeverityBadge, SlaBadge } from "@/components/domain-badges";

export function CaseList({ cases, ownerName }: { cases: Case[]; ownerName: (id: string) => string }) {
  return (
    <Table containerClassName="rounded-lg border border-border">
      <TableHeader sticky>
        <TableRow>
          <TableHead>Case</TableHead>
          <TableHead className="w-24">Severity</TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-40">Owner</TableHead>
          <TableHead className="w-24">SLA</TableHead>
          <TableHead className="w-32 text-right">Opened</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => (
          <TableRow key={c.case_id} className="cursor-pointer">
            <TableCell>
              <Link href={`/cases/${c.case_id}`} className="block">
                <span className="font-medium hover:underline">{c.title ?? c.case_id}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                  {c.case_id} · {c.linked_alert_ids.length} alert{c.linked_alert_ids.length === 1 ? "" : "s"}
                </span>
              </Link>
            </TableCell>
            <TableCell>{c.severity ? <SeverityBadge severity={c.severity} /> : "—"}</TableCell>
            <TableCell>
              <CaseStatusBadge status={c.status} />
              {c.closure && (
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{c.closure.classification.replace(/_/g, " ")}</span>
              )}
            </TableCell>
            <TableCell className="text-sm">{ownerName(c.owner_id)}</TableCell>
            <TableCell>
              {c.status === "closed" ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : c.sla?.status ? (
                <SlaBadge status={c.sla.status} />
              ) : (
                <Badge variant="outline">—</Badge>
              )}
            </TableCell>
            <TableCell className="text-right font-mono text-[11px] text-muted-foreground" title={formatTimestamp(c.created_at)}>
              {formatRelative(c.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
