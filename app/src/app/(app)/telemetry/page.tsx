"use client";

import * as React from "react";
import { useTelemetrySources, useQuarantineQueue } from "@/hooks/use-siem";
import { PageHeader } from "@/components/shell/page-header";
import { ConnectorTable } from "@/components/siem/connector-health";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  QueryErrorState,
  TableSkeleton,
} from "@/components/states";
import { HealthBadge, FamilyLabel } from "@/components/domain-badges";
import { formatTimestamp } from "@/lib/time";
import type { ConnectorRuntime } from "@/mock/store";

export default function TelemetryPage() {
  const sources = useTelemetrySources();
  const quarantine = useQuarantineQueue();
  const [selected, setSelected] = React.useState<ConnectorRuntime | null>(null);

  if (sources.isError) {
    return (
      <>
        <PageHeader title="Telemetry & Connectors" />
        <QueryErrorState error={sources.error} onRetry={() => sources.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Telemetry & Connectors"
        description="Synthetic source families: Windows, Linux/syslog, firewall, cloud, identity, email. Malformed events are quarantined on arrival — visible here, never silently dropped."
      />

      <Tabs defaultValue="connectors">
        <TabsList>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="quarantine">
            Quarantine queue
            {quarantine.data && quarantine.data.length > 0 && (
              <Badge variant="warning" className="ml-2">{quarantine.data.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connectors">
          <Card>
            <CardContent className="pt-5">
              {sources.isLoading ? (
                <TableSkeleton cols={7} />
              ) : (
                <ConnectorTable sources={sources.data ?? []} onSelect={setSelected} />
              )}
            </CardContent>
          </Card>

          {selected && (
            <Card className="mt-4">
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{selected.connector_label}</CardTitle>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {selected.connector_id} · {selected.telemetry_source_id}
                  </p>
                </div>
                <HealthBadge health={selected.health} />
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Family"><FamilyLabel family={selected.family} /></Field>
                <Field label="Last event">{formatTimestamp(selected.last_event_at)}</Field>
                <Field label="Avg ingest lag (24h)">{Math.round(selected.ingestion_lag_seconds ?? 0)}s</Field>
                <Field label="Events ingested (24h)">{(selected.events_ingested_24h ?? 0).toLocaleString()}</Field>
                <Field label="Schema-validation failures (24h)">{selected.schema_validation_failures_24h ?? 0}</Field>
                <Field label="Events retained (72h window)">{selected.events_total.toLocaleString()}</Field>
                {selected.health_note && (
                  <div className="sm:col-span-2 rounded-md border border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Health note. </span>
                    {selected.health_note}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="quarantine">
          <Card>
            <CardHeader>
              <CardTitle>Quarantined events</CardTitle>
              <p className="text-sm text-muted-foreground">
                Events that failed schema validation, parsing, or enrichment. They are preserved for review and
                dead-letter handling — the raw payload is never lost.
              </p>
            </CardHeader>
            <CardContent>
              {quarantine.isLoading && <TableSkeleton cols={4} />}
              {quarantine.isError && <QueryErrorState error={quarantine.error} onRetry={() => quarantine.refetch()} />}
              {quarantine.data?.length === 0 && (
                <EmptyState title="Quarantine queue is empty">
                  Every event in the last 72 hours normalized successfully.
                </EmptyState>
              )}
              {quarantine.data && quarantine.data.length > 0 && (
                <Table containerClassName="max-h-[34rem] overflow-y-auto rounded-lg border border-border">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Family</TableHead>
                      <TableHead>Occurred</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quarantine.data.map(({ event, source_family }) => (
                      <TableRow key={event.event_id}>
                        <TableCell className="font-mono text-xs">{event.event_id}</TableCell>
                        <TableCell><FamilyLabel family={source_family} /></TableCell>
                        <TableCell className="text-muted-foreground">{formatTimestamp(event.occurred_at)}</TableCell>
                        <TableCell className="max-w-md text-xs text-[var(--warning)]">{event.quarantine_reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  );
}
