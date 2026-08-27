"use client";

import { X } from "lucide-react";
import type { NormalizedEvent } from "@/schemas";
import { useEventLineage } from "@/hooks/use-siem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { LoadingState, QueryErrorState } from "@/components/states";
import { Timeline } from "@/components/ui/timeline";
import { formatTimestamp, secondsBetween } from "@/lib/time";

export function EventDetail({
  event,
  familyOf,
  onClose,
  onSelectRelated,
}: {
  event: NormalizedEvent;
  familyOf: (id: string) => string | undefined;
  onClose: () => void;
  onSelectRelated: (e: NormalizedEvent) => void;
}) {
  const lineage = useEventLineage(event.event_id);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-semibold">{event.event_type}</h3>
            <Badge variant={event.normalization_status === "quarantined" ? "warning" : "outline"}>
              {event.normalization_status}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{event.event_id}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close detail" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 border-b border-border p-4 text-sm sm:grid-cols-2">
        <Kv k="Source family" v={familyOf(event.telemetry_source_id) ?? "unknown"} />
        <Kv k="Source ID" v={event.telemetry_source_id} mono />
        <Kv k="Occurred at" v={formatTimestamp(event.occurred_at)} mono />
        <Kv k="Ingested at" v={formatTimestamp(event.ingested_at)} mono />
        <Kv k="Ingestion lag" v={`${secondsBetween(event.occurred_at, event.ingested_at)}s`} />
        <Kv k="Parser / schema version" v={`${event.parser_version ?? "—"}  ·  schema ${event.schema_version ?? "—"}`} mono />
      </div>

      {event.quarantine_reason && (
        <div className="border-b border-border bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] p-4 text-sm text-[var(--warning)]">
          <span className="font-medium">Quarantine reason: </span>
          {event.quarantine_reason}
        </div>
      )}

      <div className="p-4">
        <Tabs defaultValue="normalized">
          <TabsList>
            <TabsTrigger value="normalized">Normalized</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
            <TabsTrigger value="lineage">Lineage &amp; related</TabsTrigger>
          </TabsList>

          <TabsContent value="normalized">
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px]">
              {JSON.stringify(event, null, 2)}
            </pre>
          </TabsContent>

          <TabsContent value="raw">
            {lineage.isLoading && <LoadingState label="Loading raw event…" />}
            {lineage.isError && <QueryErrorState error={lineage.error} onRetry={() => lineage.refetch()} />}
            {lineage.data && (
              <>
                <p className="mb-2 font-mono text-[11px] text-muted-foreground">
                  raw_payload_ref: {event.raw_payload_ref}
                </p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px]">
                  {lineage.data.raw ? JSON.stringify(lineage.data.raw, null, 2) : "Raw payload not found for this reference."}
                </pre>
              </>
            )}
          </TabsContent>

          <TabsContent value="lineage">
            {lineage.isLoading && <LoadingState label="Resolving lineage…" />}
            {lineage.data && (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Event lineage</p>
                  <Timeline
                    items={[
                      { id: "raw", tone: "muted", title: "Raw event received", meta: formatTimestamp(event.ingested_at), body: <span className="font-mono">{event.raw_payload_ref}</span> },
                      { id: "parse", tone: "info", title: "Parsed & normalized", body: <span className="font-mono">{event.parser_version ?? "—"} · schema {event.schema_version ?? "—"}</span> },
                      {
                        id: "norm",
                        tone: event.normalization_status === "quarantined" ? "warning" : "success",
                        title: `Normalized event (${event.normalization_status})`,
                        meta: formatTimestamp(event.occurred_at),
                        body: <span className="font-mono">{event.event_id}</span>,
                      },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Related events (shared host / user / IP) — {lineage.data.related.length}
                  </p>
                  {lineage.data.related.length === 0 && (
                    <p className="text-xs text-muted-foreground">No other events in this tenant share an entity with this one.</p>
                  )}
                  <ul className="space-y-1">
                    {lineage.data.related.map((r) => (
                      <li key={r.event_id}>
                        <button
                          type="button"
                          onClick={() => onSelectRelated(r)}
                          className="flex w-full items-center justify-between gap-2 rounded border border-border px-2 py-1 text-left text-xs hover:bg-accent"
                        >
                          <span className="font-mono">{r.event_type}</span>
                          <span className="text-muted-foreground">{formatTimestamp(r.occurred_at)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{k}</p>
      <p className={mono ? "mt-0.5 font-mono text-[11px]" : "mt-0.5 text-sm"}>{v}</p>
    </div>
  );
}
