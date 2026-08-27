"use client";

import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, Minus, Rocket } from "lucide-react";
import { useDetectionAnalytics } from "@/hooks/use-platform";
import { drillHref } from "@/lib/use-nav";
import { formatBytes, formatCount } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { BarList, type BarDatum } from "@/components/ui/bar-list";
import { HealthBadge, FamilyLabel } from "@/components/domain-badges";
import { QueryErrorState, TableSkeleton } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendChart } from "./trend-chart";

const FAMILY_LABEL: Record<string, string> = {
  windows: "Windows",
  linux_syslog: "Linux / syslog",
  firewall: "Firewall",
  cloud: "Cloud",
  identity: "Identity",
  email: "Email",
};

export function DetectionAnalytics() {
  const q = useDetectionAnalytics();

  if (q.isError) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <TableSkeleton rows={8} cols={4} />;
  const a = q.data;

  const reasonBars: BarDatum[] = a.quarantineByReason.map((r) => ({
    key: r.reason,
    label: r.reason.replace(/_/g, " "),
    value: r.count,
    display: String(r.count),
    barClass: "bg-[var(--warning)]",
  }));
  const eventBars: BarDatum[] = a.eventTypeMix.map((e) => ({
    key: e.type,
    label: <span className="font-mono text-[11px]">{e.type}</span>,
    value: e.count,
    display: String(e.count),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingest volume — 14 days</CardTitle>
            <p className="text-sm text-muted-foreground">Stream events per day (weekday pattern). Modelled from the ingestion profile.</p>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.volumeTrend.map((d) => ({ label: d.dateIso.slice(5), value: d.events }))}
              format={(n) => formatCount(n)}
              colorVar="--primary"
              ariaLabel="Daily ingest event volume over 14 days"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ingest bandwidth — 14 days</CardTitle>
            <p className="text-sm text-muted-foreground">Bytes per day on the wire.</p>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.volumeTrend.map((d) => ({ label: d.dateIso.slice(5), value: d.bytes }))}
              format={(n) => formatBytes(n, 0)}
              colorVar="--info"
              ariaLabel="Daily ingest bandwidth over 14 days"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Telemetry family coverage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Which ATT&amp;CK-relevant data sources are collected and healthy. Honest staging — a family with no healthy
            connector is a visibility gap regardless of how many rules exist.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {a.familyCoverage.map((f) => (
              <Link
                key={f.family}
                href={drillHref("/telemetry", f.connected ? { health: f.healthy ? undefined : "degraded,stale,unknown" } : {})}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <span className="font-medium">{FAMILY_LABEL[f.family]}</span>
                {!f.connected ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Minus className="size-3.5" /> not connected
                  </span>
                ) : f.healthy ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
                    <Check className="size-3.5" /> collected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--warning)]">
                    <CircleAlert className="size-3.5" /> degraded
                  </span>
                )}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Connector reliability</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/telemetry">All connectors</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table containerClassName="rounded-lg border border-border">
            <TableHeader sticky>
              <TableRow>
                <TableHead>Connector</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Lag</TableHead>
                <TableHead className="text-right">Failed %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.sourceReliability.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={drillHref("/telemetry", { source: s.id })} className="hover:underline">
                      {s.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <FamilyLabel family={s.family} />
                  </TableCell>
                  <TableCell>
                    <HealthBadge health={s.health} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(s.lag_seconds)}s</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {(s.failed_ratio * 100).toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quarantine by cause</CardTitle>
            <p className="text-sm text-muted-foreground">Parse / schema / enrichment failures in the ~72h sample.</p>
          </CardHeader>
          <CardContent>{reasonBars.length ? <BarList data={reasonBars} /> : <p className="text-sm text-muted-foreground">No quarantined events.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Event-type mix</CardTitle>
            <p className="text-sm text-muted-foreground">Most frequent normalized event types in the sample.</p>
          </CardHeader>
          <CardContent>
            <BarList data={eventBars} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Entity risk distribution</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/entities">
                Entities
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <BarList
              data={[
                { key: "critical", label: "Critical", value: a.riskBands.critical, display: String(a.riskBands.critical), barClass: "bg-[var(--sev-critical)]" },
                { key: "high", label: "High", value: a.riskBands.high, display: String(a.riskBands.high), barClass: "bg-[var(--sev-high)]" },
                { key: "elevated", label: "Elevated", value: a.riskBands.elevated, display: String(a.riskBands.elevated), barClass: "bg-[var(--sev-medium)]" },
                { key: "low", label: "Low", value: a.riskBands.low, display: String(a.riskBands.low), barClass: "bg-[var(--sev-low)]" },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="size-4 text-primary" />
              Detection engineering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Rule health, noise indicators, per-technique detection coverage %, and detection activity (alerts by rule /
              severity / technique, MTTD as detection latency) arrive with the correlation engine and rule lifecycle.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Rule health → M3</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Detection activity → M2</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Coverage % → M5</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
