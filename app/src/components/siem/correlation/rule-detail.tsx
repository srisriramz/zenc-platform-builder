"use client";

import Link from "next/link";
import { ArrowUpRight, Lock, X } from "lucide-react";
import { useRuleDetail } from "@/hooks/use-siem";
import { drillHref } from "@/lib/use-nav";
import type { RuleDefinition } from "@/lib/correlation/types";
import type { EventMatch } from "@/lib/correlation/match";
import { formatTimestamp } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { LifecycleBadge, SeverityBadge } from "@/components/domain-badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState, QueryErrorState } from "@/components/states";

const LIFECYCLE = ["draft", "test", "peer_review", "approved", "enabled", "disabled", "retired"] as const;

export function RuleDetail({ ruleId, onClose }: { ruleId: string; onClose: () => void }) {
  const q = useRuleDetail(ruleId);
  if (q.isLoading) return <Card><CardContent className="pt-5"><LoadingState label="Loading rule…" /></CardContent></Card>;
  if (q.isError || !q.data) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;

  const { rule, alerts } = q.data;
  const def = rule.definition as unknown as RuleDefinition;
  const reg = rule.regression_test_results?.[rule.regression_test_results.length - 1];
  const currentStageIdx = LIFECYCLE.indexOf(rule.lifecycle_state);

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {rule.name}
            <LifecycleBadge state={rule.lifecycle_state} />
            {rule.severity && <SeverityBadge severity={rule.severity} />}
          </CardTitle>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {rule.rule_id} · v{rule.version} · proposed by {rule.proposed_by ?? "—"}
            {rule.enabled_by && ` · enabled by ${rule.enabled_by}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* lifecycle rail */}
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {LIFECYCLE.map((s, i) => (
            <span
              key={s}
              className={
                i === currentStageIdx
                  ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                  : i < currentStageIdx
                    ? "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                    : "rounded-full border border-border px-2 py-0.5 text-muted-foreground/60"
              }
            >
              {s.replace("_", " ")}
            </span>
          ))}
        </div>

        {rule.lifecycle_state !== "enabled" && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 flex-none" />
            <span>
              The transition to <span className="font-medium text-foreground">enabled</span> is a human-only action —
              enforced at the schema/validation layer, not just the UI. The Detection Engineer Agent can propose, test,
              and submit for review, but never enable. Full authoring + regression workflow arrives in{" "}
              <span className="font-medium text-foreground">M3</span>.
            </span>
          </div>
        )}

        {/* structured definition */}
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Rule logic (structured — never free code)</p>
          <RuleDefinitionView def={def} />
        </div>

        {/* mappings */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">ATT&amp;CK (canonical mapping)</p>
            <ul className="space-y-1 text-sm">
              {rule.attack_mapping.map((m) => (
                <li key={m.technique_id}>
                  <span className="font-mono text-xs text-muted-foreground">{m.technique_id}</span> {m.technique_name}
                  <span className="ml-1 text-xs text-muted-foreground">· {m.tactic}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">D3FEND (detect side)</p>
            {rule.d3fend_mapping && rule.d3fend_mapping.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {rule.d3fend_mapping.map((d) => (
                  <li key={d.d3fend_technique_id}>
                    <span className="font-mono text-xs text-muted-foreground">{d.d3fend_technique_id}</span>{" "}
                    {d.d3fend_technique_name}
                  </li>
                ))}
              </ul>
            ) : rule.d3fend_unmapped ? (
              <p className="text-sm text-muted-foreground">Explicitly unmapped.</p>
            ) : (
              <p className="text-sm text-[var(--warning)]">Missing — an enabled rule must map or be explicitly unmapped.</p>
            )}
          </div>
        </div>

        {/* regression */}
        {reg && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Latest regression test — {formatTimestamp(reg.run_at)}
              <Badge variant={reg.rule_health === "healthy" ? "success" : reg.rule_health === "failing" ? "danger" : "warning"} className="ml-2">
                {reg.rule_health.replace("_", " ")}
              </Badge>
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Metric label="Evaluated" v={reg.events_evaluated.toLocaleString()} />
              <Metric label="Expected" v={String(reg.expected_matches)} />
              <Metric label="Observed" v={String(reg.observed_matches)} />
              <Metric label="Missed" v={String(reg.missed_expected)} tone={reg.missed_expected ? "warn" : undefined} />
              <Metric label="Unexpected" v={String(reg.unexpected_matches)} tone={reg.unexpected_matches ? "warn" : undefined} />
              <Metric label="Noise" v={reg.noise_indicator != null ? reg.noise_indicator.toFixed(2) : "—"} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A rule existing and firing in a test does not by itself prove detection quality.
            </p>
          </div>
        )}

        {/* version history */}
        {rule.history && rule.history.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Lifecycle history</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {rule.history.map((h, i) => (
                <li key={i}>
                  {formatTimestamp(h.changed_at)} — {h.from_state} → <span className="text-foreground">{h.to_state}</span> by{" "}
                  <span className="font-mono">{h.changed_by}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* fired alerts */}
        {alerts.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Alerts fired ({alerts.length})</p>
            <Table containerClassName="rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Detected</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.slice(0, 8).map((a) => (
                  <TableRow key={a.envelope_id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {formatTimestamp(a.correlated_at ?? a.occurred_at)}
                    </TableCell>
                    <TableCell className="text-sm">{a.description}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="h-7">
                        <Link href={drillHref("/correlation", { alert: a.envelope_id })}>
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuleDefinitionView({ def }: { def: RuleDefinition }) {
  const matchLine = (m: EventMatch) => {
    const parts: string[] = [];
    if (m.event_type) parts.push(`event_type ∈ {${m.event_type.join(", ")}}`);
    if (m.event_type_glob) parts.push(`event_type ~ ${m.event_type_glob}`);
    if (m.source_family) parts.push(`source.family ∈ {${m.source_family.join(", ")}}`);
    if (m.requires_entity) parts.push(`has entity.${m.requires_entity}`);
    if (m.attack_technique_any) parts.push(`tagged {${m.attack_technique_any.join(", ")}}`);
    if (m.time_of_day) parts.push(`hour ∈ [${m.time_of_day.after_hour}, ${m.time_of_day.before_hour}) UTC`);
    if (m.external_ip) parts.push("external IP present");
    return parts.join(" AND ") || "any event";
  };

  return (
    <div className="space-y-1.5 font-mono text-xs">
      {def.kind === "single_event" && <p>WHEN {matchLine(def.match)}</p>}
      {def.kind === "threshold" && (
        <>
          <p>WHEN {matchLine(def.match)}</p>
          <p>
            GROUP BY {def.group_by} · COUNT ≥ {def.threshold} WITHIN {def.window_seconds}s
          </p>
        </>
      )}
      {def.kind === "sequence" && (
        <>
          {def.steps.map((s, i) => (
            <p key={i}>
              STEP {i + 1}: {matchLine(s.match)}
            </p>
          ))}
          <p>
            JOINED BY {def.join_by} · IN ORDER WITHIN {def.within_seconds}s
          </p>
        </>
      )}
      {def.kind === "entity_join" && (
        <>
          <p>LEFT: {matchLine(def.left)}</p>
          <p>RIGHT: {matchLine(def.right)}</p>
          <p>
            JOINED BY {def.join_by} · WITHIN {def.within_seconds}s
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, v, tone }: { label: string; v: string; tone?: "warn" }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${tone === "warn" ? "text-[var(--warning)]" : ""}`}>{v}</p>
    </div>
  );
}
