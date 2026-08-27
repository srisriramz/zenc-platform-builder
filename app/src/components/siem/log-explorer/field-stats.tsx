"use client";

import type { LogSearchResponse } from "@/mock/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";

export function FieldStats({
  stats,
  onAddCondition,
}: {
  stats: LogSearchResponse["fieldStats"];
  onAddCondition: (field: string, value: string) => void;
}) {
  const nonEmpty = stats.filter((s) => s.values.length > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Field statistics</CardTitle>
        <p className="text-xs text-muted-foreground">Top values across all matches in range. Click a value to add it as a filter.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {nonEmpty.length === 0 && <p className="text-xs text-muted-foreground">No fields to summarise.</p>}
        {nonEmpty.map((s) => {
          const max = Math.max(...s.values.map((v) => v.count));
          return (
            <div key={s.field}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-mono text-xs font-medium">{s.field}</span>
                <span className="text-[11px] text-muted-foreground">{s.distinct} distinct</span>
              </div>
              <ul className="space-y-1">
                {s.values.map((v) => (
                  <li key={v.value}>
                    <button
                      type="button"
                      onClick={() => onAddCondition(s.field, v.value)}
                      className="group flex w-full items-center gap-2 text-left"
                      title={`Add ${s.field}:${v.value}`}
                    >
                      <span className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                        <span
                          className="absolute inset-y-0 left-0 bg-primary/25 group-hover:bg-primary/40"
                          style={{ width: `${(v.count / max) * 100}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-between px-1.5 font-mono text-[10px]">
                          <span className="truncate">{v.value}</span>
                          <span className="tabular-nums text-muted-foreground">{v.count}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
