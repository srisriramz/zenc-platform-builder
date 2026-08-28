"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { useHuntQuery, useOpenCaseFromHunt } from "@/hooks/use-soc";
import { useCapabilities } from "@/hooks/use-platform";
import { DEMO_NOW_ISO, formatTimestamp, minus } from "@/lib/time";
import type { HuntResult } from "@/lib/soc/hunt";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntitlementMissingState } from "@/components/states";

const EXAMPLES = [
  'entity.host:"nwb-srv-04"',
  'event_type:"authentication_failure" AND source.family:identity',
  'attack_technique_refs:"T1110"',
  'entity.ip:"203.0.113.77"',
];

export default function HuntPage() {
  const caps = useCapabilities();
  const router = useRouter();
  const hunt = useHuntQuery();
  const openCase = useOpenCaseFromHunt();

  const [query, setQuery] = React.useState('entity.host:"nwb-srv-04"');
  const [fromIso, setFromIso] = React.useState(minus(DEMO_NOW_ISO, { days: 3 }).slice(0, 16));
  const [toIso, setToIso] = React.useState(DEMO_NOW_ISO.slice(0, 16));
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [caseTitle, setCaseTitle] = React.useState("");

  const canWork = !!caps.data?.permissions.includes("case.work");
  const noSiem = caps.data && !caps.data.tenant?.entitlements.has_siem;

  const result = hunt.data?.result;
  const ok = result && !("error" in result);
  const rows = ok ? (result as HuntResult).rows : [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (caps.data && !caps.data.tenant) return <EntitlementMissingState message="Threat Hunt needs ZenC SOAR." />;

  return (
    <>
      <PageHeader
        title="Threat Hunt"
        description="Analyst-initiated queries run by the Hunt Agent against a bounded scope (safe parser only, ≤7 days, ≤5000 events). The Hunt Agent never opens a case itself — you decide whether a result becomes one."
      />

      {noSiem && (
        <div className="mb-4 rounded-lg border border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] p-3 text-sm text-muted-foreground">
          This tenant has no ZenC SIEM telemetry connected, so there is nothing local to hunt over. Hunt works on a
          tenant with connected log sources.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="hq">Search (structured, bounded — no raw code)</Label>
            <Input id="hq" value={query} onChange={(e) => setQuery(e.target.value)} className="font-mono" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setQuery(ex)} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent">
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="hf">From</Label>
              <Input id="hf" type="datetime-local" value={fromIso} onChange={(e) => setFromIso(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label htmlFor="ht">To</Label>
              <Input id="ht" type="datetime-local" value={toIso} onChange={(e) => setToIso(e.target.value)} className="h-8" />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                disabled={hunt.isPending || !query.trim()}
                onClick={() => {
                  setSelected(new Set());
                  hunt.mutate({ query: query.trim(), fromIso: new Date(fromIso).toISOString(), toIso: new Date(toIso).toISOString() });
                }}
              >
                <Play className="size-3" /> {hunt.isPending ? "Hunting…" : "Run hunt"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && "error" in result && (
        <div className="mt-4 rounded-lg border border-[color-mix(in_oklch,var(--destructive)_40%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_7%,transparent)] p-3 text-sm text-[var(--destructive)]">
          {"detail" in result ? result.detail.message : result.message}
        </div>
      )}

      {ok && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="primary">{(result as HuntResult).matched_count} matches</Badge>
            <Badge variant="outline">{(result as HuntResult).scanned_count} scanned in window</Badge>
            {(result as HuntResult).truncated && <Badge variant="warning">showing first {rows.length}</Badge>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Breakdown title="By event type" data={(result as HuntResult).by_event_type} />
            <Breakdown title="By host" data={(result as HuntResult).by_host} />
            <Breakdown title="By user" data={(result as HuntResult).by_user} />
          </div>

          {rows.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Events ({rows.length})</CardTitle>
                {canWork && selected.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} placeholder="New case title" className="h-8 w-56" />
                    <Button
                      size="sm"
                      disabled={openCase.isPending || !caseTitle.trim()}
                      onClick={() =>
                        openCase.mutate(
                          { eventIds: [...selected], title: caseTitle.trim() },
                          { onSuccess: (r) => router.push(`/cases/${r.case_id}`) },
                        )
                      }
                    >
                      Open case from {selected.size} event(s)
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Table containerClassName="max-h-[32rem] overflow-y-auto rounded-lg border border-border">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="w-44">Occurred</TableHead>
                      <TableHead>Event type</TableHead>
                      <TableHead>Entities</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.event_id} className={selected.has(e.event_id) ? "bg-accent/40" : ""}>
                        <TableCell>
                          <input type="checkbox" checked={selected.has(e.event_id)} onChange={() => toggle(e.event_id)} aria-label="select event" />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{formatTimestamp(e.occurred_at)}</TableCell>
                        <TableCell className="text-sm">{e.event_type}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {(e.entities ?? []).map((x) => `${x.entity_type}:${x.value}`).join("  ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {openCase.isError && <p className="mt-2 text-xs text-[var(--destructive)]">{(openCase.error as Error)?.message}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function Breakdown({ title, data }: { title: string; data: { key: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        {data.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-mono text-xs">{d.key}</span>
            <span className="tabular-nums text-muted-foreground">{d.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
