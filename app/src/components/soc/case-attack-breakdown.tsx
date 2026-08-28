"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Database } from "lucide-react";
import type { CaseTechniqueBreakdown } from "@/mock/api";
import { drillHref } from "@/lib/use-nav";
import { formatTimestamp } from "@/lib/time";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

/**
 * The case ATT&CK breakdown. A native ZenC SIEM alert cites ZenC normalized
 * events — every ref is clickable through to the Log Explorer. A third-party
 * alert cites the source's own opaque event ids: those are shown as
 * source-provided evidence with a count, never fabricated into ZenC events
 * (SKILL.md #10 — a technique claim must trace to real contributing events).
 */
export function CaseAttackBreakdown({ breakdown }: { breakdown: CaseTechniqueBreakdown[] }) {
  const [open, setOpen] = React.useState<string | null>(null);

  if (breakdown.length === 0) {
    return <p className="text-sm text-muted-foreground">No ATT&CK technique claims on the linked alerts.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {breakdown.map((t) => {
        const isOpen = open === t.technique_id;
        return (
          <li key={t.technique_id} className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : t.technique_id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span>
                <span className="font-mono text-xs text-muted-foreground">{t.technique_id}</span> {t.technique_name}
                <span className="ml-2 text-xs text-muted-foreground">· {t.tactic}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {t.traceable_refs.length > 0 && (
                  <Badge variant="outline">{t.traceable_refs.length} traceable</Badge>
                )}
                {t.source_provided_ref_count > 0 && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t.source_provided_ref_count} source-provided
                  </Badge>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-border p-2">
                {t.traceable_refs.length > 0 && (
                  <div>
                    <ul className="space-y-1">
                      {t.traceable_refs.map((r) => (
                        <li key={r.ref} className="flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-[11px]">
                          <span>
                            {r.ref}
                            {r.event_type && (
                              <span className="ml-2 text-muted-foreground">
                                {r.event_type} · {formatTimestamp(r.occurred_at)}
                              </span>
                            )}
                          </span>
                          <Button asChild variant="ghost" size="sm" className="h-6">
                            <Link href={drillHref("/log-explorer", { q: `event_id:${r.ref}`, range: "72h", quarantined: "1" })}>
                              <ArrowUpRight className="size-3" />
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant="outline" size="sm" className="mt-2 h-7">
                      <Link
                        href={drillHref("/log-explorer", {
                          q: t.traceable_refs.map((r) => `event_id:${r.ref}`).join(" OR "),
                          range: "72h",
                          quarantined: "1",
                        })}
                      >
                        Open all in Log Explorer <ArrowUpRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                )}
                {t.source_provided_ref_count > 0 && (
                  <p className="flex items-start gap-1.5 rounded bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <Database className="mt-0.5 size-3 flex-none" />
                    {t.source_provided_ref_count} contributing event{t.source_provided_ref_count === 1 ? "" : "s"} referenced by
                    the source system. ZenC SIEM did not produce this alert, so these ids are not resolvable in the Log
                    Explorer — the originating console holds them.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
