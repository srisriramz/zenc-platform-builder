"use client";

import { useAudit } from "@/hooks/use-platform";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, QueryErrorState, TableSkeleton } from "@/components/states";
import { formatTimestamp } from "@/lib/time";

export default function AuditPage() {
  const audit = useAudit();

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Append-only. Entries are never edited in place — a correction is a new entry referencing the original."
      />
      <Card>
        <CardContent className="pt-5">
          {audit.isLoading && <TableSkeleton cols={5} />}
          {audit.isError && <QueryErrorState error={audit.error} onRetry={() => audit.refetch()} />}
          {audit.data?.length === 0 && <EmptyState title="No audit entries for this tenant yet" />}
          {audit.data && audit.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data.map((a) => (
                  <TableRow key={a.audit_id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {formatTimestamp(a.occurred_at)}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{a.actor.principal_id}</span>
                      <Badge variant="outline" className="ml-2">{a.actor.principal_type}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{a.action.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono text-xs">{a.target_type}:{a.target_id}</TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">{a.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
