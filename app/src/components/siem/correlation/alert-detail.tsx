"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { useAlertDetail } from "@/hooks/use-siem";
import { drillHref } from "@/lib/use-nav";
import { formatTimestamp, secondsBetween } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/domain-badges";
import { LoadingState, QueryErrorState } from "@/components/states";

export function AlertDetail({ envelopeId, onClose }: { envelopeId: string; onClose: () => void }) {
  const q = useAlertDetail(envelopeId);
  const [openTechnique, setOpenTechnique] = React.useState<string | null>(null);

  if (q.isLoading) return <Card className="border-primary/40"><CardContent className="pt-5"><LoadingState label="Loading alert…" /></CardContent></Card>;
  if (q.isError || !q.data) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;

  const { alert, rule, contributingEvents } = q.data;
  const eventById = new Map(contributingEvents.map((e) => [e.event_id, e] as const));
  const detectionLatency = alert.correlated_at ? secondsBetween(alert.occurred_at, alert.correlated_at) : null;

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            {alert.title}
          </CardTitle>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{alert.envelope_id}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{alert.description}</p>

        <div className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
          <Kv k="Source" v={`${alert.source.system} · ${alert.source.connector_id}`} mono />
          <Kv k="Source health" v={alert.source.health} />
          <Kv k="Schema version" v={alert.schema_version} mono />
          <Kv k="Confidence" v={alert.confidence != null ? `${Math.round(alert.confidence * 100)}%` : "—"} />
          <Kv k="Occurred" v={formatTimestamp(alert.occurred_at)} mono />
          <Kv k="Correlated" v={formatTimestamp(alert.correlated_at)} mono />
          <Kv
            k="Detection latency (MTTD stage)"
            v={detectionLatency != null ? `${detectionLatency}s (occurred → correlated)` : "—"}
          />
          <Kv k="Sector tags" v={(alert.sector_tags ?? []).join(", ") || "—"} />
          {rule && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Producing rule</p>
              <Link href={drillHref("/detections", { rule: rule.rule_id })} className="mt-0.5 inline-flex items-center gap-1 text-sm hover:underline">
                {rule.name} <span className="font-mono text-xs text-muted-foreground">v{rule.version}</span>
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
          )}
        </div>

        {/* ATT&CK technique breakdown — every claim traces to real contributing events (SKILL.md #10) */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            ATT&amp;CK technique breakdown — click a technique to see the contributing events
          </p>
          <ul className="space-y-1.5">
            {(alert.attack_techniques ?? []).map((t) => {
              const open = openTechnique === t.technique_id;
              return (
                <li key={t.technique_id} className="rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setOpenTechnique(open ? null : t.technique_id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{t.technique_id}</span> {t.technique_name}
                      <span className="ml-2 text-xs text-muted-foreground">· {t.tactic}</span>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {t.contributing_event_refs.length} event{t.contributing_event_refs.length === 1 ? "" : "s"}
                    </Badge>
                  </button>
                  {open && (
                    <div className="border-t border-border p-2">
                      <ul className="space-y-1">
                        {t.contributing_event_refs.map((ref) => {
                          const ev = eventById.get(ref);
                          return (
                            <li
                              key={ref}
                              className="flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-[11px]"
                            >
                              <span>
                                {ref}
                                {ev && <span className="ml-2 text-muted-foreground">{ev.event_type} · {formatTimestamp(ev.occurred_at)}</span>}
                              </span>
                              <Button asChild variant="ghost" size="sm" className="h-6">
                                <Link href={drillHref("/log-explorer", { q: `event_id:${ref}`, range: "72h", quarantined: "1" })}>
                                  <ArrowUpRight className="size-3" />
                                </Link>
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                      <Button asChild variant="outline" size="sm" className="mt-2 h-7">
                        <Link href={drillHref("/log-explorer", { q: t.contributing_event_refs.map((r) => `event_id:${r}`).join(" OR "), range: "72h", quarantined: "1" })}>
                          Open all in Log Explorer
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(alert.entities ?? []).map((e, i) => (
            <Link
              key={i}
              href={drillHref("/log-explorer", { q: `entity.${e.entity_type}:${e.value}`, range: "72h" })}
              className="rounded border border-border px-2 py-0.5 font-mono text-[11px] transition-colors hover:bg-accent"
            >
              <span className="text-muted-foreground">{e.entity_type}</span> {e.value}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{k}</p>
      <p className={mono ? "mt-0.5 font-mono text-[11px]" : "mt-0.5 text-sm"}>{v ?? "—"}</p>
    </div>
  );
}
