"use client";

import Link from "next/link";
import { Boxes, Database, Fingerprint, Lightbulb, ShieldQuestion } from "lucide-react";
import type { EnrichmentResult } from "@/lib/soc/enrichment";
import type { AdvisorResult } from "@/lib/soc/advisor";
import { drillHref } from "@/lib/use-nav";
import { Badge } from "@/components/ui/primitives";

const REP_VARIANT = { clean: "success", unknown: "outline", suspicious: "warning", known_bad: "danger" } as const;

export function EnrichmentPanel({ enrichment }: { enrichment: EnrichmentResult }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-muted/30 p-2.5">
        <p className="text-xs font-medium text-muted-foreground">Notable (Enrichment Agent · read-only context)</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {enrichment.notable.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <ul className="space-y-2">
        {enrichment.entities.map((e, i) => (
          <li key={i} className="rounded-md border border-border p-2 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {e.entity.entity_type} · {e.entity.value}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
              {e.asset && (
                <Badge variant="outline">
                  <Boxes className="size-3" /> {e.asset.criticality} {e.asset.asset_type.replace(/_/g, " ")} · {e.asset.owner_team}
                </Badge>
              )}
              {e.identity && (
                <Badge variant="outline">
                  <Fingerprint className="size-3" /> {e.identity.kind.replace(/_/g, " ")}
                  {e.identity.privileged ? " · privileged" : ""}
                  {e.identity.mfa_enrolled ? " · MFA" : " · no MFA"}
                </Badge>
              )}
              {e.ti && (
                <Badge variant={REP_VARIANT[e.ti.reputation]}>
                  <Database className="size-3" /> TI: {e.ti.reputation.replace("_", " ")} ({e.ti.source})
                </Badge>
              )}
              {e.prior_alert_count > 0 && (
                <Link href={drillHref("/log-explorer", { q: `entity.${e.entity.entity_type}:${e.entity.value}`, range: "72h" })} className="rounded-full border border-border px-2 py-0.5 hover:bg-accent">
                  {e.prior_alert_count} prior alert(s) · {e.prior_case_count} case(s)
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdvisorPanel({ advisor }: { advisor: AdvisorResult }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2 rounded-md border border-[color-mix(in_oklch,var(--info)_35%,var(--border))] bg-[color-mix(in_oklch,var(--info)_8%,transparent)] p-2.5">
        <Lightbulb className="mt-0.5 size-4 flex-none text-[var(--info)]" />
        <p>{advisor.recommendation}</p>
      </div>

      {advisor.suggested_tasks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Suggested next steps</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {advisor.suggested_tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {advisor.based_on.knowledge.map((k) => (
          <Badge key={k.knowledge_id} variant="outline">
            {k.title}
          </Badge>
        ))}
        <Badge variant="outline">{advisor.based_on.approved_evidence_count} approved evidence item(s)</Badge>
      </div>

      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {advisor.caveats.map((c, i) => (
          <li key={i} className="flex items-start gap-1">
            <ShieldQuestion className="mt-0.5 size-3 flex-none" />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
