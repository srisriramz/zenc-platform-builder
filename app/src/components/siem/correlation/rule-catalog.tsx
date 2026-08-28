"use client";

import type { RuleView } from "@/mock/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/primitives";
import { LifecycleBadge, SeverityBadge } from "@/components/domain-badges";

const RULE_TYPE_LABEL: Record<string, string> = {
  single_event: "Single event",
  sequence: "Sequence",
  threshold: "Threshold",
  aggregation: "Aggregation",
  field_join: "Field join",
  entity_join: "Entity join",
  time_window: "Time window",
  suppression: "Suppression",
};

export function RuleCatalog({
  rules,
  selectedId,
  onSelect,
}: {
  rules: RuleView[];
  selectedId?: string | null;
  onSelect?: (r: RuleView) => void;
}) {
  return (
    <Table containerClassName="rounded-lg border border-border">
      <TableHeader sticky>
        <TableRow>
          <TableHead>Rule</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Lifecycle</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>ATT&amp;CK</TableHead>
          <TableHead>D3FEND</TableHead>
          <TableHead className="text-right">Fired</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((r) => (
          <TableRow
            key={r.rule_id}
            data-state={selectedId === r.rule_id ? "selected" : undefined}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={() => onSelect?.(r)}
          >
            <TableCell>
              <div className="font-medium">{r.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {r.rule_id} · v{r.version}
                {r.proposed_by === "detection-engineer-agent" && (
                  <span className="ml-1 text-primary">· agent-proposed</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{RULE_TYPE_LABEL[r.rule_type] ?? r.rule_type}</TableCell>
            <TableCell>
              <LifecycleBadge state={r.lifecycle_state} />
            </TableCell>
            <TableCell>{r.severity ? <SeverityBadge severity={r.severity} /> : "—"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {r.attack_mapping.slice(0, 2).map((m) => (
                  <Badge key={m.technique_id} variant="outline" className="font-mono text-[10px]">
                    {m.technique_id}
                  </Badge>
                ))}
                {r.attack_mapping.length > 2 && (
                  <span className="text-[11px] text-muted-foreground">+{r.attack_mapping.length - 2}</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              {r.d3fend_mapping && r.d3fend_mapping.length > 0 ? (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {r.d3fend_mapping[0].d3fend_technique_id}
                </Badge>
              ) : r.d3fend_unmapped ? (
                <span className="text-[11px] text-muted-foreground">unmapped</span>
              ) : (
                <span className="text-[11px] text-[var(--warning)]">missing</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.lifecycle_state === "enabled" ? (
                <span className={r.fired_count ? "font-medium" : "text-muted-foreground"}>{r.fired_count}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
