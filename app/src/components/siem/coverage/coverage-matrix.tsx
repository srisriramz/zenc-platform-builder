"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronRight, ShieldCheck, Zap } from "lucide-react";
import type { CoverageMatrixView } from "@/mock/api";
import type { CoverageRow, CoverageStage } from "@/lib/coverage/matrix";
import { STAGE_LABEL } from "@/lib/coverage/matrix";
import { drillHref } from "@/lib/use-nav";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

const STAGE_STYLE: Record<CoverageStage, string> = {
  no_telemetry: "bg-muted text-muted-foreground",
  telemetry: "bg-[color-mix(in_oklch,var(--info)_16%,transparent)] text-[var(--info)]",
  activity: "bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[var(--warning)]",
  detected: "bg-[color-mix(in_oklch,var(--info)_22%,transparent)] text-[var(--info)]",
  correlated: "bg-[color-mix(in_oklch,var(--success)_20%,transparent)] text-[var(--success)]",
};

export function StageBadge({ stage }: { stage: CoverageStage }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", STAGE_STYLE[stage])}>{STAGE_LABEL[stage]}</span>;
}

export function TacticHeatStrip({ data }: { data: CoverageMatrixView }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {data.byTactic.map((g) => {
        const total = g.rows.length;
        const detPct = Math.round((g.detected / total) * 100);
        const respPct = Math.round((g.responded / total) * 100);
        return (
          <div key={g.tactic.tactic_id} className="rounded-md border border-border p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{g.tactic.name}</span>
              <span className="text-muted-foreground">{g.detected}/{total} detected</span>
            </div>
            <div className="mt-1.5 space-y-1">
              <Bar label="detect" pct={detPct} tone="var(--success)" />
              {data.has_soc && <Bar label="respond" pct={respPct} tone="var(--info)" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: `color-mix(in oklch, ${tone} 70%, transparent)` }} />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function CoverageMatrixTable({
  data,
  gapsOnly,
}: {
  data: CoverageMatrixView;
  gapsOnly: boolean;
}) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups = data.byTactic
    .map((g) => ({ ...g, rows: gapsOnly ? g.rows.filter((r) => !r.detected || (data.has_soc && !r.responded)) : g.rows }))
    .filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No gaps — every in-scope technique has an enabled rule{data.has_soc ? " and a response playbook" : ""}.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.tactic.tactic_id}>
          <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.tactic.name}
            <span className="font-normal normal-case">
              {g.detected}/{g.rows.length} detected{data.has_soc ? ` · ${g.responded}/${g.rows.length} response` : ""}
            </span>
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <ul className="min-w-[34rem]">
              {g.rows.map((r) => (
                <TechniqueRow key={`${g.tactic.tactic_id}:${r.technique_id}`} r={r} hasSoc={data.has_soc} open={open.has(r.technique_id)} onToggle={() => toggle(r.technique_id)} />
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function TechniqueRow({ r, hasSoc, open, onToggle }: { r: CoverageRow; hasSoc: boolean; open: boolean; onToggle: () => void }) {
  const expandable = r.detecting_rules.length > 0 || r.responding_playbooks.length > 0;
  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", expandable && "hover:bg-accent", r.is_sub_technique && "pl-7")}
      >
        <span className="w-3 shrink-0 text-muted-foreground">{expandable ? (open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />) : null}</span>
        <span className="font-mono text-xs text-muted-foreground">{r.technique_id}</span>
        <span className="flex-1 truncate">{r.name}</span>
        <StageBadge stage={r.stage} />
        <span className="flex w-24 shrink-0 items-center justify-end gap-1">
          {r.detected ? (
            <Badge variant={r.correlated ? "success" : "info"} className="gap-1">
              <Zap className="size-3" /> {r.correlated ? "firing" : "rule"}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">no rule</span>
          )}
        </span>
        {hasSoc && (
          <span className="flex w-20 shrink-0 items-center justify-end">
            {r.responded ? (
              <Badge variant="primary" className="gap-1">
                <ShieldCheck className="size-3" /> response
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 bg-muted/30 px-3 py-2 pl-10 text-xs">
          {!r.telemetry && (
            <p className="text-muted-foreground">
              No connected telemetry for this technique&rsquo;s data sources ({r.data_source_families.join(", ")}).
            </p>
          )}
          {r.detecting_rules.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Detecting rules</p>
              <ul className="mt-0.5 space-y-0.5">
                {r.detecting_rules.map((rule) => (
                  <li key={rule.rule_id}>
                    <Link href={drillHref("/detections", { rule: rule.rule_id })} className="inline-flex items-center gap-1 hover:underline">
                      {rule.name} {rule.fired ? <Badge variant="success">firing</Badge> : <Badge variant="outline">no alerts on sample</Badge>}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
              {r.detect_d3fend.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  Detect-side D3FEND: {r.detect_d3fend.map((d) => `${d.id} ${d.name}`).join(", ")}
                </p>
              )}
            </div>
          )}
          {r.responding_playbooks.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Response playbooks</p>
              <ul className="mt-0.5 space-y-0.5">
                {r.responding_playbooks.map((p) => (
                  <li key={p.playbook_id}>
                    <Link href={drillHref("/playbooks", { playbook: p.playbook_id })} className="inline-flex items-center gap-1 hover:underline">
                      {p.name}
                      <ArrowUpRight className="size-3" />
                    </Link>
                    <span className="ml-1 text-muted-foreground">— {p.d3fend.map((d) => d.id).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
