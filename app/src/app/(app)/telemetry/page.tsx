"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Filter, X } from "lucide-react";
import { useTelemetrySources, useQuarantineQueue } from "@/hooks/use-siem";
import { useNavParams, drillHref } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { ConnectorTable } from "@/components/siem/connector-health";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";
import { HealthBadge, FamilyLabel } from "@/components/domain-badges";
import { formatTimestamp } from "@/lib/time";
import { formatCount } from "@/lib/format";
import type { HealthState } from "@/schemas";
import type { ConnectorRuntime } from "@/mock/store";

export default function TelemetryPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading connectors…" />}>
      <TelemetryInner />
    </React.Suspense>
  );
}

function TelemetryInner() {
  const { params, setParams } = useNavParams();
  const sources = useTelemetrySources();
  const quarantine = useQuarantineQueue();

  const tab = params.get("tab") === "quarantine" ? "quarantine" : "connectors";
  const selectedId = params.get("source");
  const healthFilter = (params.get("health")?.split(",").filter(Boolean) ?? []) as HealthState[];

  const selected = sources.data?.find((s) => s.telemetry_source_id === selectedId) ?? null;
  const filtered = (sources.data ?? []).filter((s) => healthFilter.length === 0 || healthFilter.includes(s.health));

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
        description="Synthetic source families: Windows, Linux/syslog, firewall, cloud, identity, email. 24h counters are stream totals (see Traffic & Ingestion for live rates); the Log Explorer and this quarantine queue work over a deterministic ~72h sample. Malformed events are quarantined on arrival — never silently dropped."
      />

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "connectors" ? null : v, source: null })}>
        <TabsList>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="quarantine">
            Quarantine queue
            {quarantine.data && quarantine.data.length > 0 && (
              <Badge variant="warning" className="ml-2">
                {quarantine.data.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connectors">
          {healthFilter.length > 0 && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <Filter className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Filtered to</span>
              {healthFilter.map((h) => (
                <Badge key={h} variant="outline" className="capitalize">
                  {h}
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setParams({ health: null })}>
                <X className="size-3" />
                Clear
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="pt-5">
              {sources.isLoading ? (
                <TableSkeleton cols={7} />
              ) : filtered.length === 0 ? (
                <EmptyState title="No connectors match this filter" />
              ) : (
                <ConnectorTable sources={filtered} onSelect={(s) => setParams({ source: s.telemetry_source_id })} />
              )}
            </CardContent>
          </Card>

          {selected && <ConnectorDetail source={selected} onClose={() => setParams({ source: null })} />}
        </TabsContent>

        <TabsContent value="quarantine">
          <Card>
            <CardHeader>
              <CardTitle>Quarantined events</CardTitle>
              <p className="text-sm text-muted-foreground">
                Events (in the explorable sample) that failed schema validation, parsing, or enrichment. Preserved for
                review and dead-letter handling — the raw payload is never lost.
              </p>
            </CardHeader>
            <CardContent>
              {quarantine.isLoading && <TableSkeleton cols={4} />}
              {quarantine.isError && <QueryErrorState error={quarantine.error} onRetry={() => quarantine.refetch()} />}
              {quarantine.data?.length === 0 && (
                <EmptyState title="Quarantine queue is empty">Every event in the last 72 hours normalized successfully.</EmptyState>
              )}
              {quarantine.data && quarantine.data.length > 0 && (
                <Table containerClassName="max-h-[34rem] overflow-y-auto rounded-lg border border-border">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Family</TableHead>
                      <TableHead>Occurred</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quarantine.data.map(({ event, source_family }) => (
                      <TableRow key={event.event_id}>
                        <TableCell className="font-mono text-xs">{event.event_id}</TableCell>
                        <TableCell>
                          <FamilyLabel family={source_family} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatTimestamp(event.occurred_at)}</TableCell>
                        <TableCell className="max-w-md text-xs text-[var(--warning)]">{event.quarantine_reason}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm" className="h-7">
                            <Link href={drillHref("/log-explorer", { q: `event_id:${event.event_id}`, range: "72h", quarantined: "1" })}>
                              Inspect
                              <ArrowUpRight className="size-3" />
                            </Link>
                          </Button>
                        </TableCell>
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

function ConnectorDetail({ source, onClose }: { source: ConnectorRuntime; onClose: () => void }) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{source.connector_label}</CardTitle>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {source.connector_id} · {source.telemetry_source_id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HealthBadge health={source.health} />
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Family">
            <FamilyLabel family={source.family} />
          </Field>
          <Field label="Last event">{formatTimestamp(source.last_event_at)}</Field>
          <Field label="Ingest lag">{Math.round(source.ingestion_lag_seconds ?? 0)}s</Field>
          <Field label="Events ingested (24h, stream)">{formatCount(source.events_ingested_24h ?? 0)}</Field>
          <Field label="Schema-validation failures (24h, stream)">{formatCount(source.schema_validation_failures_24h ?? 0)}</Field>
          <Field label="Explorable sample (72h)">
            {source.sample_events.toLocaleString()} events
            {source.quarantined_in_sample > 0 ? ` · ${source.quarantined_in_sample} quarantined` : ""}
          </Field>
        </div>

        {source.health_note && (
          <div className="rounded-md border border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Health note. </span>
            {source.health_note}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button asChild variant="outline" size="sm">
            <Link href={drillHref("/log-explorer", { q: `telemetry_source_id:${source.telemetry_source_id}`, range: "24h" })}>
              Events in Log Explorer
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={drillHref("/ingestion", { source: source.telemetry_source_id })}>
              Live throughput
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
          {source.quarantined_in_sample > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={drillHref("/log-explorer", { q: `telemetry_source_id:${source.telemetry_source_id} AND normalization_status:quarantined`, range: "72h", quarantined: "1" })}>
                Quarantined events
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
